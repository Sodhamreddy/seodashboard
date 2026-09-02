import * as cheerio from 'cheerio';
import { fetchPage, normalizeUrl, FetchPageError } from '../fetch-page';

/**
 * Broken link checker.
 *
 * Extracts every outbound reference from one page, then probes each target and
 * classifies the result. Deliberately single-page rather than a whole-site
 * crawl: a crawl of an unknown site has no natural bound, and the useful
 * question ("is anything on this page dead?") is answerable in one pass.
 *
 * Probing rules that matter:
 *   • HEAD first, GET on fallback. Plenty of servers answer HEAD with 405 or
 *     501 while the page itself is fine, so a HEAD failure is never reported as
 *     broken without a GET to confirm.
 *   • Concurrency is capped and every target is probed once. A page linking the
 *     same URL twenty times costs one request.
 *   • `mailto:`, `tel:`, `javascript:` and fragments are catalogued, not
 *     fetched — they cannot 404, and reporting them as "unchecked" is honest.
 */

const USER_AGENT =
  'Mozilla/5.0 (compatible; SEO-Command-Center/1.0; +https://example.com/bot)';

/** Simultaneous probes. Keeps a 200-link page civil toward the target host. */
const CONCURRENCY = 8;
const PROBE_TIMEOUT_MS = 12_000;
/** Hard cap so one enormous page cannot hold a request open indefinitely. */
const MAX_LINKS = 250;

export type LinkStatus =
  /** 2xx — reachable. */
  | 'ok'
  /** 3xx that resolved to a 2xx; the final URL is reported. */
  | 'redirect'
  /** 4xx other than 401/403. This is the actionable bucket. */
  | 'broken'
  /** 5xx — the target is erroring, which may be transient. */
  | 'server-error'
  /** 401/403 — exists but refuses bots. Not a broken link. */
  | 'blocked'
  /** DNS failure, TLS failure, connection refused. */
  | 'unreachable'
  /** Took longer than the probe timeout. Inconclusive, not broken. */
  | 'timeout'
  /** mailto:, tel:, javascript:, fragment-only — nothing to fetch. */
  | 'not-checked';

export type LinkResult = {
  url: string;
  /** Anchor text, trimmed; '(image)' for a bare image link, '(empty)' if none. */
  text: string;
  status: LinkStatus;
  /** HTTP status when one was received. */
  code: number | null;
  /** Where a redirect landed, when it differs from `url`. */
  finalUrl?: string;
  /** Why it failed, for the non-HTTP statuses. */
  detail?: string;
  internal: boolean;
  /** How many times this target appears on the page. */
  occurrences: number;
  /** `rel` on the anchor, useful when judging an external link. */
  rel?: string;
};

export type BrokenLinkReport = {
  requestedUrl: string;
  finalUrl: string;
  checkedAt: string;
  summary: {
    total: number;
    checked: number;
    ok: number;
    redirects: number;
    broken: number;
    serverErrors: number;
    blocked: number;
    unreachable: number;
    timeouts: number;
    notChecked: number;
    internal: number;
    external: number;
    /** Links that need a human: broken + server errors + unreachable. */
    needsAttention: number;
  };
  /** Every link, worst status first. */
  links: LinkResult[];
  /** True when the page had more links than the cap; `summary.total` is the cap. */
  truncated: boolean;
  totalFound: number;
};

/** Statuses that represent a genuine problem, in reporting order. */
const SEVERITY: Record<LinkStatus, number> = {
  broken: 0,
  'server-error': 1,
  unreachable: 2,
  timeout: 3,
  redirect: 4,
  blocked: 5,
  'not-checked': 6,
  ok: 7,
};

function classify(code: number): LinkStatus {
  if (code >= 200 && code < 300) return 'ok';
  if (code === 401 || code === 403) return 'blocked';
  if (code >= 400 && code < 500) return 'broken';
  if (code >= 500) return 'server-error';
  return 'ok';
}

async function probe(target: string): Promise<Pick<LinkResult, 'status' | 'code' | 'finalUrl' | 'detail'>> {
  const attempt = async (method: 'HEAD' | 'GET') =>
    fetch(target, {
      method,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });

  try {
    let response = await attempt('HEAD');

    // A HEAD rejection is not evidence about the page. Confirm with GET before
    // calling anything broken.
    if (response.status === 405 || response.status === 501 || response.status >= 400) {
      try {
        response = await attempt('GET');
      } catch {
        /* keep the HEAD result rather than losing the status code */
      }
    }

    const status = classify(response.status);
    const redirected = response.url && response.url !== target;

    return {
      status: status === 'ok' && redirected ? 'redirect' : status,
      code: response.status,
      finalUrl: redirected ? response.url : undefined,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    const timedOut = /timeout|abort|timed out/i.test(reason);
    return {
      status: timedOut ? 'timeout' : 'unreachable',
      code: null,
      detail: timedOut ? `No response within ${PROBE_TIMEOUT_MS / 1000}s` : reason,
    };
  }
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function pooled<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    }),
  );

  return results;
}

export async function runBrokenLinkCheck(input: string): Promise<BrokenLinkReport> {
  const page = await fetchPage(input);
  const base = new URL(page.finalUrl);
  const $ = cheerio.load(page.html);

  // Collect by resolved URL so a repeated link is probed once. The first
  // occurrence supplies the anchor text and rel.
  const found = new Map<string, { text: string; rel?: string; count: number }>();
  const unfetchable: { url: string; text: string }[] = [];

  $('a[href]').each((_, element) => {
    const href = ($(element).attr('href') ?? '').trim();
    if (!href) return;

    const text =
      $(element).text().trim() ||
      ($(element).find('img').length > 0 ? '(image)' : '') ||
      $(element).attr('aria-label')?.trim() ||
      '(empty)';
    const rel = $(element).attr('rel')?.trim() || undefined;

    // Non-HTTP schemes and pure fragments have nothing to probe.
    if (/^(mailto:|tel:|sms:|javascript:|data:)/i.test(href) || href.startsWith('#')) {
      if (unfetchable.length < MAX_LINKS) unfetchable.push({ url: href, text });
      return;
    }

    let resolved: string;
    try {
      resolved = new URL(href, base).toString();
    } catch {
      if (unfetchable.length < MAX_LINKS) unfetchable.push({ url: href, text });
      return;
    }

    // Strip the fragment: /page#a and /page#b are one request.
    const url = new URL(resolved);
    url.hash = '';
    const key = url.toString();

    const existing = found.get(key);
    if (existing) existing.count += 1;
    else found.set(key, { text, rel, count: 1 });
  });

  // Deduplicate the unfetchable list the same way as the fetchable one, so the
  // two counts are on the same footing.
  const unfetchableUnique = new Map<string, { text: string; count: number }>();
  for (const item of unfetchable) {
    const hit = unfetchableUnique.get(item.url);
    if (hit) hit.count += 1;
    else unfetchableUnique.set(item.url, { text: item.text, count: 1 });
  }

  // Both halves are unique-target counts; `totalFound` only exceeds
  // `summary.total` when the cap actually truncated something.
  const totalFound = found.size + unfetchableUnique.size;
  const entries = [...found.entries()].slice(0, MAX_LINKS);
  const truncated = found.size > MAX_LINKS;

  const probed = await pooled(entries, CONCURRENCY, async ([url, meta]) => {
    // A link the fetcher itself would refuse (private host, odd scheme) is
    // reported as such rather than probed.
    try {
      normalizeUrl(url);
    } catch (error) {
      return {
        url,
        text: meta.text,
        status: 'not-checked' as LinkStatus,
        code: null,
        detail: error instanceof FetchPageError ? error.message : 'Not a probeable URL',
        internal: false,
        occurrences: meta.count,
        rel: meta.rel,
      } satisfies LinkResult;
    }

    const result = await probe(url);
    return {
      url,
      text: meta.text,
      ...result,
      internal: new URL(url).hostname === base.hostname,
      occurrences: meta.count,
      rel: meta.rel,
    } satisfies LinkResult;
  });

  const links: LinkResult[] = [
    ...probed,
    ...[...unfetchableUnique.entries()].map(([url, meta]) => ({
      url,
      text: meta.text,
      status: 'not-checked' as LinkStatus,
      code: null,
      detail: url.startsWith('#')
        ? 'Fragment link — same-page anchor'
        : 'Non-HTTP scheme — nothing to request',
      internal: true,
      occurrences: meta.count,
    })),
  ].sort((a, b) => {
    const bySeverity = SEVERITY[a.status] - SEVERITY[b.status];
    return bySeverity !== 0 ? bySeverity : a.url.localeCompare(b.url);
  });

  const count = (status: LinkStatus) => links.filter((link) => link.status === status).length;
  const broken = count('broken');
  const serverErrors = count('server-error');
  const unreachableCount = count('unreachable');

  return {
    requestedUrl: page.requestedUrl,
    finalUrl: page.finalUrl,
    checkedAt: new Date().toISOString(),
    summary: {
      total: links.length,
      checked: probed.length,
      ok: count('ok'),
      redirects: count('redirect'),
      broken,
      serverErrors,
      blocked: count('blocked'),
      unreachable: unreachableCount,
      timeouts: count('timeout'),
      notChecked: count('not-checked'),
      internal: links.filter((link) => link.internal).length,
      external: links.filter((link) => !link.internal).length,
      needsAttention: broken + serverErrors + unreachableCount,
    },
    links,
    truncated,
    totalFound,
  };
}
