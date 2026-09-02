import { missingIdReason, providerIdsFor } from '../client-config';
import { getGoogleAccessToken } from './googleAuth';

/**
 * Google Analytics 4 adapter.
 *
 * Two Google APIs are involved and they are easy to confuse:
 *   • Admin API  (analyticsadmin.googleapis.com)  — lists which properties the
 *     signed-in account can see. Used once, to resolve a property for a domain.
 *   • Data API   (analyticsdata.googleapis.com)   — the actual numbers, via
 *     `runReport`.
 *
 * Both need the `analytics.readonly` scope, which is NOT covered by the
 * Search Console or Ads scopes. A connection granted before that scope was
 * added returns 403 here, and the caller surfaces that as "reconnect Google"
 * rather than as an empty chart.
 */

const ADMIN_ROOT = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_ROOT = 'https://analyticsdata.googleapis.com/v1beta';

/** GA4 is queried on every render of a force-dynamic page; cache briefly. */
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

/**
 * Why GA4 is unavailable, when it is. These are distinct problems with distinct
 * fixes, and the UI shows the difference — "no property" is the operator's job,
 * "scope" needs a re-consent, "disabled" needs a Cloud console change.
 */
export type Ga4Failure =
  | { kind: 'not-connected' }
  | { kind: 'scope-missing' }
  | { kind: 'api-disabled'; detail: string }
  | { kind: 'no-property'; detail: string }
  | { kind: 'error'; detail: string };

export type Ga4Property = { id: string; displayName: string; account: string };

export type Ga4Report = {
  propertyId: string;
  propertyName: string;
  /**
   * Other properties that also looked like a match. Surfaced so the UI can say
   * which one it picked and offer the alternatives, rather than silently
   * choosing — picking by name alone is what put an empty property on screen.
   */
  alternatives: Ga4Property[];
  /** How the property was chosen, for the UI to explain itself. */
  resolvedBy: 'override' | 'only-property' | 'has-data' | 'name-match';
  windowDays: number;
  /** One row per day, oldest first. `bounceRate` is 0–100 per app convention. */
  daily: {
    date: string;
    sessions: number;
    users: number;
    pageviews: number;
    bounceRate: number;
  }[];
  totals: {
    sessions: number;
    users: number;
    newUsers: number;
    /** Users active in the window — always <= `users`. */
    activeUsers: number;
    pageviews: number;
    bounceRate: number;
    /** Seconds. `format.duration` expects milliseconds, so callers scale it. */
    avgSessionSeconds: number;
  };
  channels: { channel: string; sessions: number }[];
  pages: { path: string; sessions: number; bounceRate: number }[];
};

function isoDaysBack(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Distinguishes a scope/permission failure from a genuine error. */
function classify(status: number, body: string): Ga4Failure {
  const lower = body.toLowerCase();
  if (status === 401) return { kind: 'not-connected' };
  if (status === 403) {
    if (lower.includes('has not been used') || lower.includes('is disabled')) {
      return { kind: 'api-disabled', detail: body.slice(0, 300) };
    }
    // A 403 with an insufficient-scope or permission message means the token is
    // valid but was not granted analytics access.
    return { kind: 'scope-missing' };
  }
  return { kind: 'error', detail: `${status}: ${body.slice(0, 200)}` };
}

async function adminGet(path: string, accessToken: string) {
  const response = await fetch(`${ADMIN_ROOT}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw classify(response.status, await response.text());
  return response.json();
}

/** Every GA4 property the connected account can read. */
export async function listGa4Properties(): Promise<Ga4Property[] | Ga4Failure> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  try {
    return await cached('ga4:properties', async () => {
      const payload = (await adminGet('/accountSummaries?pageSize=200', accessToken)) as {
        accountSummaries?: {
          displayName?: string;
          propertySummaries?: { property?: string; displayName?: string }[];
        }[];
      };

      const out: Ga4Property[] = [];
      for (const account of payload.accountSummaries ?? []) {
        for (const property of account.propertySummaries ?? []) {
          // `property` arrives as "properties/123456789".
          const id = (property.property ?? '').split('/')[1];
          if (!id) continue;
          out.push({
            id,
            displayName: property.displayName ?? id,
            account: account.displayName ?? '',
          });
        }
      }
      return out;
    });
  } catch (error) {
    return isFailure(error) ? error : { kind: 'error', detail: String(error).slice(0, 200) };
  }
}

function isFailure(value: unknown): value is Ga4Failure {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

/**
 * Sessions in the last 28 days, or -1 if the property cannot be read.
 *
 * Used only to break a tie between similarly-named properties. It is one tiny
 * `runReport` per candidate and the result is cached, so the cost is a few
 * hundred bytes on the first render after a restart.
 */
async function probeSessions(propertyId: string, accessToken: string): Promise<number> {
  try {
    const rows = await runReport(propertyId, accessToken, {
      dateRanges: [{ startDate: '28daysAgo', endDate: 'today' }],
      metrics: [{ name: 'sessions' }],
    });
    return rows.length > 0 ? num(rows[0], 0) : 0;
  } catch {
    return -1;
  }
}

export type Ga4Resolution = {
  property: Ga4Property;
  alternatives: Ga4Property[];
  resolvedBy: Ga4Report['resolvedBy'];
};

/**
 * Picks the property for a domain.
 *
 * Name matching alone is not good enough, and this is why: the AHNS account
 * holds three properties whose names all resemble the domain, and the one
 * literally named "myassuredhomenursing.com" is empty while "Assured Home
 * Nursing" carries every session. Choosing on name put zeroes on screen under a
 * green "live" banner.
 *
 * Order of preference:
 *   1. `GA4_PROPERTY_ID` — explicit, always wins, no API calls.
 *   2. The only property on the account.
 *   3. Among name matches, the one that actually has sessions.
 *   4. The first name match, when none of them have data.
 *
 * Step 3 costs one tiny `runReport` per candidate and only runs when the name
 * is ambiguous, which is exactly when it is needed.
 */
export async function resolveGa4Property(
  domain: string,
): Promise<Ga4Resolution | Ga4Failure> {
  /*
   * The property comes from the client's own record. It used to come from
   * `GA4_PROPERTY_ID`, which is a single global value — with three clients
   * saved that reported the first client's sessions under every other client's
   * name. `providerIdsFor` only falls back to the env var while one client
   * exists, so it can no longer leak across clients.
   */
  const ids = await providerIdsFor(domain);
  const override = ids.ga4PropertyId;
  if (override) {
    const id = override.replace(/^properties\//, '');
    // The display name is looked up when cheap, so the UI can name the property
    // rather than echoing the domain back at the operator.
    const known = await listGa4Properties();
    const named = !isFailure(known) ? known.find((property) => property.id === id) : undefined;
    return {
      property: named ?? { id, displayName: `Property ${id}`, account: '' },
      alternatives: [],
      resolvedBy: 'override',
    };
  }

  const properties = await listGa4Properties();
  if (isFailure(properties)) return properties;
  if (properties.length === 0) {
    return {
      kind: 'no-property',
      detail: 'The connected Google account has no GA4 properties.',
    };
  }

  /*
   * With several clients on the roster, guessing by name is not acceptable:
   * "Assured Home Nursing" would happily match a different client's property.
   * Require an explicit id instead.
   */
  if (ids.multiClient) {
    return {
      kind: 'no-property',
      detail: missingIdReason('Google Analytics 4', ids, 'GA4 property ID'),
    };
  }
  if (properties.length === 1) {
    return { property: properties[0], alternatives: [], resolvedBy: 'only-property' };
  }

  const bare = domain.replace(/^www\./, '').toLowerCase();
  const label = bare.split('.')[0];
  const tokens = label.split(/[^a-z0-9]+/).filter((part) => part.length > 3);

  // Any property whose name references the domain, its bare label, or the
  // words in that label ("myassuredhomenursing" -> matches "Assured Home
  // Nursing" once spaces are ignored).
  const candidates = properties.filter((property) => {
    const name = property.displayName.toLowerCase();
    const squashed = name.replace(/[^a-z0-9]/g, '');
    return (
      name.includes(bare) ||
      name.includes(label) ||
      squashed.includes(label) ||
      label.includes(squashed) ||
      tokens.some((token) => squashed.includes(token))
    );
  });

  if (candidates.length === 0) {
    return {
      kind: 'no-property',
      detail: `None of the ${properties.length} GA4 properties match ${domain}. Set GA4_PROPERTY_ID to pick one.`,
    };
  }
  if (candidates.length === 1) {
    return { property: candidates[0], alternatives: [], resolvedBy: 'name-match' };
  }

  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  const probed = await cached(`ga4:probe:${bare}`, async () => {
    const sessions = await Promise.all(
      candidates.map((property) => probeSessions(property.id, accessToken)),
    );
    return candidates
      .map((property, index) => ({ property, sessions: sessions[index] }))
      .sort((a, b) => b.sessions - a.sessions);
  });

  const best = probed[0];
  const alternatives = probed.slice(1).map((entry) => entry.property);

  // All empty (or unreadable): fall back to the name match rather than
  // reporting "no property", since the operator may simply have no traffic yet.
  if (!best || best.sessions <= 0) {
    return { property: candidates[0], alternatives: candidates.slice(1), resolvedBy: 'name-match' };
  }

  return { property: best.property, alternatives, resolvedBy: 'has-data' };
}

type RunReportRow = {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
};

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<RunReportRow[]> {
  const response = await fetch(`${DATA_ROOT}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw classify(response.status, await response.text());
  const payload = (await response.json()) as { rows?: RunReportRow[] };
  return payload.rows ?? [];
}

const num = (row: RunReportRow, index: number) => Number(row.metricValues?.[index]?.value ?? 0);
const dim = (row: RunReportRow, index: number) => row.dimensionValues?.[index]?.value ?? '';

/**
 * Everything the traffic widgets need, in four `runReport` calls: a daily
 * series, window totals, a channel breakdown and a landing-page table.
 */
export async function getGa4Report(
  domain: string,
  options: { windowDays?: number; window?: { from: string; to: string } } = {},
): Promise<Ga4Report | Ga4Failure> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  const resolution = await resolveGa4Property(domain);
  if (isFailure(resolution)) return resolution;
  const { property, alternatives, resolvedBy } = resolution;

  /*
   * An explicit window wins over the day count. Without this a custom range of
   * "1 July to 31 July" would be converted to 31 days and reported as the last
   * 31 days — plausible-looking numbers for entirely the wrong month.
   */
  const windowDays = options.windowDays ?? 30;
  const dateRanges = options.window
    ? [{ startDate: options.window.from, endDate: options.window.to }]
    : [{ startDate: isoDaysBack(windowDays), endDate: 'today' }];

  try {
    const cacheKey = options.window
      ? `ga4:report:${property.id}:${options.window.from}:${options.window.to}`
      : `ga4:report:${property.id}:${windowDays}`;

    return await cached(cacheKey, async () => {
      const [dailyRows, totalRows, channelRows, pageRows] = await Promise.all([
        runReport(property.id, accessToken, {
          dateRanges,
          dimensions: [{ name: 'date' }],
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
          ],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
          limit: 400,
        }),
        runReport(property.id, accessToken, {
          dateRanges,
          metrics: [
            { name: 'sessions' },
            { name: 'totalUsers' },
            { name: 'newUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            // Distinct from totalUsers: users who engaged in the window rather
            // than everyone with any recorded event. The builder's "Visitors"
            // and "GA4 Total Users" were both reading totalUsers and therefore
            // printed the same figure twice.
            { name: 'activeUsers' },
          ],
        }),
        runReport(property.id, accessToken, {
          dateRanges,
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 8,
        }),
        runReport(property.id, accessToken, {
          dateRanges,
          dimensions: [{ name: 'landingPagePlusQueryString' }],
          metrics: [{ name: 'sessions' }, { name: 'bounceRate' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
      ]);

      const total = totalRows[0];

      return {
        propertyId: property.id,
        propertyName: property.displayName,
        alternatives,
        resolvedBy,
        windowDays,
        daily: dailyRows.map((row) => {
          // GA4 returns dates as YYYYMMDD; every chart here expects ISO.
          const raw = dim(row, 0);
          return {
            date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
            sessions: num(row, 0),
            users: num(row, 1),
            pageviews: num(row, 2),
            // bounceRate arrives as a 0–1 fraction; the app stores rates 0–100.
            bounceRate: Number((num(row, 3) * 100).toFixed(1)),
          };
        }),
        totals: {
          sessions: total ? num(total, 0) : 0,
          users: total ? num(total, 1) : 0,
          newUsers: total ? num(total, 2) : 0,
          pageviews: total ? num(total, 3) : 0,
          bounceRate: total ? Number((num(total, 4) * 100).toFixed(1)) : 0,
          avgSessionSeconds: total ? Number(num(total, 5).toFixed(0)) : 0,
          activeUsers: total ? num(total, 6) : 0,
        },
        channels: channelRows.map((row) => ({
          channel: dim(row, 0) || 'Unassigned',
          sessions: num(row, 0),
        })),
        pages: pageRows.map((row) => ({
          path: dim(row, 0) || '/',
          sessions: num(row, 0),
          bounceRate: Number((num(row, 1) * 100).toFixed(1)),
        })),
      };
    });
  } catch (error) {
    return isFailure(error) ? error : { kind: 'error', detail: String(error).slice(0, 200) };
  }
}

/** The message a widget shows for a given failure, phrased as the next action. */
export function ga4FailureReason(failure: Ga4Failure) {
  switch (failure.kind) {
    case 'not-connected':
      return 'Google account is not connected. Connect it in Settings to pull GA4 traffic.';
    case 'scope-missing':
      return 'The Google connection predates GA4 support and lacks the Analytics scope. Reconnect Google in Settings to grant it.';
    case 'api-disabled':
      return 'The Google Analytics Data API is not enabled on this Google Cloud project. Enable it, then reload.';
    case 'no-property':
      return failure.detail;
    default:
      return `GA4 request failed — ${failure.detail}`;
  }
}

/**
 * Narrows any "result or failure" union this module returns — a report, a
 * resolution, or the property list. All three pair with `Ga4Failure`.
 */
export function isGa4Failure<T extends object>(value: T | Ga4Failure): value is Ga4Failure {
  return 'kind' in value;
}
