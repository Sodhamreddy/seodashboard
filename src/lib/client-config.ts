import { loadClients } from './clients';
import { googleAdsConfig } from './env';

/**
 * Which provider account each domain maps to.
 *
 * The problem this solves: `GA4_PROPERTY_ID` and `GOOGLE_ADS_CUSTOMER_ID` are
 * single global values. With one client that is fine. With three, every client
 * inherited the first one's accounts and the dashboard cheerfully reported one
 * business's traffic and ad spend under another's name — wrong in the most
 * expensive possible way, because it looks plausible.
 *
 * The rule, which mirrors how `resolvePropertyForDomain` already treats
 * `GSC_SITE_URL`: **an environment id is only trusted when it cannot belong to
 * someone else.** Concretely, the env fallback applies only while the roster
 * holds at most one client. Past that, a client shows a provider's data only if
 * its own record names the account — and otherwise shows an honest empty state
 * telling the operator to set it.
 *
 * Being blank is a much smaller failure than being confidently wrong.
 */

export type ClientProviderIds = {
  domain: string;
  ga4PropertyId?: string;
  adsCustomerId?: string;
  gmbLocationId?: string;
  /**
   * Where each id came from, so the UI can explain a blank panel:
   *   'client' — the roster record names it
   *   'env'    — inherited from the environment (single-client install only)
   *   'none'   — not configured for this client
   */
  source: {
    ga4: 'client' | 'env' | 'none';
    ads: 'client' | 'env' | 'none';
    gmb: 'client' | 'env' | 'none';
  };
  /** True when the env fallback was suppressed because several clients exist. */
  multiClient: boolean;
};

function clean(value: string | undefined) {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

export async function providerIdsFor(domain: string): Promise<ClientProviderIds> {
  const bare = domain.replace(/^www\./, '').toLowerCase();
  const clients = await loadClients();
  const client = clients.find((entry) => entry.domain === bare);

  // One client (or none) means the env vars can only have been meant for it.
  const envAllowed = clients.length <= 1;

  const envGa4 = envAllowed ? clean(process.env.GA4_PROPERTY_ID)?.replace(/^properties\//, '') : undefined;
  const envAds = envAllowed ? clean(googleAdsConfig().customerId) : undefined;
  const envGmb = envAllowed ? clean(process.env.GMB_LOCATION_ID)?.split('/').pop() : undefined;

  const ga4PropertyId = client?.ga4PropertyId ?? envGa4;
  const adsCustomerId = client?.adsCustomerId ?? envAds;
  const gmbLocationId = client?.gmbLocationId ?? envGmb;

  return {
    domain: bare,
    ga4PropertyId,
    adsCustomerId,
    gmbLocationId,
    source: {
      ga4: client?.ga4PropertyId ? 'client' : envGa4 ? 'env' : 'none',
      ads: client?.adsCustomerId ? 'client' : envAds ? 'env' : 'none',
      gmb: client?.gmbLocationId ? 'client' : envGmb ? 'env' : 'none',
    },
    multiClient: clients.length > 1,
  };
}

/**
 * The message a panel shows when a provider has no account for this client.
 * Phrased as the fix, and it names the client so the operator knows which row
 * in Settings to fill in.
 */
export function missingIdReason(
  provider: 'Google Analytics 4' | 'Google Ads' | 'Business Profile',
  ids: ClientProviderIds,
  field: string,
) {
  if (ids.multiClient) {
    return `${provider} has no account configured for ${ids.domain}. Set its ${field} under Settings → Client integrations — with more than one client saved, the environment variable is ignored so one client's data can never appear under another's name.`;
  }
  return `${provider} has no account configured. Set ${field} for ${ids.domain} under Settings → Client integrations.`;
}
