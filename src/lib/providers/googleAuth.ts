import { readJson, writeJson } from '../store';

/**
 * "Sign in with Google" for the Google APIs this app talks to.
 *
 * WHAT THIS SOLVES: obtaining and refreshing an OAuth token. The user clicks
 * once, Google returns a refresh token, we store it server-side and mint access
 * tokens from it forever. That replaces two manual chores — pasting a 1-hour
 * Search Console access token, and minting an Ads refresh token by hand in the
 * OAuth Playground.
 *
 * WHAT THIS DOES NOT SOLVE: the Google Ads **developer token**. That is issued
 * to a manager account and approved by Google; no amount of signing in grants
 * it. Search Console goes fully live from this flow alone; Google Ads still
 * needs the developer token on top.
 *
 * The refresh token is written to `.data/` and never sent to the browser.
 */

const STORE_PATH = 'google/oauth.json';

/** CSRF state cookie shared by the start and callback routes. */
export const GOOGLE_STATE_COOKIE = 'seodash_google_state';

/**
 * Scopes requested together, so one consent covers every integration.
 *
 * `analytics.readonly` was added after the first connections were made, so an
 * existing refresh token will NOT carry it — GA4 calls 403 until the operator
 * reconnects. The GA4 adapter detects exactly that and says so.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/analytics.readonly',
] as const;

/**
 * The Business Profile scope, requested only when explicitly enabled.
 *
 * `business.manage` is one of Google's **restricted** scopes: requesting it
 * from a project that has not been verified for it can make the consent screen
 * warn, or refuse, which would take Search Console, Ads and GA4 down with it.
 * Since those three work today, this is opt-in via `ENABLE_GMB_SCOPE=true`
 * rather than added to the list above — turn it on once Google has approved
 * Business Profile API access, then reconnect.
 */
const GMB_SCOPE = 'https://www.googleapis.com/auth/business.manage';

export function gmbScopeEnabled() {
  return (process.env.ENABLE_GMB_SCOPE ?? '').trim().toLowerCase() === 'true';
}

/** The scopes an authorisation should actually request, right now. */
export function requestedScopes(): string[] {
  return gmbScopeEnabled() ? [...GOOGLE_SCOPES, GMB_SCOPE] : [...GOOGLE_SCOPES];
}

/** Whether a stored connection covers Business Profile. */
export function hasBusinessScope(scopes: string[]) {
  return scopes.some((scope) => scope.includes('business.manage'));
}

/** Whether a stored connection covers GA4, used to prompt a reconnect. */
export function hasAnalyticsScope(scopes: string[]) {
  return scopes.some((scope) => scope.includes('analytics'));
}

type StoredConnection = {
  refreshToken: string;
  scopes: string[];
  email: string;
  connectedAt: string;
};

export type GoogleConnection = {
  connected: boolean;
  email: string;
  scopes: string[];
  connectedAt: string | null;
  /** True when a client id/secret exist, so the flow can even be started. */
  configurable: boolean;
  missing: string[];
};

export function googleOAuthClient() {
  return {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? '',
  };
}

/**
 * The redirect URI, which Google matches as an exact string.
 *
 * Behind a TLS-terminating reverse proxy this cannot be derived from
 * `request.url` alone. nginx accepts HTTPS on the public host and forwards
 * plain HTTP to Node on an internal port, so `request.url` is something like
 * `http://localhost:7002/api/auth/google/start` — and the app duly sent
 * `http://localhost:7002/api/auth/google/callback`, which matches nothing
 * registered in Google Cloud and fails with `redirect_uri_mismatch`.
 *
 * Resolution order:
 *   1. `GOOGLE_OAUTH_REDIRECT_URI` — explicit, and the only option that cannot
 *      be got wrong. Recommended for any deployment behind a proxy.
 *   2. The `X-Forwarded-Proto` / `X-Forwarded-Host` pair, which is what a
 *      correctly configured nginx sends.
 *   3. The request's own origin, which is right for local development.
 *
 * Trusting forwarded headers is safe here specifically because Google will only
 * redirect to a URI already registered against the client: a spoofed header
 * cannot redirect a user anywhere, it can only cause this same mismatch error.
 */
export function googleRedirectUri(request: Request | string) {
  const override = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;

  // A bare string keeps the old call signature working for anything internal.
  if (typeof request === 'string') {
    return new URL('/api/auth/google/callback', new URL(request).origin).toString();
  }

  const url = new URL(request.url);
  // A proxy chain sends a comma-separated list; the first entry is the client.
  const first = (value: string | null) => value?.split(',')[0]?.trim() || '';
  const proto = first(request.headers.get('x-forwarded-proto')) || url.protocol.replace(':', '');
  const host =
    first(request.headers.get('x-forwarded-host')) ||
    first(request.headers.get('host')) ||
    url.host;

  return new URL('/api/auth/google/callback', `${proto}://${host}`).toString();
}

export async function getConnection(): Promise<GoogleConnection> {
  const stored = await readJson<StoredConnection | null>(STORE_PATH, null);
  const { clientId, clientSecret } = googleOAuthClient();

  const missing = [
    !clientId && 'GOOGLE_ADS_CLIENT_ID',
    !clientSecret && 'GOOGLE_ADS_CLIENT_SECRET',
  ].filter(Boolean) as string[];

  return {
    connected: !!stored?.refreshToken,
    email: stored?.email ?? '',
    scopes: stored?.scopes ?? [],
    connectedAt: stored?.connectedAt ?? null,
    configurable: missing.length === 0,
    missing,
  };
}

export async function saveConnection(connection: StoredConnection) {
  await writeJson(STORE_PATH, connection);
}

export async function clearConnection() {
  await writeJson(STORE_PATH, null);
}

/** Access tokens last ~1h; cache in memory so parallel calls share one refresh. */
let cached: { token: string; expiresAt: number } | null = null;

/**
 * A valid access token, or null when the account is not connected.
 *
 * Falls back to nothing on purpose — callers already have their own env-var
 * path (e.g. GSC_ACCESS_TOKEN) and decide what to do when both are absent.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const stored = await readJson<StoredConnection | null>(STORE_PATH, null);
  if (!stored?.refreshToken) return null;

  const { clientId, clientSecret } = googleOAuthClient();
  if (!clientId || !clientSecret) return null;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // A revoked or expired refresh token cannot be recovered silently — drop it
    // so the UI shows "not connected" instead of failing on every call.
    if (response.status === 400 || response.status === 401) await clearConnection();
    cached = null;
    return null;
  }

  const body = (await response.json()) as { access_token: string; expires_in?: number };
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return cached.token;
}

/** Clears the in-process cache — used right after connecting or disconnecting. */
export function resetTokenCache() {
  cached = null;
}

/** Whoami, so the settings page can show which account is connected. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return '';
    const body = (await response.json()) as { email?: string };
    return body.email ?? '';
  } catch {
    return '';
  }
}
