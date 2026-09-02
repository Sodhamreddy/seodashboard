import { withTtlCache } from './cache';

/**
 * Crawly backlink index client (getcrawly.com, free tier ~100 requests/day).
 *
 * AUTH GOTCHA, verified live 2026-08-13: only the `?key=` query parameter
 * authenticates. The `Authorization: Bearer <key>` form that Crawly's own 401
 * message advertises returns 401 — as do `X-API-Key` and `?api_key=`. Do not
 * "fix" this to a header without re-probing.
 *
 * SHAPE GOTCHA: the live responses are flat and do not match the published docs
 * (which describe nested `summary.*` / `score.harmonic_score`). Rows live under
 * `backlinks.rows`, not `backlinks.backlinks`.
 *
 * QUOTA: a full report is 2 calls (`/backlinks` carries per-row quality, and
 * `/spam-score` returns authority in `signals` as well), so one domain costs 2
 * of the daily 100 rather than one call per link.
 *
 * WHAT THIS INDEX DOES NOT HAVE: anchor text, rel (dofollow/nofollow), link
 * placement, per-link page authority, first/last-seen dates, or any history.
 * Callers must not synthesise those — see `backlinks.ts`, which exposes a
 * narrower live shape instead of filling them in.
 */

const API_ROOT = 'https://getcrawly.com/api/v1';
/*
 * One hour, because the constraint here is a daily quota, not freshness.
 *
 * Crawly's free tier allows 100 requests/day and it was being exhausted: every
 * Overview and Backlinks render asked for a profile, and with three clients on
 * the roster a normal afternoon of use burned through it — after which the page
 * silently fell back to seeded data. A referring-domain profile barely moves
 * day to day, so a 10-minute TTL bought nothing and cost the quota.
 */
const CACHE_TTL_MS = 60 * 60_000;

export type CrawlyRow = {
  source_domain: string;
  link_count: number;
  /** A rank, not a score: smaller is stronger, and 0 means unranked. */
  harmonic_rank: number;
  /** Qualitative: "Low" | "Medium" | "High". Never parse as a number. */
  domain_rating: string;
  is_suspicious: boolean;
  is_toxic: boolean;
};

export type CrawlyProfile = {
  domain: string;
  /** Crawly's own 0–100 authority metric — NOT Moz Domain Authority. */
  authorityScore: number;
  referringDomains: number;
  totalLinks: number;
  /** 0–100, lower is better. */
  spamScore: number;
  /** Crawly's wording, e.g. "Very Low". */
  risk: string;
  rows: CrawlyRow[];
};

function apiKey() {
  return process.env.CRAWLY_API_KEY?.trim() ?? '';
}

export function crawlyConfigured() {
  return apiKey().length > 0;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error('CRAWLY_API_KEY is not set.');

  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`${API_ROOT}${path}?${query}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });

  // The free tier is ~100 calls/day, so every real call is logged. If this line
  // appears on every page view, the cache above has stopped working.
  console.info(`[crawly] ${path} ${params.domain ?? ''} -> ${response.status}`);

  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text)?.error ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(`Crawly ${response.status}: ${String(message).slice(0, 200)}`);
  }

  return JSON.parse(text) as T;
}

/**
 * One domain's profile: authority, spam and its referring domains.
 *
 * Cached for 10 minutes — longer than the other providers because the free tier
 * is only ~100 calls a day and a backlink index barely moves within an hour.
 */
export async function getCrawlyProfile(domain: string): Promise<CrawlyProfile | null> {
  return withTtlCache(`crawly:${domain}`, CACHE_TTL_MS, async () => {
    const [spam, links] = await Promise.all([
      call<{
        domain: string;
        spam_score: number;
        risk: string;
        signals?: { total_links?: number; referring_domains?: number; authority_score?: number };
      }>('/spam-score', { domain }),
      call<{
        domain: string;
        authority_score: number;
        referring_domains: number;
        total_links: number;
        backlinks?: { total: number; limit: number; offset: number; rows?: CrawlyRow[] };
      }>('/backlinks', { domain, limit: '100' }),
    ]);

    const rows = links.backlinks?.rows ?? [];

    // An unindexed domain answers 200 with zeroes. Reporting that as a measured
    // "0 referring domains, spam 0" would read as a verified-clean profile, so
    // it is surfaced as "no data" instead.
    if (!rows.length && !links.referring_domains && !links.total_links) return null;

    return {
      domain: links.domain || domain,
      authorityScore: links.authority_score ?? spam.signals?.authority_score ?? 0,
      referringDomains: links.referring_domains ?? spam.signals?.referring_domains ?? 0,
      totalLinks: links.total_links ?? spam.signals?.total_links ?? 0,
      spamScore: spam.spam_score ?? 0,
      risk: spam.risk ?? 'Unknown',
      rows,
    };
  });
}
