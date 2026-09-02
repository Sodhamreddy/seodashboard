import { getGoogleAccessToken } from './googleAuth';

/**
 * Search Console Search Analytics — real ranking data, free.
 *
 * This is the cheapest route to live rank tracking: the connected Google account
 * already carries the `webmasters` scope, so no paid rank-tracker key is needed.
 *
 * WHAT GSC GIVES, HONESTLY: query, average position, clicks, impressions, CTR —
 * all real, all measured. WHAT IT DOES NOT GIVE: search volume, keyword
 * difficulty, CPC. Those are rank-tracker/ads-planner metrics and are reported
 * as `null` rather than invented, which is why `KeywordRow` makes them nullable.
 *
 * Two caveats worth knowing when reading the numbers:
 *  - Data lags ~2 days, so every window ends 3 days back rather than today.
 *  - "Average position" is averaged over impressions in the window, so it moves
 *    more smoothly than a daily rank check would.
 */

const API_ROOT = 'https://www.googleapis.com/webmasters/v3';

/** GSC is queried on every render of a force-dynamic page; cache briefly. */
/* 5 minutes — see the note in providers/ads.ts. */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type SearchAnalyticsRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function token() {
  const connected = await getGoogleAccessToken();
  return connected ?? process.env.GSC_ACCESS_TOKEN?.trim() ?? null;
}

/** Every property this account can read, so a domain can be matched to one. */
export async function listProperties(): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const accessToken = await token();
  if (!accessToken) return [];

  return cached('sites', async () => {
    const response = await fetch(`${API_ROOT}/sites`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      siteEntry?: { siteUrl: string; permissionLevel: string }[];
    };
    return body.siteEntry ?? [];
  });
}

/**
 * Pick the Search Console property that corresponds to a domain.
 *
 * GSC_SITE_URL is honoured only when it actually matches the domain being
 * viewed — otherwise switching client in the top bar would keep reporting the
 * property hardcoded in the env file, which is worse than reporting nothing.
 * Unverified properties are skipped because Search Analytics 403s on them.
 */
export async function resolvePropertyForDomain(domain: string): Promise<string | null> {
  const bare = domain.replace(/^www\./, '').toLowerCase();

  const configured = process.env.GSC_SITE_URL?.trim();
  if (configured && configured.toLowerCase().includes(bare)) return configured;

  const properties = (await listProperties()).filter(
    (property) => property.permissionLevel !== 'siteUnverifiedUser',
  );

  // Most specific first: a domain property covers every subdomain and protocol.
  return (
    properties.find((property) => property.siteUrl === `sc-domain:${bare}`)?.siteUrl ??
    properties.find((property) => property.siteUrl === `https://${bare}/`)?.siteUrl ??
    properties.find((property) => property.siteUrl === `https://www.${bare}/`)?.siteUrl ??
    properties.find((property) => property.siteUrl.toLowerCase().includes(bare))?.siteUrl ??
    null
  );
}

export async function searchAnalytics(
  siteUrl: string,
  body: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    rowLimit?: number;
    dimensionFilterGroups?: unknown[];
  },
): Promise<SearchAnalyticsRow[]> {
  const accessToken = await token();
  if (!accessToken) return [];

  const response = await fetch(
    `${API_ROOT}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(`Search Console ${response.status}: ${String(message).slice(0, 200)}`);
  }

  const payload = (await response.json()) as { rows?: SearchAnalyticsRow[] };
  return payload.rows ?? [];
}

/** GSC data lags a couple of days; anchor every window 3 days back. */
function isoDaysBack(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export type GscKeywordData = {
  siteUrl: string;
  /** Current window, one row per query. */
  current: SearchAnalyticsRow[];
  /** Same-length window immediately before it, for position change. */
  previous: SearchAnalyticsRow[];
  /** query -> 12 weekly average positions, oldest first, null where no impressions. */
  history: Map<string, (number | null)[]>;
  windowDays: number;
};

const HISTORY_WEEKS = 12;

/**
 * Everything the keyword report needs, in three calls.
 *
 * The per-query history is a `['query','date']` pull bucketed into weeks. It is
 * restricted to the queries already in `current` so the row count stays well
 * inside GSC's 25k limit instead of scaling with the whole account.
 */
export async function getGscKeywordData(
  domain: string,
  options: { windowDays?: number; limit?: number } = {},
): Promise<GscKeywordData | null> {
  const siteUrl = await resolvePropertyForDomain(domain);
  if (!siteUrl) return null;

  const windowDays = options.windowDays ?? 28;
  const limit = options.limit ?? 100;

  const endDate = isoDaysBack(3);
  const startDate = isoDaysBack(3 + windowDays - 1);
  const previousEnd = isoDaysBack(3 + windowDays);
  const previousStart = isoDaysBack(3 + windowDays * 2 - 1);
  const historyStart = isoDaysBack(3 + HISTORY_WEEKS * 7 - 1);

  const [current, previous, daily] = await Promise.all([
    searchAnalytics(siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: limit }),
    searchAnalytics(siteUrl, {
      startDate: previousStart,
      endDate: previousEnd,
      dimensions: ['query'],
      rowLimit: limit * 2,
    }),
    searchAnalytics(siteUrl, {
      startDate: historyStart,
      endDate: endDate,
      dimensions: ['query', 'date'],
      rowLimit: 25_000,
    }),
  ]);

  // Bucket daily rows into `HISTORY_WEEKS` slots, averaging position per week.
  const tracked = new Set(current.map((row) => row.keys[0]));
  const historyEnd = new Date(`${endDate}T00:00:00Z`).getTime();
  const sums = new Map<string, { total: number; count: number }[]>();

  for (const row of daily) {
    const [query, date] = row.keys;
    if (!tracked.has(query)) continue;

    const dayIndex = Math.floor((historyEnd - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);
    const weekFromEnd = Math.floor(dayIndex / 7);
    if (weekFromEnd < 0 || weekFromEnd >= HISTORY_WEEKS) continue;
    const slot = HISTORY_WEEKS - 1 - weekFromEnd;

    if (!sums.has(query)) {
      sums.set(
        query,
        Array.from({ length: HISTORY_WEEKS }, () => ({ total: 0, count: 0 })),
      );
    }
    const bucket = sums.get(query)![slot];
    bucket.total += row.position;
    bucket.count += 1;
  }

  const history = new Map<string, (number | null)[]>();
  for (const [query, buckets] of sums) {
    history.set(
      query,
      buckets.map((bucket) =>
        bucket.count > 0 ? Number((bucket.total / bucket.count).toFixed(1)) : null,
      ),
    );
  }

  return { siteUrl, current, previous, history, windowDays };
}

/* ── Site-level performance, for the report builder's GSC widgets ───── */

export type GscPerformance = {
  siteUrl: string;
  windowDays: number;
  /** One row per day, oldest first. `ctr` is 0–100, matching the app convention. */
  daily: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  /** Top queries by clicks over the window. */
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

/**
 * Whole-property clicks / impressions / CTR / position, by day and by query.
 *
 * Separate from `getGscKeywordData` because that function is shaped for the
 * keyword table — it pulls per-query rows and a weekly position history, and it
 * has no daily site totals to give a time-series widget. This is two calls:
 * one `['date']` for the series, one `['query']` for the table.
 *
 * Returns `null` when no Search Console property matches the domain, which the
 * caller reports as "no property for this domain" rather than "not connected" —
 * those are different problems with different fixes.
 */
export async function getGscPerformance(
  domain: string,
  options: {
    windowDays?: number;
    limit?: number;
    /** Explicit calendar window; overrides `windowDays` when present. */
    window?: { from: string; to: string };
  } = {},
): Promise<GscPerformance | null> {
  const siteUrl = await resolvePropertyForDomain(domain);
  if (!siteUrl) return null;

  const windowDays = options.windowDays ?? 28;
  const limit = options.limit ?? 25;

  // Same 3-day lag anchor as the keyword pull, so the two never disagree about
  // which window "last 30 days" means.
  // An explicit window is used verbatim. The 3-day lag anchor only applies to
  // rolling windows, where "today" has no data yet.
  const endDate = options.window ? options.window.to : isoDaysBack(3);
  const startDate = options.window ? options.window.from : isoDaysBack(3 + windowDays - 1);

  const cacheKey = options.window
    ? `gsc:perf:${siteUrl}:${startDate}:${endDate}:${limit}`
    : `gsc:perf:${siteUrl}:${windowDays}:${limit}`;

  return cached(cacheKey, async () => {
    const [dateRows, queryRows] = await Promise.all([
      searchAnalytics(siteUrl, { startDate, endDate, dimensions: ['date'], rowLimit: 500 }),
      searchAnalytics(siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: limit }),
    ]);

    const daily = dateRows
      .map((row) => ({
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number((row.ctr * 100).toFixed(2)),
        position: Number(row.position.toFixed(1)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const clicks = daily.reduce((sum, day) => sum + day.clicks, 0);
    const impressions = daily.reduce((sum, day) => sum + day.impressions, 0);

    // Position is averaged across days weighted by impressions — a plain mean
    // would let a single low-impression day swing the figure.
    const weighted = daily.reduce((sum, day) => sum + day.position * day.impressions, 0);

    return {
      siteUrl,
      windowDays,
      daily,
      totals: {
        clicks,
        impressions,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        position: impressions > 0 ? Number((weighted / impressions).toFixed(1)) : 0,
      },
      queries: queryRows.map((row) => ({
        query: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Number((row.ctr * 100).toFixed(2)),
        position: Number(row.position.toFixed(1)),
      })),
    };
  });
}
