import { adsProviderStatus, googleAdsConfig, type ProviderStatus } from '../env';
import { withTtlCache } from './cache';
import { missingIdReason, providerIdsFor } from '../client-config';
import { getConnection } from './googleAuth';
import { formatCustomerId, microsToUnits, runGaql, type GaqlRow } from './googleAdsClient';
import { floatBetween, intBetween, isoDaysAgo, makeRandom, todayUtc, walk } from './seed';

export type CampaignStatus = 'enabled' | 'paused' | 'limited';

export type Campaign = {
  id: string;
  name: string;
  channel: 'Search' | 'Performance Max' | 'Display' | 'Video';
  status: CampaignStatus;
  dailyBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  impressionShare: number;
  /** Month-to-date spend, used by the budget alert engine. */
  spendMtd: number;
  budgetMonthly: number;
};

export type AdsReport = {
  domain: string;
  customerId: string;
  rangeDays: number;
  provider: ProviderStatus;
  /**
   * False when this client has no Google Ads account configured and seeding was
   * therefore suppressed. Every figure below is zero in that case.
   *
   * The distinction matters because seeded ad data is not a harmless
   * placeholder: a client that runs no paid media was being shown invented
   * spend, campaigns and ROAS, and the budget-alert engine then fired real
   * warnings about a fabricated budget. Zero is wrong-but-inert; $633 of spend
   * on six campaigns that do not exist is actively misleading.
   */
  available: boolean;
  generatedAt: string;
  summary: {
    spend: number;
    spendDelta: number;
    clicks: number;
    impressions: number;
    ctr: number;
    cpc: number;
    conversions: number;
    conversionsDelta: number;
    cpa: number;
    conversionValue: number;
    roas: number;
    monthlyBudget: number;
    spendMtd: number;
  };
  /** Daily spend — single-series trend over time. */
  daily: { date: string; spend: number; clicks: number; conversions: number }[];
  campaigns: Campaign[];
  /** Conversions by campaign — magnitude comparison, sequential encoding. */
  conversionsByCampaign: { name: string; conversions: number; spend: number }[];
  devices: { device: string; spend: number; conversions: number }[];
  searchTerms: { term: string; clicks: number; cost: number; conversions: number }[];
};

const CAMPAIGN_SEEDS: { name: string; channel: Campaign['channel']; weight: number }[] = [
  { name: 'Brand — Exact', channel: 'Search', weight: 0.9 },
  { name: 'Non-Brand — Core Services', channel: 'Search', weight: 1.6 },
  { name: 'Non-Brand — Local Intent', channel: 'Search', weight: 1.2 },
  { name: 'Performance Max — All Services', channel: 'Performance Max', weight: 1.4 },
  { name: 'Competitor Conquesting', channel: 'Search', weight: 0.7 },
  { name: 'Remarketing — Display', channel: 'Display', weight: 0.5 },
];

const SEARCH_TERMS = [
  'home care near me', 'in home senior care cost', 'best caregiver agency',
  '24 hour care at home', 'respite care services', 'dementia home care',
  'private duty nursing rates', 'elderly companion care', 'home health aide hire',
  'live in caregiver cost', 'senior care agency reviews', 'post surgery home care',
];

/** Google's advertising_channel_type enum -> this app's narrower channel union. */
const CHANNEL_MAP: Record<string, Campaign['channel']> = {
  SEARCH: 'Search',
  DISPLAY: 'Display',
  VIDEO: 'Video',
  PERFORMANCE_MAX: 'Performance Max',
  // No dedicated bucket for these in this UI — folded into the closest fit.
  SHOPPING: 'Search',
  LOCAL: 'Search',
  SMART: 'Search',
  HOTEL: 'Search',
  MULTI_CHANNEL: 'Search',
  DISCOVERY: 'Display',
  DEMAND_GEN: 'Display',
};

function mapChannel(raw: string | undefined): Campaign['channel'] {
  return CHANNEL_MAP[raw ?? ''] ?? 'Search';
}

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: 'Mobile',
  DESKTOP: 'Desktop',
  TABLET: 'Tablet',
  CONNECTED_TV: 'Connected TV',
  OTHER: 'Other',
};

/**
 * Live Google Ads report — 6 parallel GAQL queries mapped into `AdsReport`.
 * Queries and gotchas are documented in API-INTEGRATION.md §7; the short
 * version: cost/budget/CPC fields are micros, `conversions_value` is NOT
 * (it's already in account currency), and CTR / impression share come back
 * as fractions (0.0499) rather than percentages.
 *
 * "Limited by budget" isn't a status field — it's inferred from
 * `search_budget_lost_impression_share` crossing a small threshold, the same
 * signal Google's own UI uses for that badge.
 */
async function fetchLiveAdsReport(
  domain: string,
  customerIdInput: string,
  rangeDays: number,
  window: { from: string; to: string } | undefined,
  provider: ProviderStatus,
): Promise<AdsReport> {
  const customerId = customerIdInput.replace(/\D/g, '');
  /*
   * An explicit window is used as given; the comparison period is the same
   * span immediately before it, so a delta stays meaningful for a historical
   * range rather than being measured against the last N days.
   */
  const end = window ? window.to : isoDaysAgo(0);
  const start = window ? window.from : isoDaysAgo(rangeDays - 1);
  const shiftDays = (iso: string, days: number) =>
    new Date(new Date(`${iso}T00:00:00Z`).getTime() - days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const prevEnd = window ? shiftDays(start, 1) : isoDaysAgo(rangeDays);
  const prevStart = window ? shiftDays(start, rangeDays) : isoDaysAgo(rangeDays * 2 - 1);

  const [campaignRows, dailyRows, searchTermRows, deviceRows, mtdRows, previousRows] =
    await Promise.all([
      runGaql(
        customerId,
        `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
                campaign_budget.amount_micros,
                metrics.cost_micros, metrics.impressions, metrics.clicks,
                metrics.conversions, metrics.conversions_value,
                metrics.ctr, metrics.average_cpc, metrics.search_impression_share,
                metrics.search_budget_lost_impression_share
         FROM campaign
         WHERE segments.date BETWEEN '${start}' AND '${end}'`,
      ),
      runGaql(
        customerId,
        `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions
         FROM customer
         WHERE segments.date BETWEEN '${start}' AND '${end}'
         ORDER BY segments.date`,
      ),
      runGaql(
        customerId,
        `SELECT search_term_view.search_term, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM search_term_view
         WHERE segments.date BETWEEN '${start}' AND '${end}'
         ORDER BY metrics.cost_micros DESC
         LIMIT 25`,
      ),
      runGaql(
        customerId,
        `SELECT segments.device, metrics.cost_micros, metrics.conversions
         FROM customer
         WHERE segments.date BETWEEN '${start}' AND '${end}'`,
      ),
      runGaql(
        customerId,
        `SELECT campaign.id, metrics.cost_micros
         FROM campaign
         WHERE segments.date DURING THIS_MONTH`,
      ),
      runGaql(
        customerId,
        `SELECT metrics.cost_micros, metrics.conversions
         FROM customer
         WHERE segments.date BETWEEN '${prevStart}' AND '${prevEnd}'`,
      ),
    ]);

  const mtdByCampaign = new Map<string, number>();
  for (const row of mtdRows) {
    mtdByCampaign.set(String(row.campaign?.id), microsToUnits(row.metrics?.costMicros));
  }

  const monthDays = daysInCurrentMonth();

  const campaigns: Campaign[] = campaignRows
    .filter((row: GaqlRow) => row.campaign?.status !== 'REMOVED')
    .map((row: GaqlRow) => {
      const id = String(row.campaign?.id ?? '');
      const spend = microsToUnits(row.metrics?.costMicros);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const impressions = Number(row.metrics?.impressions ?? 0);
      const conversions = Number(row.metrics?.conversions ?? 0);
      // Conversion *value* is already in account currency, unlike cost/budget/CPC.
      const conversionValue = Number(row.metrics?.conversionsValue ?? 0);
      const dailyBudget = microsToUnits(row.campaignBudget?.amountMicros);
      const budgetLostShare = Number(row.metrics?.searchBudgetLostImpressionShare ?? 0);

      const campaign: Campaign = {
        id,
        name: String(row.campaign?.name ?? id),
        channel: mapChannel(row.campaign?.advertisingChannelType),
        status: row.campaign?.status === 'PAUSED' ? 'paused' : budgetLostShare > 0.01 ? 'limited' : 'enabled',
        dailyBudget: Number(dailyBudget.toFixed(2)),
        spend: Number(spend.toFixed(2)),
        impressions,
        clicks,
        conversions: Number(conversions.toFixed(1)),
        conversionValue: Number(conversionValue.toFixed(2)),
        ctr: Number((Number(row.metrics?.ctr ?? 0) * 100).toFixed(2)),
        cpc: Number(microsToUnits(row.metrics?.averageCpc).toFixed(2)),
        cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
        roas: spend > 0 ? Number((conversionValue / spend).toFixed(2)) : 0,
        impressionShare: Number((Number(row.metrics?.searchImpressionShare ?? 0) * 100).toFixed(1)),
        spendMtd: Number((mtdByCampaign.get(id) ?? 0).toFixed(2)),
        budgetMonthly: Number((dailyBudget * monthDays).toFixed(2)),
      };
      return campaign;
    });

  const daily = dailyRows.map((row: GaqlRow) => ({
    date: String(row.segments?.date ?? ''),
    spend: Number(microsToUnits(row.metrics?.costMicros).toFixed(2)),
    clicks: Number(row.metrics?.clicks ?? 0),
    conversions: Number(Number(row.metrics?.conversions ?? 0).toFixed(1)),
  }));

  const totalSpend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const totalClicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0);
  const totalImpressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0);
  const totalConversions = campaigns.reduce((sum, campaign) => sum + campaign.conversions, 0);
  const totalConversionValue = campaigns.reduce((sum, campaign) => sum + campaign.conversionValue, 0);
  const monthlyBudget = campaigns.reduce((sum, campaign) => sum + campaign.budgetMonthly, 0);
  const spendMtd = campaigns.reduce((sum, campaign) => sum + campaign.spendMtd, 0);

  const previous = previousRows[0] ?? {};
  const previousSpend = microsToUnits(previous.metrics?.costMicros);
  const previousConversions = Number(previous.metrics?.conversions ?? 0);

  const devices = deviceRows.map((row: GaqlRow) => ({
    device: DEVICE_LABELS[row.segments?.device] ?? String(row.segments?.device ?? 'Other'),
    spend: Number(microsToUnits(row.metrics?.costMicros).toFixed(2)),
    conversions: Number(Number(row.metrics?.conversions ?? 0).toFixed(1)),
  }));

  const searchTerms = searchTermRows.map((row: GaqlRow) => ({
    term: String(row.searchTermView?.searchTerm ?? ''),
    clicks: Number(row.metrics?.clicks ?? 0),
    cost: Number(microsToUnits(row.metrics?.costMicros).toFixed(2)),
    conversions: Number(Number(row.metrics?.conversions ?? 0).toFixed(1)),
  }));

  return {
    domain,
    available: true,
    customerId: formatCustomerId(customerId),
    rangeDays,
    provider,
    generatedAt: new Date().toISOString(),
    summary: {
      spend: Number(totalSpend.toFixed(2)),
      spendDelta:
        previousSpend > 0 ? Number((((totalSpend - previousSpend) / previousSpend) * 100).toFixed(1)) : 0,
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      cpc: totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0,
      conversions: Number(totalConversions.toFixed(1)),
      conversionsDelta:
        previousConversions > 0
          ? Number((((totalConversions - previousConversions) / previousConversions) * 100).toFixed(1))
          : 0,
      cpa: Number((totalSpend / Math.max(1, totalConversions)).toFixed(2)),
      conversionValue: Number(totalConversionValue.toFixed(2)),
      roas: totalSpend > 0 ? Number((totalConversionValue / totalSpend).toFixed(2)) : 0,
      monthlyBudget: Number(monthlyBudget.toFixed(2)),
      spendMtd: Number(spendMtd.toFixed(2)),
    },
    daily,
    campaigns,
    conversionsByCampaign: campaigns
      .map((campaign) => ({ name: campaign.name, conversions: campaign.conversions, spend: campaign.spend }))
      .sort((a, b) => b.conversions - a.conversions),
    devices,
    searchTerms,
  };
}

/**
 * Google Ads report — live when `ADS_PROVIDER=google` plus all five
 * `GOOGLE_ADS_*` credentials are set (see `adsProviderStatus`), seeded
 * otherwise. A live fetch that fails for any reason (bad token, developer
 * token not yet approved, wrong customer id, network) falls back to seeded
 * data rather than crashing the page — the failure reason is surfaced in
 * `provider.note` instead of being swallowed.
 */
export async function getAdsReport(
  domainInput: string,
  rangeDays = 30,
  window?: { from: string; to: string },
): Promise<AdsReport> {
  const domain = domainInput.replace(/^www\./, '').toLowerCase();
  // 6 GAQL queries per report — cache so navigating between the ads pages and
  // the overview does not re-run them all on every render.
  // The cache key carries the explicit window; without it a custom range would
  // be served the cached rolling window for the same day count.
  const key = window
    ? `ads:${domain}:${window.from}:${window.to}`
    : `ads:${domain}:${rangeDays}`;
  return withTtlCache(key, ADS_CACHE_TTL_MS, () => buildAdsReport(domain, rangeDays, window));
}

/*
 * Five minutes, not one.
 *
 * A 60-second TTL meant almost every navigation back to the Overview paid the
 * full provider fan-out again — measured at 2.8s cold against 0.37s warm. None
 * of these sources changes minute to minute (GA4 and Search Console lag by a
 * day or more), so a short TTL bought staleness protection nobody needed at the
 * cost of the slowest page in the app.
 */
/**
 * A structurally complete report with every figure at zero.
 *
 * Returned instead of seeded data when no Ads account is configured. Keeping the
 * full shape means consumers that have not been taught to check `available`
 * render zeros rather than crashing — wrong but inert, which is the safe
 * failure here.
 */
function emptyAdsReport(
  domain: string,
  rangeDays: number,
  provider: ProviderStatus,
): AdsReport {
  return {
    domain,
    available: false,
    customerId: '',
    rangeDays,
    provider,
    generatedAt: new Date().toISOString(),
    summary: {
      spend: 0,
      spendDelta: 0,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      cpc: 0,
      conversions: 0,
      conversionsDelta: 0,
      cpa: 0,
      conversionValue: 0,
      roas: 0,
      monthlyBudget: 0,
      spendMtd: 0,
    },
    daily: [],
    campaigns: [],
    conversionsByCampaign: [],
    devices: [],
    searchTerms: [],
  };
}

const ADS_CACHE_TTL_MS = 5 * 60_000;

async function buildAdsReport(
  domain: string,
  rangeDays: number,
  window?: { from: string; to: string },
): Promise<AdsReport> {
  const provider = adsProviderStatus();
  const config = googleAdsConfig();

  /*
   * The Ads customer id is per client. It used to come straight from
   * `GOOGLE_ADS_CUSTOMER_ID`, one global value, so every client on the roster
   * reported the first client's campaigns and spend. `providerIdsFor` returns
   * the client's own id and only falls back to the env var while a single
   * client exists.
   */
  const ids = await providerIdsFor(domain);
  const customerId = ids.adsCustomerId ?? '';

  /*
   * Readiness is resolved here rather than in `adsProviderStatus()` because a
   * Google account connected through the UI satisfies the refresh-token
   * requirement, and that lives in an async store the sync env helper cannot
   * see. Everything else is still a plain env check.
   */
  if ((process.env.ADS_PROVIDER ?? '').toLowerCase() === 'google') {
    const connected = (await getConnection()).connected;
    const missing = [
      !config.developerToken && 'GOOGLE_ADS_DEVELOPER_TOKEN',
      !config.clientId && 'GOOGLE_ADS_CLIENT_ID',
      !config.clientSecret && 'GOOGLE_ADS_CLIENT_SECRET',
      !customerId && missingIdReason('Google Ads', ids, 'Google Ads customer ID'),
      !config.refreshToken && !connected && 'GOOGLE_ADS_REFRESH_TOKEN (or connect a Google account in Settings)',
    ].filter(Boolean) as string[];

    if (missing.length === 0) {
      // `adsProviderStatus()` can only read env vars, so when a connected Google
      // account is what satisfies the refresh-token requirement it still reports
      // "seeded" with a stale "missing GOOGLE_ADS_REFRESH_TOKEN" note. Correct
      // the whole status here, not just the mode, or callers surface
      // contradictory state (mode: live, provider: seeded).
      provider.mode = 'live';
      provider.provider = connected ? 'Google Ads API (connected account)' : 'Google Ads API';
      provider.note = '';
      try {
        return await fetchLiveAdsReport(domain, customerId, rangeDays, window, provider);
      } catch (error) {
        provider.mode = 'seed';
        const raw = error instanceof Error ? error.message : 'Unknown error.';

        // Two setup failures dominate, and Google's wording buries the fix.
        let hint = '';
        if (/has not been used in project|is disabled/i.test(raw)) {
          hint =
            ' → The Google Ads API is not enabled in your Google Cloud project. Enable it once at console.cloud.google.com → APIs & Services → Library → "Google Ads API" → Enable.';
        } else if (/developer token/i.test(raw)) {
          hint =
            ' → Check GOOGLE_ADS_DEVELOPER_TOKEN. A token with Test access only works against Google test accounts, not a live account.';
        } else if (/login-customer-id|USER_PERMISSION_DENIED/i.test(raw)) {
          hint =
            ' → Set GOOGLE_ADS_LOGIN_CUSTOMER_ID to the manager (MCC) account id when reading a client account.';
        }

        provider.note = `Google Ads live fetch failed — showing seeded data. ${raw}${hint}`;
      }
    } else {
      provider.mode = 'seed';
      provider.note = `ADS_PROVIDER=google but still missing: ${missing.join(', ')}.`;
    }
  }

  /*
   * No account for this client: report nothing rather than inventing a campaign
   * set. Only enforced once the roster holds more than one client — a
   * single-client or fresh install keeps the seeded demo, where there is no
   * other business for the numbers to be mistaken for.
   */
  if (!customerId && ids.multiClient) {
    return emptyAdsReport(domain, rangeDays, {
      mode: 'seed',
      provider: 'Google Ads',
      note: missingIdReason('Google Ads', ids, 'Google Ads customer ID'),
    });
  }

  const random = makeRandom(`ads:${domain}:${rangeDays}`);
  const accountScale = floatBetween(random, 0.6, 2.4);

  // ── Daily series ────────────────────────────────────────────────────
  const baseDailySpend = 180 * accountScale;
  const spendSeries = walk(random, {
    start: baseDailySpend,
    steps: rangeDays,
    drift: floatBetween(random, -1.2, 2.4),
    volatility: baseDailySpend * 0.45,
    min: baseDailySpend * 0.25,
    max: baseDailySpend * 2.1,
  });

  const daily = spendSeries.map((spend, index) => {
    const cpc = floatBetween(random, 2.4, 9.5);
    const clicks = Math.max(1, Math.round(spend / cpc));
    const conversionRate = floatBetween(random, 0.03, 0.14);
    return {
      date: isoDaysAgo(rangeDays - 1 - index),
      spend: Number(spend.toFixed(2)),
      clicks,
      conversions: Number((clicks * conversionRate).toFixed(1)),
    };
  });

  const totalSpend = daily.reduce((sum, day) => sum + day.spend, 0);
  const totalClicks = daily.reduce((sum, day) => sum + day.clicks, 0);
  const totalConversions = daily.reduce((sum, day) => sum + day.conversions, 0);
  const totalImpressions = Math.round(totalClicks / floatBetween(random, 0.035, 0.085));
  // Value per conversion sized so blended ROAS lands in a believable
  // 1.5×–6× band rather than the double digits.
  const conversionValue = totalConversions * floatBetween(random, 90, 340);

  // Compare against the previous equal-length window.
  const previousSpend = totalSpend * floatBetween(random, 0.78, 1.18);
  const previousConversions = totalConversions * floatBetween(random, 0.72, 1.24);

  // ── Campaign split ──────────────────────────────────────────────────
  const totalWeight = CAMPAIGN_SEEDS.reduce((sum, seed) => sum + seed.weight, 0);
  const currentDay = todayUtc().getUTCDate();

  const campaigns: Campaign[] = CAMPAIGN_SEEDS.map((seed, index) => {
    const share = seed.weight / totalWeight;
    const spend = totalSpend * share * floatBetween(random, 0.85, 1.15);
    const cpc = floatBetween(random, seed.channel === 'Search' ? 2.8 : 1.1, seed.channel === 'Search' ? 11 : 4.5);
    const clicks = Math.max(1, Math.round(spend / cpc));
    const impressions = Math.round(clicks / floatBetween(random, 0.03, 0.12));
    const conversions = Number((clicks * floatBetween(random, 0.02, 0.16)).toFixed(1));
    const value = conversions * floatBetween(random, 80, 360);
    const dailyBudget = Math.round((spend / rangeDays) * floatBetween(random, 1.05, 1.45));
    const budgetMonthly = dailyBudget * 30;

    return {
      id: `camp-${index}`,
      name: seed.name,
      channel: seed.channel,
      status: index === CAMPAIGN_SEEDS.length - 1 ? 'paused' : index === 1 ? 'limited' : 'enabled',
      dailyBudget,
      spend: Number(spend.toFixed(2)),
      impressions,
      clicks,
      conversions,
      conversionValue: Number(value.toFixed(2)),
      ctr: Number(((clicks / impressions) * 100).toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
      roas: spend > 0 ? Number((value / spend).toFixed(2)) : 0,
      impressionShare: Number(floatBetween(random, 22, 88).toFixed(1)),
      spendMtd: Number(((spend / rangeDays) * currentDay * floatBetween(random, 0.9, 1.1)).toFixed(2)),
      budgetMonthly,
    };
  });

  const monthlyBudget = campaigns.reduce((sum, campaign) => sum + campaign.budgetMonthly, 0);
  const spendMtd = campaigns.reduce((sum, campaign) => sum + campaign.spendMtd, 0);

  return {
    domain,
    available: true,
    // Prefer the configured account so the header matches .env.local even
    // while the figures below are seeded.
    customerId: customerId
      ? formatCustomerId(customerId)
      : `${intBetween(random, 100, 999)}-${intBetween(random, 100, 999)}-${intBetween(random, 1000, 9999)}`,
    rangeDays,
    provider,
    generatedAt: new Date().toISOString(),
    summary: {
      spend: Number(totalSpend.toFixed(2)),
      spendDelta: Number((((totalSpend - previousSpend) / previousSpend) * 100).toFixed(1)),
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: Number(((totalClicks / totalImpressions) * 100).toFixed(2)),
      cpc: Number((totalSpend / totalClicks).toFixed(2)),
      conversions: Number(totalConversions.toFixed(1)),
      conversionsDelta: Number(
        (((totalConversions - previousConversions) / previousConversions) * 100).toFixed(1),
      ),
      cpa: Number((totalSpend / Math.max(1, totalConversions)).toFixed(2)),
      conversionValue: Number(conversionValue.toFixed(2)),
      roas: Number((conversionValue / totalSpend).toFixed(2)),
      monthlyBudget: Number(monthlyBudget.toFixed(2)),
      spendMtd: Number(spendMtd.toFixed(2)),
    },
    daily,
    campaigns,
    conversionsByCampaign: campaigns
      .map((campaign) => ({
        name: campaign.name,
        conversions: campaign.conversions,
        spend: campaign.spend,
      }))
      .sort((a, b) => b.conversions - a.conversions),
    devices: (['Mobile', 'Desktop', 'Tablet'] as const).map((device, index) => {
      const share = [0.58, 0.36, 0.06][index];
      return {
        device,
        spend: Number((totalSpend * share).toFixed(2)),
        conversions: Number((totalConversions * share * floatBetween(random, 0.85, 1.2)).toFixed(1)),
      };
    }),
    searchTerms: SEARCH_TERMS.slice(0, 10)
      .map((term) => {
        const clicks = intBetween(random, 8, 240);
        return {
          term,
          clicks,
          cost: Number((clicks * floatBetween(random, 2.2, 9)).toFixed(2)),
          conversions: Number((clicks * floatBetween(random, 0.01, 0.15)).toFixed(1)),
        };
      })
      .sort((a, b) => b.cost - a.cost),
  };
}

/** Days remaining in the current calendar month, inclusive of today. */
export function daysLeftInMonth() {
  const today = todayUtc();
  const daysInMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return daysInMonth - today.getUTCDate() + 1;
}

export function daysElapsedInMonth() {
  return todayUtc().getUTCDate();
}

export function daysInCurrentMonth() {
  const today = todayUtc();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
}
