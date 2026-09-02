import { rankProviderStatus, type ProviderStatus } from '../env';
import { number } from '../format';
import { withTtlCache } from './cache';
import { getGscKeywordData } from './searchConsole';
import { chance, floatBetween, intBetween, isoDaysAgo, makeRandom, pick } from './seed';

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export type KeywordRow = {
  id: string;
  keyword: string;
  /**
   * Search volume, difficulty and CPC are rank-tracker / ads-planner metrics.
   * Search Console does not expose them, so in Search Console mode they are
   * `null` and the UI shows "—" rather than a fabricated number.
   */
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: SearchIntent;
  position: number | null;
  previousPosition: number | null;
  bestPosition: number;
  change: number;
  landingPath: string;
  engine: 'google' | 'bing';
  device: 'desktop' | 'mobile';
  location: string;
  /** Weekly positions, oldest first. Nulls are "not in the top 100". */
  history: (number | null)[];
  updatedAt: string;
  /** Measured Search Console metrics; present only in Search Console mode. */
  clicks?: number;
  impressions?: number;
  ctr?: number;
};

/** A candidate keyword worth tracking, not yet in the tracked set. */
export type KeywordSuggestion = {
  keyword: string;
  volume: number;
  difficulty: number;
  cpc: number;
  intent: SearchIntent;
  /** Why this surfaced, e.g. "Related to home care services". */
  reason: string;
};

export type KeywordReport = {
  domain: string;
  provider: ProviderStatus;
  generatedAt: string;
  /**
   * Which metrics are real. `gsc` means positions/clicks/impressions are
   * measured but volume/difficulty/CPC are absent; `seed` means everything is
   * generated. The UI adapts its columns and labels to this.
   */
  source: 'gsc' | 'seed';
  /** The Search Console property the data came from, in `gsc` mode. */
  propertyUrl?: string;
  summary: {
    tracked: number;
    top3: number;
    top10: number;
    top100: number;
    averagePosition: number;
    visibility: number;
    visibilityDelta: number;
    improved: number;
    declined: number;
    unchanged: number;
    lostRankings: number;
    /** Measured totals, Search Console mode only. */
    clicks?: number;
    impressions?: number;
    ctr?: number;
    clicksDelta?: number;
  };
  /** Search visibility over time — single series, trend over time. */
  visibilityTrend: { date: string; visibility: number }[];
  /** Position buckets — magnitude comparison, sequential encoding. */
  distribution: { bucket: string; count: number }[];
  /** Biggest movers, gains above the baseline and losses below it. */
  movers: { keyword: string; change: number; position: number | null }[];
  intentMix: { intent: SearchIntent; count: number; volume: number }[];
  keywords: KeywordRow[];
  /** Untracked keywords worth adding — the opportunity list, not the tracked set. */
  keywordSuggestions: KeywordSuggestion[];
};

const HEAD_TERMS = [
  'home care services', 'in home care', 'senior care', 'elderly care services',
  'caregiver agency', 'respite care', 'dementia care', 'live in care',
  'personal care assistant', 'companion care', 'post surgery care', 'alzheimers care',
  '24 hour home care', 'private duty nursing', 'hospice support', 'veterans home care',
];
const MODIFIERS = [
  'near me', 'cost', 'reviews', 'agency', 'for seniors', 'prices', 'vs nursing home',
  'checklist', 'benefits', 'medicare', 'at home', 'services', 'providers', 'guide',
];
const CITIES = ['austin', 'sacramento', 'columbus', 'fresno', 'palo alto', 'phoenix', 'tampa'];
const LOCATIONS = ['United States', 'United States', 'Austin, TX', 'Sacramento, CA', 'Columbus, OH'];
const QUESTION_PREFIXES = ['what is', 'how much does', 'how do i choose', 'is', 'when to consider'];

function intentFor(keyword: string): SearchIntent {
  if (/\b(cost|price|prices|cheap|quote)\b/.test(keyword)) return 'transactional';
  if (/\b(agency|providers|services|near me|hire)\b/.test(keyword)) return 'commercial';
  if (/\b(reviews|vs|compare)\b/.test(keyword)) return 'commercial';
  if (/\b(what|how|why|guide|checklist|benefits)\b/.test(keyword)) return 'informational';
  return 'informational';
}

/** SE-Ranking-style visibility: share of possible top-10 clicks captured. */
const CTR_BY_POSITION = [
  0, 31.7, 24.7, 18.7, 13.6, 9.5, 6.3, 4.3, 3.1, 2.6, 2.4,
];

function visibilityOf(rows: { position: number | null; volume: number }[]) {
  const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
  if (totalVolume === 0) return 0;
  const captured = rows.reduce((sum, row) => {
    if (!row.position || row.position > 10) return sum;
    // Search Console reports *average* position, so it is fractional (1.2, 9.7).
    // The CTR table is indexed by whole positions — without rounding, the lookup
    // returns undefined and the whole metric collapses to NaN.
    const slot = Math.min(10, Math.max(1, Math.round(row.position)));
    return sum + row.volume * (CTR_BY_POSITION[slot] / 100);
  }, 0);
  return Number(((captured / (totalVolume * (CTR_BY_POSITION[1] / 100))) * 100).toFixed(1));
}

const DISTRIBUTION_DEFINITIONS: { bucket: string; test: (position: number | null) => boolean }[] = [
  { bucket: '1–3', test: (position) => position !== null && position <= 3 },
  { bucket: '4–10', test: (position) => position !== null && position > 3 && position <= 10 },
  { bucket: '11–20', test: (position) => position !== null && position > 10 && position <= 20 },
  { bucket: '21–50', test: (position) => position !== null && position > 20 && position <= 50 },
  { bucket: '51–100', test: (position) => position !== null && position > 50 },
  { bucket: 'Not ranking', test: (position) => position === null },
];

const INTENTS: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

/**
 * Real report from Search Console Search Analytics.
 *
 * Visibility is impression-weighted here rather than volume-weighted, because
 * impressions are what GSC actually measures — it is the same CTR-share maths,
 * just against demand the site genuinely appeared for.
 */
function buildGscReport(
  domain: string,
  data: NonNullable<Awaited<ReturnType<typeof getGscKeywordData>>>,
  provider: ProviderStatus,
  options: { engine: 'google' | 'bing'; device: 'desktop' | 'mobile' },
): KeywordReport {
  const previousByQuery = new Map(data.previous.map((row) => [row.keys[0], row]));

  const rows: KeywordRow[] = data.current.map((row, index) => {
    const keyword = row.keys[0];
    const position = Number(row.position.toFixed(1));
    const previousRow = previousByQuery.get(keyword);
    const previousPosition = previousRow ? Number(previousRow.position.toFixed(1)) : null;
    const history = data.history.get(keyword) ?? [];
    const ranked = history.filter((value): value is number => value !== null);

    return {
      id: `gsc-${index}`,
      keyword,
      // Not available from Search Console — never invented.
      volume: null,
      difficulty: null,
      cpc: null,
      intent: intentFor(keyword),
      position,
      previousPosition,
      bestPosition: ranked.length ? Math.min(...ranked, position) : position,
      // Positive means the keyword moved up the SERP.
      change: previousPosition !== null ? Number((previousPosition - position).toFixed(1)) : 0,
      landingPath: '',
      engine: options.engine,
      device: options.device,
      location: 'Search Console (all locations)',
      history,
      updatedAt: new Date().toISOString(),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Number((row.ctr * 100).toFixed(2)),
    };
  });

  const positions = rows.map((row) => row.position as number);
  const totalClicks = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
  const previousClicks = data.previous.reduce((sum, row) => sum + row.clicks, 0);

  const weighted = rows.map((row) => ({ position: row.position, volume: row.impressions ?? 0 }));
  const visibility = visibilityOf(weighted);

  // Week-over-week visibility from the weekly position history, impression-weighted
  // by each keyword's current impressions (GSC gives no per-week impressions here).
  const visibilityTrend = Array.from({ length: 12 }, (_, week) => ({
    date: isoDaysAgo((11 - week) * 7 + 3),
    visibility: visibilityOf(
      rows.map((row) => ({ position: row.history[week] ?? null, volume: row.impressions ?? 0 })),
    ),
  }));

  const lastVisibility = visibilityTrend[visibilityTrend.length - 1].visibility;
  const priorVisibility = visibilityTrend[visibilityTrend.length - 2]?.visibility ?? lastVisibility;

  // Striking distance: real, actionable opportunities rather than invented terms.
  const keywordSuggestions: KeywordSuggestion[] = rows
    .filter((row) => row.position !== null && row.position > 10 && row.position <= 30)
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 8)
    .map((row) => ({
      keyword: row.keyword,
      volume: row.impressions ?? 0,
      difficulty: 0,
      cpc: 0,
      intent: row.intent,
      reason: `Position ${row.position} · ${number(row.impressions ?? 0)} impressions — close to page 1`,
    }));

  return {
    domain,
    provider,
    generatedAt: new Date().toISOString(),
    source: 'gsc',
    propertyUrl: data.siteUrl,
    summary: {
      tracked: rows.length,
      top3: rows.filter((row) => row.position !== null && row.position <= 3).length,
      top10: rows.filter((row) => row.position !== null && row.position <= 10).length,
      top100: rows.length,
      averagePosition: positions.length
        ? Number((positions.reduce((sum, value) => sum + value, 0) / positions.length).toFixed(1))
        : 0,
      visibility: lastVisibility,
      visibilityDelta: Number((lastVisibility - priorVisibility).toFixed(1)),
      improved: rows.filter((row) => row.change > 0).length,
      declined: rows.filter((row) => row.change < 0).length,
      unchanged: rows.filter((row) => row.change === 0).length,
      lostRankings: 0,
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      clicksDelta:
        previousClicks > 0
          ? Number((((totalClicks - previousClicks) / previousClicks) * 100).toFixed(1))
          : 0,
    },
    visibilityTrend,
    distribution: DISTRIBUTION_DEFINITIONS.map((definition) => ({
      bucket: definition.bucket,
      count: rows.filter((row) => definition.test(row.position)).length,
    })),
    movers: [...rows]
      .filter((row) => row.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 10)
      .map((row) => ({ keyword: row.keyword, change: row.change, position: row.position })),
    intentMix: INTENTS.map((intent) => {
      const matching = rows.filter((row) => row.intent === intent);
      return {
        intent,
        count: matching.length,
        volume: matching.reduce((sum, row) => sum + (row.impressions ?? 0), 0),
      };
    }).filter((entry) => entry.count > 0),
    keywords: [...rows].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0)),
    keywordSuggestions,
  };
}

/**
 * Rank-tracking report.
 *
 * Live from **Search Console Search Analytics** whenever the active domain maps
 * to a verified property on the connected Google account — real positions,
 * clicks, impressions and CTR, at no cost. Falls back to seeded data when there
 * is no connection, no matching property, or the call fails, with the reason
 * surfaced in `provider.note` rather than swallowed.
 *
 * A paid rank tracker (SE Ranking et al) would add search volume, difficulty and
 * CPC, plus per-device/per-location tracking, which Search Console cannot give.
 */
export async function getKeywordReport(
  domainInput: string,
  options: { engine?: 'google' | 'bing'; device?: 'desktop' | 'mobile' } = {},
): Promise<KeywordReport> {
  const domain = domainInput.replace(/^www\./, '').toLowerCase();
  const engine = options.engine ?? 'google';
  const device = options.device ?? 'desktop';
  // Three Search Console calls per report; share them across renders.
  return withTtlCache(`keywords:${domain}:${engine}:${device}`, 60_000, () =>
    buildKeywordReport(domain, { engine, device }),
  );
}

async function buildKeywordReport(
  domain: string,
  options: { engine: 'google' | 'bing'; device: 'desktop' | 'mobile' },
): Promise<KeywordReport> {
  const provider = rankProviderStatus();

  if (provider.mode === 'live') {
    provider.note = `${provider.provider} adapter is configured but the response mapper is not implemented yet — showing seeded data.`;
    provider.mode = 'seed';
  }

  // Search Console first: free, already authorised, and genuinely measured.
  if ((process.env.RANK_PROVIDER || 'gsc').toLowerCase() !== 'seed') {
    try {
      const data = await getGscKeywordData(domain);
      if (data && data.current.length > 0) {
        return buildGscReport(
          domain,
          data,
          {
            mode: 'live',
            provider: 'Search Console',
            note: '',
          },
          { engine: options.engine ?? 'google', device: options.device ?? 'desktop' },
        );
      }
      provider.note = data
        ? `Search Console has no query data for ${domain} in the last 28 days — showing seeded data.`
        : `No verified Search Console property matches ${domain} — showing seeded data. Connect a Google account that owns it in Settings.`;
    } catch (error) {
      provider.note = `Search Console rank fetch failed — showing seeded data. ${
        error instanceof Error ? error.message : 'Unknown error.'
      }`;
    }
  }

  const engine = options.engine ?? 'google';
  const device = options.device ?? 'desktop';
  const random = makeRandom(`keywords:${domain}:${engine}:${device}`);

  // ── Keyword set ─────────────────────────────────────────────────────
  const rows: KeywordRow[] = [];
  const seen = new Set<string>();
  const target = intBetween(random, 48, 90);

  while (rows.length < target) {
    const head = pick(random, HEAD_TERMS);
    const shape = random();
    const keyword =
      shape < 0.35
        ? head
        : shape < 0.7
          ? `${head} ${pick(random, MODIFIERS)}`
          : `${head} ${pick(random, CITIES)}`;
    if (seen.has(keyword)) continue;
    seen.add(keyword);

    const wordCount = keyword.split(' ').length;
    const volume = Math.round(
      floatBetween(random, 40, 8_000) / Math.max(1, wordCount - 1) + intBetween(random, 10, 260),
    );
    const difficulty = Math.round(
      Math.min(94, Math.max(3, floatBetween(random, 12, 70) + (wordCount <= 2 ? 14 : -6))),
    );

    // Position 12 weeks of history, then read current/previous off the tail.
    const historyLength = 12;
    const ranks: (number | null)[] = [];
    let current: number | null = chance(random, 0.86)
      ? intBetween(random, 1, 78)
      : null;
    for (let week = 0; week < historyLength; week += 1) {
      if (current === null) {
        current = chance(random, 0.25) ? intBetween(random, 40, 95) : null;
      } else {
        const drift = intBetween(random, -4, 4) - (difficulty < 35 ? 1 : 0);
        current = Math.max(1, Math.min(100, current + drift));
        if (current >= 100 && chance(random, 0.4)) current = null;
      }
      ranks.push(current);
    }

    const position = ranks[ranks.length - 1];
    const previousPosition = ranks[ranks.length - 2] ?? null;
    const best = ranks.filter((rank): rank is number => rank !== null);

    rows.push({
      id: `kw-${rows.length}`,
      keyword,
      volume,
      difficulty,
      cpc: Number(floatBetween(random, 0.6, 18).toFixed(2)),
      intent: intentFor(keyword),
      position,
      previousPosition,
      bestPosition: best.length ? Math.min(...best) : 0,
      // Positive change = moved up the SERP.
      change:
        position !== null && previousPosition !== null ? previousPosition - position : 0,
      landingPath:
        chance(random, 0.4)
          ? '/'
          : `/${keyword.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      engine,
      device,
      location: pick(random, LOCATIONS),
      history: ranks,
      updatedAt: isoDaysAgo(intBetween(random, 0, 2)),
    });
  }

  // ── Suggestions ─────────────────────────────────────────────────────
  // Same head-term pool as the tracked set, deliberately excluding anything
  // already in `seen` — this is the opportunity list, not a duplicate of the
  // table below it. Question-style phrasing gets called out since that shape
  // usually maps to a blog post rather than a landing page.
  const keywordSuggestions: KeywordSuggestion[] = [];
  let suggestionAttempts = 0;

  while (keywordSuggestions.length < 8 && suggestionAttempts < 200) {
    suggestionAttempts += 1;
    const head = pick(random, HEAD_TERMS);
    const shape = random();
    const keyword =
      shape < 0.4
        ? `${pick(random, QUESTION_PREFIXES)} ${head}`
        : shape < 0.75
          ? `${head} ${pick(random, MODIFIERS)}`
          : `${head} ${pick(random, CITIES)}`;

    if (seen.has(keyword) || keywordSuggestions.some((entry) => entry.keyword === keyword)) continue;

    const wordCount = keyword.split(' ').length;
    const volume = Math.round(
      floatBetween(random, 40, 6_000) / Math.max(1, wordCount - 1) + intBetween(random, 10, 200),
    );
    const difficulty = Math.round(
      Math.min(94, Math.max(3, floatBetween(random, 10, 60) + (wordCount <= 3 ? 10 : -8))),
    );

    keywordSuggestions.push({
      keyword,
      volume,
      difficulty,
      cpc: Number(floatBetween(random, 0.6, 16).toFixed(2)),
      intent: intentFor(keyword),
      reason: keyword.startsWith(QUESTION_PREFIXES.find((prefix) => keyword.startsWith(prefix)) ?? '\0')
        ? 'Question keyword — a strong fit for a blog post'
        : `Related to "${head}"`,
    });
  }

  keywordSuggestions.sort((a, b) => b.volume - a.volume);

  // ── Aggregates ──────────────────────────────────────────────────────
  const ranked = rows.filter((row) => row.position !== null);
  const positions = ranked.map((row) => row.position as number);

  const visibilityTrend = Array.from({ length: 12 }, (_, week) => ({
    date: isoDaysAgo((11 - week) * 7),
    visibility: visibilityOf(
      rows.map((row) => ({ position: row.history[week] ?? null, volume: row.volume ?? 0 })),
    ),
  }));

  return {
    domain,
    provider,
    generatedAt: new Date().toISOString(),
    source: 'seed',
    summary: {
      tracked: rows.length,
      top3: rows.filter((row) => row.position !== null && row.position <= 3).length,
      top10: rows.filter((row) => row.position !== null && row.position <= 10).length,
      top100: ranked.length,
      averagePosition: positions.length
        ? Number((positions.reduce((sum, value) => sum + value, 0) / positions.length).toFixed(1))
        : 0,
      visibility: visibilityTrend[visibilityTrend.length - 1].visibility,
      visibilityDelta: Number(
        (
          visibilityTrend[visibilityTrend.length - 1].visibility -
          visibilityTrend[visibilityTrend.length - 2].visibility
        ).toFixed(1),
      ),
      improved: rows.filter((row) => row.change > 0).length,
      declined: rows.filter((row) => row.change < 0).length,
      unchanged: rows.filter((row) => row.change === 0).length,
      lostRankings: rows.filter((row) => row.position === null && row.previousPosition !== null)
        .length,
    },
    visibilityTrend,
    distribution: DISTRIBUTION_DEFINITIONS.map((definition) => ({
      bucket: definition.bucket,
      count: rows.filter((row) => definition.test(row.position)).length,
    })),
    movers: [...rows]
      .filter((row) => row.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 10)
      .map((row) => ({ keyword: row.keyword, change: row.change, position: row.position })),
    intentMix: INTENTS
      .map((intent) => {
        const matching = rows.filter((row) => row.intent === intent);
        return {
          intent,
          count: matching.length,
          volume: matching.reduce((sum, row) => sum + (row.volume ?? 0), 0),
        };
      })
      .filter((entry) => entry.count > 0),
    keywords: rows.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)),
    keywordSuggestions,
  };
}
