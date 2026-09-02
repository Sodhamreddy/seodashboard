import { NextResponse } from 'next/server';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { normalizeDomain } from '@/lib/env';
import { getAdsReport } from '@/lib/providers/ads';
import { getBacklinkReport } from '@/lib/providers/backlinks';
import { getKeywordReport } from '@/lib/providers/keywords';
import { getConnection } from '@/lib/providers/googleAuth';
import { getGscPerformance } from '@/lib/providers/searchConsole';
import {
  getGa4Report,
  ga4FailureReason,
  isGa4Failure,
  type Ga4Failure,
} from '@/lib/providers/ga4';
import { METRICS, integrationMeta } from '@/lib/builder/catalog';
import type { MetricValue } from '@/lib/builder/data';
import { rangeMeta, type RangeKey } from '@/lib/builder/types';

/**
 * Live values for report-builder widgets.
 *
 * This maps the app's existing provider adapters onto the builder's metric ids.
 * GA4 traffic is the one integration with no adapter; its metrics come back
 * `unavailable` with a reason naming what is actually missing. The builder never
 * silently substitutes sample numbers for live ones.
 */

export const dynamic = 'force-dynamic';

function scalar(value: number | undefined, previous?: number): MetricValue {
  if (value === undefined || !Number.isFinite(value)) {
    return { state: 'unavailable', reason: 'Provider returned no value' };
  }
  return { state: 'ok', value, previous };
}

function series(
  points: { date: string; value: number }[],
  options: { signed?: boolean } = {},
): MetricValue {
  if (!points.length) return { state: 'unavailable', reason: 'Provider returned no series' };
  return {
    state: 'ok',
    points,
    value: points[points.length - 1].value,
    previous: options.signed ? undefined : points[0].value,
  };
}

/**
 * Resolves which domain this request is for.
 *
 * A report is bound to a client, so the builder passes `?domain=`. That value is
 * only honoured when it matches a domain already on the roster — the parameter
 * selects between saved clients, it does not let a caller point the provider
 * adapters at an arbitrary host. Anything unrecognised falls back to the
 * session's active domain rather than erroring, so an older saved report keeps
 * rendering.
 */
async function resolveDomain(requested: string | null) {
  const active = getActiveDomain();
  if (!requested) return active;

  const normalized = normalizeDomain(requested);
  if (!normalized || normalized === active) return active;

  const clients = await loadClients();
  return clients.some((client) => client.domain === normalized) ? normalized : active;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = (url.searchParams.get('range') ?? 'last30') as RangeKey;
  const days = rangeMeta(range).days;
  const domain = await resolveDomain(url.searchParams.get('domain'));

  /*
   * GSC performance and the Google connection status are fetched here rather
   * than derived from the keyword report: the keyword report is shaped per
   * query and carries no daily site totals, which is what the GSC series
   * widgets need. `getGscPerformance` resolves to null when no property matches
   * the domain, and that is reported differently from "not connected".
   */
  const [keywords, backlinks, ads, gsc, ga4, google] = await Promise.all([
    getKeywordReport(domain),
    getBacklinkReport(domain, days),
    getAdsReport(domain, days),
    getGscPerformance(domain, { windowDays: days }).catch(() => null),
    getGa4Report(domain, { windowDays: days }).catch(
      (error: unknown): Ga4Failure => ({ kind: 'error', detail: String(error).slice(0, 200) }),
    ),
    getConnection().catch(() => null),
  ]);

  // Resolved once: either a report to map, or the reason every traffic widget
  // will show instead.
  const ga4Report = isGa4Failure(ga4) ? null : ga4;
  const ga4Reason = isGa4Failure(ga4) ? ga4FailureReason(ga4) : null;

  const metrics: Record<string, MetricValue> = {};

  /* ── Rankings ────────────────────────────────────────────────────── */
  metrics.google_rankings = scalar(keywords.summary.top10);
  metrics.keywords_tracked = scalar(keywords.summary.tracked);
  metrics.top10_keywords = scalar(keywords.summary.top10);
  metrics.avg_position = scalar(keywords.summary.averagePosition);
  metrics.visibility = series(
    keywords.visibilityTrend.map((point) => ({ date: point.date, value: point.visibility })),
  );
  // Net weekly movement in visibility — the closest thing the rank provider
  // exposes to AgencyAnalytics' "Google Change".
  metrics.google_change = series(
    keywords.visibilityTrend.slice(1).map((point, index) => ({
      date: point.date,
      value: Number((point.visibility - keywords.visibilityTrend[index].visibility).toFixed(1)),
    })),
    { signed: true },
  );
  metrics.rank_distribution = {
    state: 'ok',
    slices: keywords.distribution.map((bucket) => ({ label: bucket.bucket, value: bucket.count })),
    value: keywords.summary.tracked,
  };
  metrics.keyword_movers = {
    state: 'ok',
    columns: [
      { key: 'keyword', label: 'Keyword' },
      { key: 'position', label: 'Position', format: 'number' },
      { key: 'change', label: 'Change', format: 'number' },
    ],
    rows: keywords.movers.map((mover) => ({
      keyword: mover.keyword,
      position: mover.position ?? '—',
      change: mover.change,
    })),
  };

  /* ── Backlinks ───────────────────────────────────────────────────── */
  /*
   * In `crawly` mode the index measures current totals but exposes no link
   * history, so `trend` is empty and these two series cannot be drawn. Saying
   * that plainly beats the generic "returned no series" — the totals are real
   * and available as stat widgets, which is the actionable part.
   */
  const noHistory =
    backlinks.trend.length === 0
      ? ({
          state: 'unavailable',
          reason: `${backlinks.provider.provider} measures current totals but provides no link history, so this trend cannot be drawn. Use the New / Lost / Referring domains stat widgets instead.`,
        } as const)
      : null;

  metrics.referring_domains =
    noHistory ??
    series(backlinks.trend.map((point) => ({ date: point.date, value: point.referringDomains })));
  metrics.total_backlinks =
    noHistory ??
    series(backlinks.trend.map((point) => ({ date: point.date, value: point.backlinks })));
  metrics.new_links = scalar(backlinks.summary.newLinks);
  metrics.lost_links = scalar(backlinks.summary.lostLinks);
  metrics.avg_domain_authority = scalar(backlinks.summary.averageDomainAuthority);
  metrics.authority_mix = {
    state: 'ok',
    slices: backlinks.authorityBuckets.map((bucket) => ({
      label: bucket.bucket,
      value: bucket.count,
    })),
    value: backlinks.summary.referringDomains,
  };
  metrics.top_anchors = {
    state: 'ok',
    columns: [
      { key: 'anchor', label: 'Anchor' },
      { key: 'count', label: 'Links', format: 'number' },
      { key: 'share', label: 'Share', format: 'percent' },
    ],
    rows: backlinks.topAnchors.map((anchor) => ({
      anchor: anchor.anchor,
      count: anchor.count,
      share: anchor.share,
    })),
  };

  /* ── Google Ads ──────────────────────────────────────────────────── */
  /*
   * When no account is configured the report comes back zeroed rather than
   * seeded, and a widget showing a flat zero line reads as "no spend" when the
   * truth is "no account". Leave these unmapped so the catalog fallback reports
   * the reason instead.
   */
  if (ads.available) {
  metrics.ads_cost = series(ads.daily.map((day) => ({ date: day.date, value: day.spend })));
  metrics.ads_clicks = series(ads.daily.map((day) => ({ date: day.date, value: day.clicks })));
  metrics.ads_conversions = scalar(ads.summary.conversions);
  metrics.ads_impressions = scalar(ads.summary.impressions);
  metrics.ads_ctr = scalar(ads.summary.ctr);
  metrics.ads_cpc = scalar(ads.summary.cpc);
  metrics.ads_cpa = scalar(ads.summary.cpa);
  metrics.ads_roas = scalar(ads.summary.roas);
  metrics.ads_campaigns = {
    state: 'ok',
    columns: [
      { key: 'name', label: 'Campaign' },
      { key: 'spend', label: 'Cost', format: 'currency' },
      { key: 'clicks', label: 'Clicks', format: 'number' },
      { key: 'conversions', label: 'Conv.', format: 'number' },
    ],
    rows: ads.campaigns.map((campaign) => ({
      name: campaign.name,
      spend: campaign.spend,
      clicks: campaign.clicks,
      conversions: campaign.conversions,
    })),
  };
  }

  /* ── Traffic (GA4) ───────────────────────────────────────────────── */
  if (ga4Report) {
    metrics.sessions = series(
      ga4Report.daily.map((day) => ({ date: day.date, value: day.sessions })),
    );
    metrics.pageviews = series(
      ga4Report.daily.map((day) => ({ date: day.date, value: day.pageviews })),
    );
    metrics.bounce_rate = series(
      ga4Report.daily.map((day) => ({ date: day.date, value: day.bounceRate })),
    );
    // Two distinct GA4 metrics, previously both wired to totalUsers — which
    // rendered the identical number under two different labels.
    metrics.visitors = scalar(ga4Report.totals.activeUsers);
    metrics.ga4_total_users = scalar(ga4Report.totals.users);
    // `format: 'duration'` renders milliseconds; GA4 reports seconds.
    metrics.avg_session = scalar(ga4Report.totals.avgSessionSeconds * 1000);
    metrics.channel_mix = {
      state: 'ok',
      slices: ga4Report.channels.map((channel) => ({
        label: channel.channel,
        value: channel.sessions,
      })),
      value: ga4Report.totals.sessions,
    };
    metrics.top_pages = {
      state: 'ok',
      columns: [
        { key: 'path', label: 'Landing page' },
        { key: 'sessions', label: 'Sessions', format: 'number' },
        { key: 'bounce', label: 'Bounce', format: 'percent' },
      ],
      rows: ga4Report.pages.map((page) => ({
        path: page.path,
        sessions: page.sessions,
        bounce: page.bounceRate,
      })),
    };
  }

  /* ── Google Search Console ───────────────────────────────────────── */
  if (gsc) {
    metrics.gsc_clicks = series(
      gsc.daily.map((day) => ({ date: day.date, value: day.clicks })),
    );
    metrics.gsc_impressions = series(
      gsc.daily.map((day) => ({ date: day.date, value: day.impressions })),
    );
    metrics.gsc_position = series(
      gsc.daily.map((day) => ({ date: day.date, value: day.position })),
    );
    metrics.gsc_ctr = scalar(gsc.totals.ctr);
    metrics.gsc_queries = {
      state: 'ok',
      columns: [
        { key: 'query', label: 'Query' },
        { key: 'clicks', label: 'Clicks', format: 'number' },
        { key: 'impressions', label: 'Impr.', format: 'compact' },
        { key: 'ctr', label: 'CTR', format: 'percent' },
      ],
      rows: gsc.queries.map((row) => ({
        query: row.query,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
      })),
    };
  }

  // Anything in the catalog we did not fill above has no live adapter. The reason
  // is phrased for the widget body, not the library: it has to say why this card
  // is blank and what to do about it.
  /*
   * Why a metric is blank matters more than the fact that it is. The old
   * message said "not connected" for everything, which was wrong for Search
   * Console — the account IS connected, the property just may not resolve, or
   * the widget may want a shape no adapter produces. Each reason below names
   * the actual fix.
   */
  function unavailableReason(integration: (typeof METRICS)[number]['integration']) {
    if (integration === 'gsc') {
      if (!google?.connected) {
        return 'Google account is not connected. Connect it in Settings to pull Search Console data.';
      }
      return `No Search Console property matches ${domain}. Add and verify the property, then reload.`;
    }
    if (integration === 'traffic') {
      return ga4Reason ?? 'GA4 returned no value for this metric.';
    }
    if (integration === 'ads' && !ads.available) {
      return ads.provider.note || `No Google Ads account is configured for ${domain}.`;
    }
    return `${integrationMeta(integration).label} returned no value for this metric. Switch to Sample Data to preview this.`;
  }

  for (const metric of METRICS) {
    if (metrics[metric.id]) continue;
    metrics[metric.id] = { state: 'unavailable', reason: unavailableReason(metric.integration) };
  }

  return NextResponse.json({
    domain,
    range,
    generatedAt: new Date().toISOString(),
    providers: {
      rankings: keywords.provider,
      backlinks: backlinks.provider,
      ads: ads.provider,
      traffic: ga4Report
        ? {
            mode: 'live' as const,
            provider: `GA4 · ${ga4Report.propertyName}`,
            note: '',
          }
        : { mode: 'seed' as const, provider: 'GA4', note: ga4Reason ?? '' },
      gsc: gsc
        ? { mode: 'live' as const, provider: 'Search Console', note: '' }
        : {
            mode: 'seed' as const,
            provider: 'Search Console',
            note: google?.connected
              ? `No verified property matches ${domain}.`
              : 'Google account is not connected.',
          },
    },
    metrics,
  });
}
