import type { IconName } from '@/components/ui/Icon';
import type { MetricFormat, Widget, WidgetKind } from './types';

/**
 * The metric catalog: everything the right-hand library can drop onto a report.
 *
 * `liveSource` records which of the app's existing provider adapters can answer
 * this metric for real. Metrics whose source is `null` render a "connect this
 * integration" state in Live mode instead of silently showing invented numbers —
 * the sample/live split has to stay visible, never blurred.
 */

export type IntegrationKey = 'rankings' | 'traffic' | 'ads' | 'backlinks' | 'gsc';

export type Integration = {
  key: IntegrationKey;
  label: string;
  icon: IconName;
  tone: 'blue' | 'violet' | 'aqua' | 'orange' | 'yellow' | 'rose';
  /** Shown in the library when the integration has no live adapter yet. */
  connectHint?: string;
};

export const INTEGRATIONS: Integration[] = [
  { key: 'rankings', label: 'Rankings', icon: 'search', tone: 'aqua' },
  {
    key: 'traffic',
    label: 'Traffic',
    icon: 'bars',
    tone: 'blue',
    connectHint: 'Needs the Analytics scope and a GA4 property. Reconnect Google in Settings if traffic is blank.',
  },
  { key: 'ads', label: 'Google Ads', icon: 'target', tone: 'yellow' },
  { key: 'backlinks', label: 'Backlinks', icon: 'link', tone: 'violet' },
  {
    key: 'gsc',
    label: 'Google Search Console',
    icon: 'gauge',
    tone: 'orange',
    connectHint: 'Needs a verified Search Console property for the active domain.',
  },
];

export function integrationMeta(key: IntegrationKey) {
  return INTEGRATIONS.find((integration) => integration.key === key) ?? INTEGRATIONS[0];
}

export type MetricShape = 'scalar' | 'series' | 'breakdown' | 'table';

export type TableColumn = { key: string; label: string; format?: MetricFormat };

export type MetricDef = {
  id: string;
  label: string;
  integration: IntegrationKey;
  shape: MetricShape;
  format: MetricFormat;
  defaultKind: WidgetKind;
  kinds: WidgetKind[];
  /** Which way is an improvement — position metrics get better as they fall. */
  goodDirection: 'up' | 'down';
  /**
   * The value *is* a change (it can be negative and is meaningless as a
   * percentage), so widgets show a signed arrow instead of a period comparison.
   */
  signed?: boolean;
  /** Magnitude anchor for the deterministic sample generator. */
  base: number;
  /** Relative day-to-day movement, 0–1. */
  spread?: number;
  /** Fixed buckets for breakdown metrics. */
  buckets?: string[];
  columns?: TableColumn[];
  /**
   * Which provider answers this in Live mode, or null when the integration is
   * not wired up in this app yet.
   */
  liveSource: 'keywords' | 'backlinks' | 'ads' | 'traffic' | 'gsc' | null;
};

const SCALAR_KINDS: WidgetKind[] = ['stat', 'delta', 'sparkStat', 'gauge'];
const SERIES_KINDS: WidgetKind[] = ['line', 'area', 'bar', 'stat', 'delta', 'sparkStat'];
const BREAKDOWN_KINDS: WidgetKind[] = ['donut', 'bar', 'table'];

export const METRICS: MetricDef[] = [
  /* ── Rankings ──────────────────────────────────────────────────── */
  {
    id: 'google_rankings',
    label: 'Google Rankings',
    integration: 'rankings',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 10,
    spread: 0.3,
    liveSource: 'keywords',
  },
  {
    id: 'google_change',
    label: 'Google Change',
    integration: 'rankings',
    shape: 'series',
    format: 'number',
    defaultKind: 'delta',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    signed: true,
    base: 9,
    spread: 1.6,
    liveSource: 'keywords',
  },
  {
    id: 'keywords_tracked',
    label: 'Keywords Tracked',
    integration: 'rankings',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 68,
    spread: 0.1,
    liveSource: 'keywords',
  },
  {
    id: 'avg_position',
    label: 'Average Position',
    integration: 'rankings',
    shape: 'series',
    format: 'position',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'down',
    base: 18.4,
    spread: 0.14,
    liveSource: 'keywords',
  },
  {
    id: 'visibility',
    label: 'Search Visibility',
    integration: 'rankings',
    shape: 'series',
    format: 'percent',
    defaultKind: 'area',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 34.2,
    spread: 0.12,
    liveSource: 'keywords',
  },
  {
    id: 'top10_keywords',
    label: 'Keywords in Top 10',
    integration: 'rankings',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 21,
    spread: 0.2,
    liveSource: 'keywords',
  },
  {
    id: 'rank_distribution',
    label: 'Position Distribution',
    integration: 'rankings',
    shape: 'breakdown',
    format: 'number',
    defaultKind: 'donut',
    kinds: BREAKDOWN_KINDS,
    goodDirection: 'up',
    base: 68,
    buckets: ['1–3', '4–10', '11–20', '21–50', '51–100', 'Not ranking'],
    liveSource: 'keywords',
  },
  {
    id: 'keyword_movers',
    label: 'Biggest Movers',
    integration: 'rankings',
    shape: 'table',
    format: 'number',
    defaultKind: 'table',
    kinds: ['table'],
    goodDirection: 'up',
    base: 10,
    columns: [
      { key: 'keyword', label: 'Keyword' },
      { key: 'position', label: 'Position', format: 'number' },
      { key: 'change', label: 'Change', format: 'number' },
    ],
    liveSource: 'keywords',
  },

  /* ── Traffic ───────────────────────────────────────────────────── */
  {
    id: 'sessions',
    label: 'Sessions',
    integration: 'traffic',
    shape: 'series',
    format: 'number',
    defaultKind: 'area',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 196,
    spread: 0.22,
    liveSource: 'traffic',
  },
  {
    id: 'visitors',
    label: 'Visitors',
    integration: 'traffic',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 572,
    spread: 0.18,
    liveSource: 'traffic',
  },
  {
    id: 'ga4_total_users',
    label: 'GA4 Total Users',
    integration: 'traffic',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 780,
    spread: 0.18,
    liveSource: 'traffic',
  },
  {
    id: 'pageviews',
    label: 'Pageviews',
    integration: 'traffic',
    shape: 'series',
    format: 'compact',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 2140,
    spread: 0.24,
    liveSource: 'traffic',
  },
  {
    id: 'bounce_rate',
    label: 'Bounce Rate',
    integration: 'traffic',
    shape: 'series',
    format: 'percent',
    defaultKind: 'stat',
    kinds: SERIES_KINDS,
    goodDirection: 'down',
    base: 46.8,
    spread: 0.08,
    liveSource: 'traffic',
  },
  {
    id: 'avg_session',
    label: 'Avg. Session Duration',
    integration: 'traffic',
    shape: 'scalar',
    format: 'duration',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 132_000,
    spread: 0.15,
    liveSource: 'traffic',
  },
  {
    id: 'channel_mix',
    label: 'Visitors by Channel',
    integration: 'traffic',
    shape: 'breakdown',
    format: 'number',
    defaultKind: 'donut',
    kinds: BREAKDOWN_KINDS,
    goodDirection: 'up',
    base: 196,
    buckets: [
      'Referral',
      'Display',
      'Email',
      'Social',
      '(Other)',
      'Organic Search',
      'Paid Search',
      'Direct',
    ],
    liveSource: 'traffic',
  },
  {
    id: 'top_pages',
    label: 'Top Landing Pages',
    integration: 'traffic',
    shape: 'table',
    format: 'number',
    defaultKind: 'table',
    kinds: ['table'],
    goodDirection: 'up',
    base: 200,
    columns: [
      { key: 'path', label: 'Page' },
      { key: 'sessions', label: 'Sessions', format: 'number' },
      { key: 'bounce', label: 'Bounce', format: 'percent' },
    ],
    liveSource: 'traffic',
  },

  /* ── Google Ads ────────────────────────────────────────────────── */
  {
    id: 'ads_cost',
    label: 'Google Ads Cost',
    integration: 'ads',
    shape: 'series',
    format: 'currency2',
    defaultKind: 'stat',
    kinds: SERIES_KINDS,
    goodDirection: 'down',
    base: 5714,
    spread: 0.2,
    liveSource: 'ads',
  },
  {
    id: 'ads_clicks',
    label: 'Google Ads Clicks',
    integration: 'ads',
    shape: 'series',
    format: 'number',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 1938,
    spread: 0.16,
    liveSource: 'ads',
  },
  {
    id: 'ads_conversions',
    label: 'Google Ads Conversions',
    integration: 'ads',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 651,
    spread: 0.2,
    liveSource: 'ads',
  },
  {
    id: 'ads_impressions',
    label: 'Google Ads Impressions',
    integration: 'ads',
    shape: 'series',
    format: 'compact',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 84_600,
    spread: 0.18,
    liveSource: 'ads',
  },
  {
    id: 'ads_ctr',
    label: 'Google Ads CTR',
    integration: 'ads',
    shape: 'scalar',
    format: 'percent',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 2.29,
    spread: 0.12,
    liveSource: 'ads',
  },
  {
    id: 'ads_cpc',
    label: 'Average CPC',
    integration: 'ads',
    shape: 'scalar',
    format: 'currency2',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'down',
    base: 2.95,
    spread: 0.12,
    liveSource: 'ads',
  },
  {
    id: 'ads_cpa',
    label: 'Cost per Conversion',
    integration: 'ads',
    shape: 'scalar',
    format: 'currency2',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'down',
    base: 8.78,
    spread: 0.14,
    liveSource: 'ads',
  },
  {
    id: 'ads_roas',
    label: 'ROAS',
    integration: 'ads',
    shape: 'scalar',
    format: 'decimal1',
    defaultKind: 'gauge',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 4.2,
    spread: 0.16,
    liveSource: 'ads',
  },
  {
    id: 'ads_campaigns',
    label: 'Campaign Performance',
    integration: 'ads',
    shape: 'table',
    format: 'number',
    defaultKind: 'table',
    kinds: ['table'],
    goodDirection: 'up',
    base: 6,
    columns: [
      { key: 'name', label: 'Campaign' },
      { key: 'spend', label: 'Cost', format: 'currency' },
      { key: 'clicks', label: 'Clicks', format: 'number' },
      { key: 'conversions', label: 'Conv.', format: 'number' },
    ],
    liveSource: 'ads',
  },

  /* ── Backlinks ─────────────────────────────────────────────────── */
  {
    id: 'referring_domains',
    label: 'Referring Domains',
    integration: 'backlinks',
    shape: 'series',
    format: 'number',
    defaultKind: 'stat',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 412,
    spread: 0.06,
    liveSource: 'backlinks',
  },
  {
    id: 'total_backlinks',
    label: 'Total Backlinks',
    integration: 'backlinks',
    shape: 'series',
    format: 'compact',
    defaultKind: 'area',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 3860,
    spread: 0.08,
    liveSource: 'backlinks',
  },
  {
    id: 'new_links',
    label: 'New Links',
    integration: 'backlinks',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 34,
    spread: 0.3,
    liveSource: 'backlinks',
  },
  {
    id: 'lost_links',
    label: 'Lost Links',
    integration: 'backlinks',
    shape: 'scalar',
    format: 'number',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'down',
    base: 12,
    spread: 0.35,
    liveSource: 'backlinks',
  },
  {
    id: 'avg_domain_authority',
    label: 'Avg. Domain Authority',
    integration: 'backlinks',
    shape: 'scalar',
    format: 'decimal1',
    defaultKind: 'gauge',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 38.5,
    spread: 0.05,
    liveSource: 'backlinks',
  },
  {
    id: 'authority_mix',
    label: 'Authority Distribution',
    integration: 'backlinks',
    shape: 'breakdown',
    format: 'number',
    defaultKind: 'bar',
    kinds: BREAKDOWN_KINDS,
    goodDirection: 'up',
    base: 412,
    buckets: ['DA 0–19', 'DA 20–39', 'DA 40–59', 'DA 60–79', 'DA 80+'],
    liveSource: 'backlinks',
  },
  {
    id: 'top_anchors',
    label: 'Top Anchor Text',
    integration: 'backlinks',
    shape: 'table',
    format: 'number',
    defaultKind: 'table',
    kinds: ['table'],
    goodDirection: 'up',
    base: 8,
    columns: [
      { key: 'anchor', label: 'Anchor' },
      { key: 'count', label: 'Links', format: 'number' },
      { key: 'share', label: 'Share', format: 'percent' },
    ],
    liveSource: 'backlinks',
  },

  /* ── Google Search Console ─────────────────────────────────────── */
  {
    id: 'gsc_clicks',
    label: 'GSC Clicks',
    integration: 'gsc',
    shape: 'series',
    format: 'number',
    defaultKind: 'area',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 1420,
    spread: 0.2,
    liveSource: 'gsc',
  },
  {
    id: 'gsc_impressions',
    label: 'GSC Impressions',
    integration: 'gsc',
    shape: 'series',
    format: 'compact',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'up',
    base: 48_200,
    spread: 0.18,
    liveSource: 'gsc',
  },
  {
    id: 'gsc_ctr',
    label: 'GSC CTR',
    integration: 'gsc',
    shape: 'scalar',
    format: 'percent',
    defaultKind: 'stat',
    kinds: SCALAR_KINDS,
    goodDirection: 'up',
    base: 2.95,
    spread: 0.1,
    liveSource: 'gsc',
  },
  {
    id: 'gsc_position',
    label: 'GSC Avg. Position',
    integration: 'gsc',
    shape: 'series',
    format: 'position',
    defaultKind: 'line',
    kinds: SERIES_KINDS,
    goodDirection: 'down',
    base: 14.6,
    spread: 0.1,
    liveSource: 'gsc',
  },
  {
    id: 'gsc_queries',
    label: 'Top Queries',
    integration: 'gsc',
    shape: 'table',
    format: 'number',
    defaultKind: 'table',
    kinds: ['table'],
    goodDirection: 'up',
    base: 10,
    columns: [
      { key: 'query', label: 'Query' },
      { key: 'clicks', label: 'Clicks', format: 'number' },
      { key: 'impressions', label: 'Impr.', format: 'compact' },
      { key: 'ctr', label: 'CTR', format: 'percent' },
    ],
    liveSource: 'gsc',
  },
];

const METRIC_INDEX = new Map(METRICS.map((metric) => [metric.id, metric]));

export function metricById(id: string | undefined): MetricDef | undefined {
  return id ? METRIC_INDEX.get(id) : undefined;
}

export function metricsFor(integration: IntegrationKey) {
  return METRICS.filter((metric) => metric.integration === integration);
}

/* ── Widget kind metadata ──────────────────────────────────────────── */

export type KindMeta = {
  kind: WidgetKind;
  label: string;
  icon: IconName;
  span: number;
  rows: number;
};

export const KIND_META: Record<WidgetKind, KindMeta> = {
  stat: { kind: 'stat', label: 'Big number', icon: 'target', span: 3, rows: 3 },
  delta: { kind: 'delta', label: 'Number + change', icon: 'arrowUp', span: 3, rows: 3 },
  sparkStat: { kind: 'sparkStat', label: 'Number + sparkline', icon: 'bars', span: 4, rows: 3 },
  line: { kind: 'line', label: 'Line chart', icon: 'chartLine', span: 6, rows: 5 },
  area: { kind: 'area', label: 'Area chart', icon: 'chartArea', span: 6, rows: 5 },
  bar: { kind: 'bar', label: 'Bar chart', icon: 'bars', span: 6, rows: 5 },
  donut: { kind: 'donut', label: 'Donut chart', icon: 'donut', span: 6, rows: 6 },
  gauge: { kind: 'gauge', label: 'Ring gauge', icon: 'gauge', span: 3, rows: 5 },
  table: { kind: 'table', label: 'Table', icon: 'grid', span: 12, rows: 6 },
  heading: { kind: 'heading', label: 'Heading', icon: 'heading', span: 12, rows: 1 },
  text: { kind: 'text', label: 'Text block', icon: 'text', span: 6, rows: 3 },
  divider: { kind: 'divider', label: 'Divider', icon: 'minus', span: 12, rows: 1 },
  spacer: { kind: 'spacer', label: 'Spacer', icon: 'expand', span: 12, rows: 1 },
  image: { kind: 'image', label: 'Image', icon: 'image', span: 6, rows: 5 },
};

/** Build a widget for a metric, sized by the kind's defaults. */
export function widgetForMetric(
  metric: MetricDef,
  kind: WidgetKind = metric.defaultKind,
  overrides: Partial<Widget> = {},
): Omit<Widget, 'id'> {
  const meta = KIND_META[kind];
  return {
    kind,
    metricId: metric.id,
    span: meta.span,
    rows: meta.rows,
    compare: kind === 'delta' || kind === 'stat',
    colorSlot: 'accent',
    filled: kind === 'stat' || kind === 'delta',
    ...overrides,
  };
}

export const CONTENT_BLOCKS: { kind: WidgetKind; label: string; blurb: string; icon: IconName }[] = [
  { kind: 'heading', label: 'Heading', blurb: 'Section or page title.', icon: 'heading' },
  { kind: 'text', label: 'Text', blurb: 'Commentary, insights, next steps.', icon: 'text' },
  { kind: 'divider', label: 'Divider', blurb: 'A hairline rule between blocks.', icon: 'minus' },
  { kind: 'spacer', label: 'Spacer', blurb: 'Vertical breathing room.', icon: 'expand' },
];
