/**
 * Env access with safe dev fallbacks. Nothing throws at import time so the
 * app boots on a fresh clone; each provider reports its own mode to the UI.
 */

export const DEV_FALLBACK_USERNAME = 'admin';
export const DEV_FALLBACK_PASSWORD = 'seo-dashboard';
const DEV_FALLBACK_SECRET = 'insecure-dev-secret-change-me-in-env-local';

/** Dev conveniences must never apply to a deployed, publicly reachable app. */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * The single login's credentials.
 *
 * In development these fall back to `admin` / `seo-dashboard` so a fresh clone
 * boots with no setup. In **production there is no fallback**: if the env vars
 * are missing, `configured` is false and the login route refuses every attempt.
 * Otherwise a deployed instance would sit on the public internet accepting a
 * password that is published in this repository.
 */
export function authCredentials() {
  const rawUser = process.env.DASHBOARD_USERNAME?.trim() ?? '';
  const rawPass = process.env.DASHBOARD_PASSWORD?.trim() ?? '';

  if (IS_PRODUCTION) {
    return {
      username: rawUser,
      password: rawPass,
      isDefault: false,
      // Both must be present, and a deploy must not reuse the dev values.
      configured:
        rawUser.length > 0 &&
        rawPass.length > 0 &&
        !(rawUser === DEV_FALLBACK_USERNAME && rawPass === DEV_FALLBACK_PASSWORD),
    };
  }

  return {
    username: rawUser || DEV_FALLBACK_USERNAME,
    password: rawPass || DEV_FALLBACK_PASSWORD,
    isDefault: !rawUser || !rawPass,
    configured: true,
  };
}

/**
 * The session-signing key.
 *
 * In production a missing key is fatal rather than defaulted: the fallback is a
 * constant in this repository, so signing with it would let anyone forge a
 * session cookie and walk straight past the login.
 */
export function authSecret() {
  const secret = process.env.AUTH_SECRET?.trim() ?? '';
  if (IS_PRODUCTION) {
    if (secret.length < 32 || secret === DEV_FALLBACK_SECRET) {
      throw new Error(
        'AUTH_SECRET is missing or too short. Set it to 32+ random characters in the production environment.',
      );
    }
    return secret;
  }
  return secret || DEV_FALLBACK_SECRET;
}

/** Whether this deployment is safe to expose. Used by the login screen. */
export function authReadiness() {
  const { configured } = authCredentials();
  const secret = process.env.AUTH_SECRET?.trim() ?? '';
  const secretOk = !IS_PRODUCTION || (secret.length >= 32 && secret !== DEV_FALLBACK_SECRET);

  const missing = [
    !process.env.DASHBOARD_USERNAME?.trim() && 'DASHBOARD_USERNAME',
    !process.env.DASHBOARD_PASSWORD?.trim() && 'DASHBOARD_PASSWORD',
    !secretOk && 'AUTH_SECRET (32+ characters)',
  ].filter(Boolean) as string[];

  return { ready: configured && secretOk, missing, isProduction: IS_PRODUCTION };
}

export function sessionHours() {
  const raw = Number(process.env.SESSION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
}

export function defaultDomain() {
  return normalizeDomain(process.env.DEFAULT_DOMAIN || 'example.com');
}

export function normalizeDomain(input: string) {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/** Which data source a panel is actually reading from. */
export type ProviderMode = 'live' | 'seed';

export type ProviderStatus = {
  mode: ProviderMode;
  provider: string;
  /** Shown in the UI when mode is `seed` so nobody mistakes it for real data. */
  note: string;
};

export function backlinkProviderStatus(): ProviderStatus {
  const provider = (process.env.BACKLINK_PROVIDER || 'seed').toLowerCase();
  if (provider === 'crawly' && process.env.CRAWLY_API_KEY) {
    return { mode: 'live', provider: 'Crawly', note: '' };
  }
  return {
    mode: 'seed',
    provider: 'seeded',
    note: 'Set BACKLINK_PROVIDER + CRAWLY_API_KEY to pull live referring domains and DA/PA.',
  };
}

/**
 * Rank tracking status from environment variables alone.
 *
 * Search Console is the default source and is resolved asynchronously in
 * `getKeywordReport` (it depends on the connected account and which properties
 * it owns, neither of which this sync helper can see). So the `seed` reported
 * here is only the *fallback* — the note describes the paid upgrade path, not a
 * failure, and is replaced when Search Console answers.
 */
export function rankProviderStatus(): ProviderStatus {
  const provider = (process.env.RANK_PROVIDER || 'gsc').toLowerCase();
  if (provider === 'seranking' && process.env.SERANKING_API_KEY) {
    return { mode: 'live', provider: 'SE Ranking', note: '' };
  }
  return {
    mode: 'seed',
    provider: 'seeded',
    note:
      provider === 'seed'
        ? 'RANK_PROVIDER=seed forces seeded data. Remove it to use Search Console, or set RANK_PROVIDER=seranking + SERANKING_API_KEY for volume/difficulty/CPC.'
        : 'Search Console could not answer for this domain. A paid tracker (RANK_PROVIDER=seranking + SERANKING_API_KEY) adds search volume, difficulty and CPC.',
  };
}

export function adsProviderStatus(): ProviderStatus {
  const provider = (process.env.ADS_PROVIDER || 'seed').toLowerCase();
  // Client id/secret are required to exchange the refresh token for an access
  // token, so they count as "wired" too — without them the live fetch would
  // fail on its first call regardless of the other three being present.
  const wired =
    !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    !!process.env.GOOGLE_ADS_CLIENT_ID &&
    !!process.env.GOOGLE_ADS_CLIENT_SECRET &&
    !!process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    !!process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (provider === 'google' && wired) {
    return { mode: 'live', provider: 'Google Ads API', note: '' };
  }

  // Name the specific gap rather than the whole list — much faster to fix.
  const gaps = [
    !process.env.GOOGLE_ADS_DEVELOPER_TOKEN && 'GOOGLE_ADS_DEVELOPER_TOKEN',
    !process.env.GOOGLE_ADS_CLIENT_ID && 'GOOGLE_ADS_CLIENT_ID',
    !process.env.GOOGLE_ADS_CLIENT_SECRET && 'GOOGLE_ADS_CLIENT_SECRET',
    !process.env.GOOGLE_ADS_REFRESH_TOKEN && 'GOOGLE_ADS_REFRESH_TOKEN',
    !process.env.GOOGLE_ADS_CUSTOMER_ID && 'GOOGLE_ADS_CUSTOMER_ID',
  ].filter(Boolean) as string[];

  return {
    mode: 'seed',
    provider: 'seeded',
    note:
      provider !== 'google'
        ? 'Set ADS_PROVIDER=google plus the GOOGLE_ADS_* credentials to pull live campaign data.'
        : `ADS_PROVIDER=google but still missing: ${gaps.join(', ')}.`,
  };
}

/**
 * Every Google Ads credential in one place, for the adapter to consume.
 *
 * `loginCustomerId` is the manager (MCC) account id and becomes the
 * `login-customer-id` header. It is required whenever you read a client account
 * through a manager account, and omitting it is the most common cause of a 400
 * from the Ads API — so it is surfaced here rather than left to the caller.
 */
export function googleAdsConfig() {
  const digitsOnly = (value: string | undefined) => (value ?? '').replace(/\D/g, '');
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() ?? '',
    clientId: process.env.GOOGLE_ADS_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ?? '',
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim() ?? '',
    // The API rejects dashes in customer ids.
    customerId: digitsOnly(process.env.GOOGLE_ADS_CUSTOMER_ID),
    loginCustomerId: digitsOnly(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
  };
}

export function gscStatus(): ProviderStatus {
  if (process.env.GSC_ACCESS_TOKEN && process.env.GSC_SITE_URL) {
    return { mode: 'live', provider: 'Search Console', note: '' };
  }
  return {
    mode: 'seed',
    provider: 'simulated',
    note: 'Set GSC_ACCESS_TOKEN + GSC_SITE_URL to submit sitemaps to Search Console for real.',
  };
}

export function pageSpeedKey() {
  return process.env.PAGESPEED_API_KEY?.trim() || '';
}
