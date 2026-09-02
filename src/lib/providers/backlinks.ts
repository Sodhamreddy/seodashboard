import { backlinkProviderStatus, type ProviderStatus } from '../env';
import { withTtlCache } from './cache';
import { crawlyConfigured, getCrawlyProfile } from './crawly';
import { chance, floatBetween, intBetween, isoDaysAgo, isoMonthsAgo, makeRandom, pick, walk } from './seed';

export type BacklinkStatus = 'new' | 'live' | 'lost';

export type Backlink = {
  id: string;
  sourceUrl: string;
  sourceDomain: string;
  targetPath: string;
  anchor: string;
  domainAuthority: number;
  pageAuthority: number;
  spamScore: number;
  rel: 'dofollow' | 'nofollow';
  placement: 'content' | 'sidebar' | 'footer' | 'profile';
  firstSeen: string;
  lastSeen: string;
  status: BacklinkStatus;
};

/**
 * One referring domain as a live index reports it.
 *
 * Deliberately narrower than `Backlink`: Crawly has no anchor text, rel,
 * placement, per-link page authority or first/last-seen dates, so those simply
 * do not exist here rather than being present-but-fabricated.
 */
export type ReferringDomain = {
  sourceDomain: string;
  links: number;
  /** Qualitative band from the index: "Low" | "Medium" | "High". */
  rating: string;
  /** A rank (smaller is stronger); 0 means unranked. */
  harmonicRank: number;
  suspicious: boolean;
  toxic: boolean;
};

export type BacklinkReport = {
  domain: string;
  rangeDays: number;
  provider: ProviderStatus;
  generatedAt: string;
  /**
   * `crawly` means the totals, authority, spam and referring-domain list are
   * measured, but there is no link history, anchor text or rel data. `seed`
   * means everything is generated. The page adapts its panels to this.
   */
  source: 'crawly' | 'seed';
  /** Populated in `crawly` mode; `backlinks` is populated in `seed` mode. */
  referringDomainRows: ReferringDomain[];
  summary: {
    referringDomains: number;
    referringDomainsDelta: number;
    totalBacklinks: number;
    totalBacklinksDelta: number;
    newLinks: number;
    lostLinks: number;
    uniqueDomains: number;
    averageDomainAuthority: number;
    averagePageAuthority: number;
    dofollowShare: number;
    toxicCandidates: number;
    /** Live index only: whole-domain spam score (0–100, lower is better). */
    spamScore?: number;
    /** Live index only: the index's own risk wording, e.g. "Very Low". */
    risk?: string;
  };
  /** Referring-domain growth — one series, trend over time. */
  trend: { date: string; referringDomains: number; backlinks: number }[];
  /** Gained above the baseline, lost below it — diverging by month. */
  flow: { month: string; gained: number; lost: number; net: number }[];
  authorityBuckets: { bucket: string; count: number }[];
  topAnchors: { anchor: string; count: number; share: number }[];
  backlinks: Backlink[];
};

const DOMAIN_WORDS = [
  'northsidereview', 'trustedcarehub', 'localbizjournal', 'seniorlivingtoday', 'thecityledger',
  'healthwiredaily', 'metrodirectory', 'communitypressnow', 'ratedproviders', 'wellnessgazette',
  'homefrontweekly', 'caregiverdigest', 'regionalbusiness', 'bestofthevalley', 'insightreporter',
  'familyfirstblog', 'servicefinderpro', 'urbanhealthpost', 'countyheraldnews', 'lifestylecurrent',
  'directorylistings', 'thehealthbeat', 'primeprovidernet', 'neighborhoodwire', 'seniorcareindex',
];
const TLDS = ['com', 'com', 'com', 'org', 'net', 'co', 'io', 'news'];
const PATH_WORDS = ['blog', 'resources', 'guide', 'news', 'directory', 'reviews', 'partners', 'articles'];
const ANCHOR_TEMPLATES = [
  'click here', 'read more', 'learn more', 'visit website', 'official site',
  '{brand}', '{brand} reviews', 'home care services', 'in-home care', 'trusted provider',
  'senior care near me', 'compare providers', 'this guide', 'https://{domain}',
];

function brandOf(domain: string) {
  const label = domain.replace(/^www\./, '').split('.')[0].replace(/[-_]+/g, ' ');
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Seeded backlink report.
 *
 * ── REAL PROVIDER HOOK ────────────────────────────────────────────────
 * To go live, branch at the top of `getBacklinkReport` on
 * `backlinkProviderStatus().mode === 'live'` and map your provider's
 * response into `BacklinkReport`. Nothing downstream — pages, charts,
 * tables — needs to change; they only know this shape.
 */
const RATING_ORDER = ['High', 'Medium', 'Low'];

/**
 * Map a Crawly profile into `BacklinkReport`.
 *
 * Everything here is measured. The fields the index cannot answer — link
 * history, gained/lost flow, anchor text, dofollow share, page authority — are
 * left at zero/empty and the page hides those panels rather than drawing an
 * invented trend. `averageDomainAuthority` carries Crawly's own authority
 * score, which is not Moz DA; the UI labels it accordingly.
 */
function mapCrawlyReport(
  domain: string,
  rangeDays: number,
  profile: NonNullable<Awaited<ReturnType<typeof getCrawlyProfile>>>,
  provider: ProviderStatus,
): BacklinkReport {
  const rows: ReferringDomain[] = profile.rows.map((row) => ({
    sourceDomain: row.source_domain,
    links: row.link_count,
    rating: row.domain_rating,
    harmonicRank: row.harmonic_rank,
    suspicious: row.is_suspicious,
    toxic: row.is_toxic,
  }));

  const ratingCounts = RATING_ORDER.map((rating) => ({
    bucket: `${rating} rated`,
    count: rows.filter((row) => row.rating === rating).length,
  })).filter((bucket) => bucket.count > 0);

  return {
    domain,
    rangeDays,
    provider,
    generatedAt: new Date().toISOString(),
    source: 'crawly',
    referringDomainRows: rows,
    summary: {
      referringDomains: profile.referringDomains,
      referringDomainsDelta: 0,
      totalBacklinks: profile.totalLinks,
      totalBacklinksDelta: 0,
      newLinks: 0,
      lostLinks: 0,
      uniqueDomains: rows.length,
      averageDomainAuthority: profile.authorityScore,
      averagePageAuthority: 0,
      dofollowShare: 0,
      toxicCandidates: rows.filter((row) => row.toxic || row.suspicious).length,
      spamScore: profile.spamScore,
      risk: profile.risk,
    },
    // No history in this index — the page omits the two time-series panels.
    trend: [],
    flow: [],
    authorityBuckets: ratingCounts,
    topAnchors: [],
    backlinks: [],
  };
}

export async function getBacklinkReport(
  domainInput: string,
  rangeDays = 90,
): Promise<BacklinkReport> {
  const domain = domainInput.replace(/^www\./, '').toLowerCase();
  return withTtlCache(`backlinks:${domain}:${rangeDays}`, 60_000, () =>
    buildBacklinkReport(domain, rangeDays),
  );
}

async function buildBacklinkReport(domain: string, rangeDays: number): Promise<BacklinkReport> {
  const provider = backlinkProviderStatus();

  // Live index first when a key is present, unless explicitly forced to seed.
  const configured = (process.env.BACKLINK_PROVIDER || '').toLowerCase();
  if (configured !== 'seed' && crawlyConfigured()) {
    try {
      const profile = await getCrawlyProfile(domain);
      if (profile) {
        return mapCrawlyReport(domain, rangeDays, profile, {
          mode: 'live',
          provider: 'Crawly',
          note: '',
        });
      }
      provider.note = `${domain} is not in Crawly's index — showing seeded data.`;
    } catch (error) {
      provider.note = `Crawly fetch failed — showing seeded data. ${
        error instanceof Error ? error.message : 'Unknown error.'
      }`;
    }
  }

  if (provider.mode === 'live') {
    /*
     * Reached only when the live path above did not return a report.
     *
     * This used to overwrite `provider.note` with "the response mapper is not
     * implemented yet", which is both false — `mapCrawlyReport` exists and is
     * used above — and actively unhelpful: it erased the specific reason
     * ("not in Crawly's index", or the fetch error) that had just been set.
     * The specific note now survives.
     */
    if (!provider.note) {
      provider.note = `${provider.provider} returned no usable profile for ${domain} — showing seeded data.`;
    }
    provider.mode = 'seed';
  }

  const random = makeRandom(`backlinks:${domain}:${rangeDays}`);
  const brand = brandOf(domain);

  // ── Referring domain pool ───────────────────────────────────────────
  const referringDomainCount = intBetween(random, 120, 420);
  const domains: string[] = [];
  const usedDomains = new Set<string>();
  while (domains.length < referringDomainCount) {
    const word = pick(random, DOMAIN_WORDS);
    const suffix = domains.length > DOMAIN_WORDS.length ? intBetween(random, 2, 99) : '';
    const candidate = `${word}${suffix}.${pick(random, TLDS)}`;
    if (usedDomains.has(candidate)) continue;
    usedDomains.add(candidate);
    domains.push(candidate);
  }

  // ── Individual backlinks ────────────────────────────────────────────
  const backlinks: Backlink[] = [];
  const rowCount = Math.min(260, Math.round(referringDomainCount * 1.6));
  for (let i = 0; i < rowCount; i += 1) {
    const sourceDomain = domains[i % domains.length];
    const domainAuthority = Math.round(
      Math.min(92, Math.max(4, floatBetween(random, 8, 62) + (chance(random, 0.12) ? 22 : 0))),
    );
    const pageAuthority = Math.round(
      Math.min(domainAuthority + 6, Math.max(2, domainAuthority - intBetween(random, 2, 16))),
    );
    const spamScore = intBetween(random, 0, domainAuthority < 20 ? 62 : 24);
    const firstSeenDays = intBetween(random, 0, Math.max(rangeDays, 400));

    const status: BacklinkStatus =
      firstSeenDays <= rangeDays && chance(random, 0.55)
        ? 'new'
        : chance(random, 0.1)
          ? 'lost'
          : 'live';

    const anchorTemplate = pick(random, ANCHOR_TEMPLATES);
    backlinks.push({
      id: `bl-${i}`,
      sourceDomain,
      sourceUrl: `https://${sourceDomain}/${pick(random, PATH_WORDS)}/${brand
        .toLowerCase()
        .replace(/\s+/g, '-')}-${intBetween(random, 100, 999)}`,
      targetPath: chance(random, 0.55) ? '/' : `/${pick(random, PATH_WORDS)}`,
      anchor: anchorTemplate.replace('{brand}', brand).replace('{domain}', domain),
      domainAuthority,
      pageAuthority,
      spamScore,
      rel: chance(random, 0.72) ? 'dofollow' : 'nofollow',
      placement: pick(random, ['content', 'content', 'content', 'sidebar', 'footer', 'profile'] as const),
      firstSeen: isoDaysAgo(firstSeenDays),
      lastSeen: status === 'lost' ? isoDaysAgo(intBetween(random, 1, 30)) : isoDaysAgo(0),
      status,
    });
  }

  // ── Trend (weekly points across the range) ──────────────────────────
  const points = Math.max(8, Math.min(26, Math.round(rangeDays / 7)));
  const startingDomains = Math.round(referringDomainCount * floatBetween(random, 0.78, 0.94));
  const domainSeries = walk(random, {
    start: startingDomains,
    steps: points,
    drift: (referringDomainCount - startingDomains) / points,
    volatility: 6,
    min: 10,
  });
  const trend = domainSeries.map((value, index) => {
    const daysAgo = Math.round(((points - 1 - index) * rangeDays) / (points - 1));
    return {
      date: isoDaysAgo(daysAgo),
      referringDomains: Math.round(value),
      backlinks: Math.round(value * floatBetween(random, 1.4, 1.9)),
    };
  });

  // ── Monthly gained / lost flow ──────────────────────────────────────
  const monthCount = Math.max(4, Math.min(12, Math.round(rangeDays / 30) + 3));
  const flow = Array.from({ length: monthCount }, (_, index) => {
    const gained = intBetween(random, 6, 42);
    const lost = intBetween(random, 1, Math.max(3, Math.round(gained * 0.6)));
    return { month: isoMonthsAgo(monthCount - 1 - index), gained, lost, net: gained - lost };
  });

  // ── Aggregates ──────────────────────────────────────────────────────
  const uniqueDomains = new Set(backlinks.map((link) => link.sourceDomain)).size;
  const newLinks = backlinks.filter((link) => link.status === 'new').length;
  const lostLinks = backlinks.filter((link) => link.status === 'lost').length;
  const dofollow = backlinks.filter((link) => link.rel === 'dofollow').length;

  const bucketDefinitions: { bucket: string; test: (value: number) => boolean }[] = [
    { bucket: 'DA 0–19', test: (value) => value < 20 },
    { bucket: 'DA 20–39', test: (value) => value >= 20 && value < 40 },
    { bucket: 'DA 40–59', test: (value) => value >= 40 && value < 60 },
    { bucket: 'DA 60–79', test: (value) => value >= 60 && value < 80 },
    { bucket: 'DA 80+', test: (value) => value >= 80 },
  ];

  const anchorCounts = new Map<string, number>();
  for (const link of backlinks) {
    anchorCounts.set(link.anchor, (anchorCounts.get(link.anchor) ?? 0) + 1);
  }
  const topAnchors = [...anchorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([anchor, count]) => ({
      anchor,
      count,
      share: Number(((count / backlinks.length) * 100).toFixed(1)),
    }));

  const firstTrend = trend[0];
  const lastTrend = trend[trend.length - 1];

  return {
    domain,
    rangeDays,
    provider,
    generatedAt: new Date().toISOString(),
    source: 'seed',
    referringDomainRows: [],
    summary: {
      referringDomains: lastTrend.referringDomains,
      referringDomainsDelta: lastTrend.referringDomains - firstTrend.referringDomains,
      totalBacklinks: lastTrend.backlinks,
      totalBacklinksDelta: lastTrend.backlinks - firstTrend.backlinks,
      newLinks,
      lostLinks,
      uniqueDomains,
      averageDomainAuthority: Number(
        (backlinks.reduce((sum, link) => sum + link.domainAuthority, 0) / backlinks.length).toFixed(1),
      ),
      averagePageAuthority: Number(
        (backlinks.reduce((sum, link) => sum + link.pageAuthority, 0) / backlinks.length).toFixed(1),
      ),
      dofollowShare: Number(((dofollow / backlinks.length) * 100).toFixed(1)),
      toxicCandidates: backlinks.filter((link) => link.spamScore >= 30).length,
    },
    trend,
    flow,
    authorityBuckets: bucketDefinitions.map((definition) => ({
      bucket: definition.bucket,
      count: backlinks.filter((link) => definition.test(link.domainAuthority)).length,
    })),
    topAnchors,
    backlinks: backlinks
      .sort(
        (a, b) =>
          Number(b.status === 'new') - Number(a.status === 'new') ||
          b.domainAuthority - a.domainAuthority,
      )
      .slice(0, 150),
  };
}
