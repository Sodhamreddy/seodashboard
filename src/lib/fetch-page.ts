/*
 * A plain Chrome user-agent, deliberately without a bot token.
 *
 * WHY: the previous value advertised "SEO-Premium-Dashboard/1.0", and CDN
 * anti-crawler layers reject that. Verified 2026-08-13 against a real client
 * site behind Hostinger's CDN: the self-identifying UA got 403 plus a 7.8KB
 * "Anti-Crawler Protection Is Checking Your Browser" interstitial, while this
 * UA got 200 and the real 635KB page. Because the interstitial returns *valid
 * HTML*, every on-page tool happily analysed the block page instead — the meta
 * generator produced "Anti-Crawler Protection Is Checking Your Browser and IP"
 * as a client's title tag.
 *
 * These tools fetch a page the user explicitly asked about, once, on demand —
 * they are not a crawler, so presenting as the browser the user is holding is
 * the accurate description of the traffic. Keep `isBlockedPage()` below in sync
 * if a site still manages to serve a challenge.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Markers of a CDN/WAF bot challenge rather than the real page.
 *
 * Matched against the *response body*, since these pages frequently answer 200
 * with a JS redirect. Phrases are taken from real interstitials: Hostinger's
 * "Anti-Crawler Protection", Cloudflare's "Just a moment" / managed challenge,
 * and Sucuri's block page.
 */
const CHALLENGE_MARKERS = [
  /anti-?crawler protection/i,
  /checking your browser before accessing/i,
  /just a moment\s*\.{0,3}\s*<\/title>/i,
  /cf-browser-verification|__cf_chl_|cf_chl_opt/i,
  /enable javascript and cookies to continue/i,
  /sucuri website firewall|access denied - sucuri/i,
  /ddos protection by/i,
  /you will be automatically redirected to the requested page after \d+ seconds/i,
];

function isChallengePage(html: string, status: number) {
  /*
   * Scan the whole document, not just the head.
   *
   * An earlier version only looked at the first 4000 characters on the
   * assumption that a challenge declares itself immediately. It does not:
   * Hostinger's interstitial buries its "Anti-Crawler Protection" text at index
   * ~4900, behind inline styles and scripts, so the check silently never fired.
   *
   * Scanning everything is safe here because a match alone is not enough — the
   * response must also be small or an explicit block status, and real pages
   * that discuss bot protection are far larger than these stub documents.
   */
  const matched = CHALLENGE_MARKERS.some((marker) => marker.test(html));
  if (!matched) return false;
  return status === 403 || status === 503 || html.length < 60_000;
}

export class FetchPageError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'FetchPageError';
    this.status = status;
  }
}

/** Hostnames we refuse to fetch — keeps the tools from being an SSRF proxy. */
const BLOCKED_HOST = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\./i,
];

export function normalizeUrl(input: string) {
  const trimmed = (input || '').trim();
  if (!trimmed) throw new FetchPageError('Enter a URL to analyze.');

  // Reject a foreign scheme before prefixing, otherwise "file:///etc/passwd"
  // becomes "https://file:///etc/passwd" and gets refused for the wrong reason.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1];
  if (scheme && !/^https?$/i.test(scheme)) {
    throw new FetchPageError(`Only http and https URLs can be analyzed — got "${scheme}".`);
  }

  const withScheme = scheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new FetchPageError(`"${input}" is not a valid URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchPageError('Only http and https URLs can be analyzed.');
  }
  if (!url.hostname.includes('.')) {
    throw new FetchPageError(`"${url.hostname}" is not a public hostname.`);
  }
  if (BLOCKED_HOST.some((pattern) => pattern.test(url.hostname))) {
    throw new FetchPageError('Private and loopback addresses cannot be analyzed.');
  }
  return url;
}

export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirected: boolean;
  redirectChainHint: boolean;
  contentType: string;
  headers: Record<string, string>;
  html: string;
  sizeBytes: number;
  /** Time to the first byte of the response body. */
  ttfbMs: number;
  totalMs: number;
};

export async function fetchPage(input: string): Promise<FetchedPage> {
  const url = normalizeUrl(input);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    const timedOut = /timeout|abort/i.test(reason);
    throw new FetchPageError(
      timedOut
        ? `${url.hostname} did not respond within ${TIMEOUT_MS / 1000}s.`
        : `Could not reach ${url.hostname} (${reason}).`,
      502,
    );
  }

  const ttfbMs = Date.now() - startedAt;
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const contentType = headers['content-type'] || '';
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new FetchPageError('Page is larger than 5 MB and was not analyzed.', 413);
  }

  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charset = (charsetMatch?.[1] || 'utf-8').trim().toLowerCase();
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = new TextDecoder('utf-8').decode(buffer);
  }

  // A bot-challenge page is valid HTML and often returns 200, so without this
  // every tool downstream analyses the interstitial as if it were the site.
  // Failing loudly is the only safe behaviour: silently scoring a block page
  // produces confident, completely wrong advice.
  if (isChallengePage(html, response.status)) {
    throw new FetchPageError(
      `${url.hostname} served an anti-bot challenge instead of the page, so it was not analysed. ` +
        'This is usually a CDN/WAF rule (Cloudflare, Hostinger, Sucuri). Allowlist this tool, or test a URL that is not behind the challenge.',
      502,
    );
  }

  return {
    requestedUrl: url.toString(),
    finalUrl: response.url || url.toString(),
    status: response.status,
    redirected: response.redirected,
    redirectChainHint: (response.url || url.toString()) !== url.toString(),
    contentType,
    headers,
    html,
    sizeBytes: buffer.byteLength,
    ttfbMs,
    totalMs: Date.now() - startedAt,
  };
}

/** Plain-text sibling of `fetchPage` for robots.txt and XML sitemaps. */
export async function fetchText(target: string, timeoutMs = 15_000) {
  const url = normalizeUrl(target);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    const text = response.ok ? await response.text() : '';
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url.toString(),
      text,
    };
  } catch {
    return { ok: false, status: 0, url: url.toString(), text: '' };
  }
}
