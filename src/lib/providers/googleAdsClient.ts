/**
 * Thin Google Ads API REST client.
 *
 * Deliberately plain `fetch`, not the `google-ads-api` npm package — this app
 * has no other SDK dependencies, and that package's gRPC/native bindings are
 * an awkward fit for portability to serverless. Auth is a standard OAuth
 * refresh-token exchange; the resulting access token is cached in memory for
 * its ~1h lifetime so one page load running 6 parallel GAQL queries costs one
 * token exchange, not six.
 *
 * API VERSION: Google sunsets a version roughly once a year, and a sunset
 * version returns 404 for every call. Probed 2026-08-12: v16–v19 were already
 * gone, v20/v21/v22 alive — so this defaults to v22 and is overridable without
 * a code change.
 *
 * To re-probe without credentials, POST to the endpoint with junk auth: a
 * version that still exists answers 401/403 (auth rejected), one that is gone
 * answers 404.
 *
 *   curl -o /dev/null -w "%{http_code}" -X POST  *     https://googleads.googleapis.com/v22/customers/1234567890/googleAds:searchStream  *     -H "developer-token: probe" -H "authorization: Bearer probe"  *     -H "content-type: application/json" --data '{"query":"SELECT campaign.id FROM campaign"}'
 */

import { getGoogleAccessToken } from './googleAuth';

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION?.trim() || 'v22';

/** One row from a `searchStream` response. Field names are camelCase — see note below. */
export type GaqlRow = Record<string, any>;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // A Google account connected through the UI takes precedence — it manages its
  // own refresh, so GOOGLE_ADS_REFRESH_TOKEN becomes optional.
  const connected = await getGoogleAccessToken();
  if (connected) return connected;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OAuth token refresh failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = JSON.parse(body) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * `searchStream` responses come back as either one JSON array of chunk
 * objects or newline-delimited JSON, depending on how the runtime buffers the
 * response — both are handled rather than assumed.
 */
function parseSearchStreamBody(text: string): GaqlRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    const chunks = Array.isArray(parsed) ? parsed : [parsed];
    return chunks.flatMap((chunk) => chunk.results ?? []);
  } catch {
    return trimmed
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return JSON.parse(line).results ?? [];
        } catch {
          return [];
        }
      });
  }
}

/**
 * Run one GAQL query against a customer account.
 *
 * GOTCHA: the query itself is written in snake_case (`metrics.cost_micros`)
 * but the JSON response uses camelCase keys (`row.metrics.costMicros`) — that
 * mismatch is the single most common reason a mapper silently reads
 * `undefined` everywhere. Access response fields in camelCase.
 */
export async function runGaql(customerId: string, query: string): Promise<GaqlRow[]> {
  const token = await getAccessToken();
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();

  const headers: Record<string, string> = {
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId.replace(/\D/g, '');

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text)?.error?.message ?? text;
    } catch {
      /* not JSON — use the raw body */
    }
    throw new Error(`Google Ads API ${response.status}: ${message.slice(0, 300)}`);
  }

  return parseSearchStreamBody(text);
}

/** "2770928398" -> "277-092-8398", matching how Google Ads' own UI shows it. */
export function formatCustomerId(id: string) {
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 10) return id;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const MICROS = 1_000_000;

/** Cost, budget and CPC fields are all in micros. Conversion *value* fields are not — see mapper. */
export function microsToUnits(value: unknown): number {
  return Number(value ?? 0) / MICROS;
}
