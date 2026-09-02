import { metricById, widgetForMetric, type IntegrationKey } from './catalog';
import {
  newId,
  type ReportDoc,
  type ReportPage,
  type Section,
  type SectionTone,
  type Widget,
  type WidgetKind,
} from './types';

/**
 * Starter documents and section presets.
 *
 * Presets are the fastest path from an empty canvas to something a client would
 * actually receive, and they double as the vocabulary the prompt composer builds
 * from — so there is exactly one definition of "what a Paid Media block is".
 */

type WidgetSpec = [metricId: string, kind: WidgetKind, span: number, rows?: number, filled?: boolean];

function buildWidgets(specs: WidgetSpec[]): Widget[] {
  return specs.flatMap(([metricId, kind, span, rows, filled]) => {
    const metric = metricById(metricId);
    if (!metric) return [];
    const base = widgetForMetric(metric, kind);
    return [
      {
        ...base,
        id: newId('w'),
        span,
        rows: rows ?? base.rows,
        filled: filled ?? base.filled,
      },
    ];
  });
}

function section(
  title: string,
  span: number,
  specs: WidgetSpec[],
  options: { tone?: SectionTone; banner?: boolean } = {},
): Section {
  return {
    id: newId('s'),
    title,
    span,
    banner: options.banner ?? true,
    tone: options.tone ?? 'ink',
    widgets: buildWidgets(specs),
  };
}

/* ── Section presets ───────────────────────────────────────────────── */

export type SectionPreset = {
  key: string;
  label: string;
  blurb: string;
  integration: IntegrationKey | 'mixed';
  build: () => Section;
};

export const SECTION_PRESETS: SectionPreset[] = [
  {
    key: 'rankings',
    label: 'Rankings',
    blurb: 'Top-10 count, net movement and the movement trend.',
    integration: 'rankings',
    build: () =>
      section('Rankings', 4, [
        ['google_rankings', 'stat', 6, 3, true],
        ['google_change', 'delta', 6, 3, true],
        ['google_change', 'line', 12, 5, false],
      ]),
  },
  {
    key: 'traffic',
    label: 'Traffic',
    blurb: 'Channel mix donut plus visitors and users.',
    integration: 'traffic',
    build: () =>
      section('Traffic', 4, [
        ['channel_mix', 'donut', 12, 6, false],
        ['visitors', 'stat', 6, 3, true],
        ['ga4_total_users', 'stat', 6, 3, true],
      ]),
  },
  {
    key: 'ads',
    label: 'Google Ads',
    blurb: 'Conversions, cost and the click trend.',
    integration: 'ads',
    build: () =>
      section('Google Ads', 4, [
        ['ads_conversions', 'stat', 6, 3, true],
        ['ads_cost', 'stat', 6, 3, true],
        ['ads_clicks', 'line', 12, 5, false],
      ]),
  },
  {
    key: 'backlinks',
    label: 'Backlinks',
    blurb: 'Referring domains, gains and losses, growth trend.',
    integration: 'backlinks',
    build: () =>
      section('Backlinks', 8, [
        ['referring_domains', 'stat', 4, 3, true],
        ['new_links', 'stat', 4, 3, true],
        ['lost_links', 'stat', 4, 3, true],
        ['total_backlinks', 'area', 12, 5, false],
      ]),
  },
  {
    key: 'gsc',
    label: 'Google Search Console',
    blurb: 'Clicks, impressions and CTR from Search.',
    integration: 'gsc',
    build: () =>
      section('Google Search Console', 4, [
        ['gsc_clicks', 'stat', 6, 3, true],
        ['gsc_impressions', 'stat', 6, 3, true],
        ['gsc_ctr', 'sparkStat', 12, 3, false],
      ]),
  },
  {
    key: 'paid-detail',
    label: 'Paid media detail',
    blurb: 'Cost KPIs plus the full campaign table.',
    integration: 'ads',
    build: () =>
      section('Paid Media Performance', 12, [
        ['ads_cost', 'stat', 3, 3, true],
        ['ads_clicks', 'stat', 3, 3, true],
        ['ads_cpa', 'stat', 3, 3, true],
        ['ads_roas', 'gauge', 3, 5, false],
        ['ads_campaigns', 'table', 12, 6, false],
      ]),
  },
  {
    key: 'link-building',
    label: 'Link building detail',
    blurb: 'Authority spread, anchors and domain growth.',
    integration: 'backlinks',
    build: () =>
      section('Link Building', 12, [
        ['referring_domains', 'area', 6, 5, false],
        ['authority_mix', 'bar', 6, 5, false],
        ['top_anchors', 'table', 12, 6, false],
      ]),
  },
  {
    key: 'organic-detail',
    label: 'Organic detail',
    blurb: 'Visibility, position distribution and movers.',
    integration: 'rankings',
    build: () =>
      section('Organic Search', 12, [
        ['visibility', 'area', 6, 5, false],
        ['rank_distribution', 'donut', 6, 6, false],
        ['keyword_movers', 'table', 12, 6, false],
      ]),
  },
  {
    key: 'search-console-detail',
    label: 'Search Console detail',
    blurb: 'Clicks and impressions over time, top queries.',
    integration: 'gsc',
    build: () =>
      section('Search Performance', 12, [
        ['gsc_clicks', 'area', 6, 5, false],
        ['gsc_position', 'line', 6, 5, false],
        ['gsc_queries', 'table', 12, 6, false],
      ]),
  },
  {
    key: 'executive',
    label: 'Executive summary',
    blurb: 'Narrative block plus the four headline KPIs.',
    integration: 'mixed',
    build: () => {
      const built = section('Executive Summary', 12, [
        ['visibility', 'stat', 3, 3, true],
        ['sessions', 'stat', 3, 3, true],
        ['ads_conversions', 'stat', 3, 3, true],
        ['referring_domains', 'stat', 3, 3, true],
      ]);
      built.widgets.unshift({
        id: newId('w'),
        kind: 'text',
        span: 12,
        rows: 3,
        text:
          'Organic visibility continued to climb this period while paid cost per conversion held flat. ' +
          'Next period we focus on the pages ranking 11–20, where small gains convert into first-page traffic.',
      });
      return built;
    },
  },
];

export function presetByKey(key: string) {
  return SECTION_PRESETS.find((preset) => preset.key === key);
}

/* ── Prompt composer ───────────────────────────────────────────────── */

const PROMPT_RULES: { test: RegExp; presets: string[] }[] = [
  { test: /\b(rank|ranking|serp|position|keyword)\b/i, presets: ['rankings', 'organic-detail'] },
  { test: /\b(traffic|ga4|analytics|visitor|session|audience)\b/i, presets: ['traffic'] },
  { test: /\b(ad|ads|ppc|paid|spend|budget|cpc|roas|campaign)\b/i, presets: ['ads', 'paid-detail'] },
  { test: /\b(backlink|link|authority|anchor|referring)\b/i, presets: ['backlinks', 'link-building'] },
  { test: /\b(console|gsc|impression|click|query|queries)\b/i, presets: ['gsc', 'search-console-detail'] },
  { test: /\b(summary|executive|overview|monthly|client)\b/i, presets: ['executive'] },
];

/**
 * Turns a short brief into sections by matching it against the preset
 * vocabulary. This runs entirely locally — it is a template composer, not a
 * model — so it is honest about being deterministic and never invents a metric
 * the catalog does not have.
 */
export function composeFromPrompt(prompt: string): { sections: Section[]; matched: string[] } {
  const keys: string[] = [];
  for (const rule of PROMPT_RULES) {
    if (!rule.test.test(prompt)) continue;
    for (const key of rule.presets) if (!keys.includes(key)) keys.push(key);
  }

  // Nothing recognised → the standard three-block monthly report.
  const resolved = keys.length ? keys : ['executive', 'rankings', 'traffic', 'ads'];
  const wantsDetail = /\b(detailed|deep|full|complete|thorough)\b/i.test(prompt);
  const trimmed = wantsDetail ? resolved : resolved.slice(0, 4);

  return {
    sections: trimmed.map((key) => presetByKey(key)!.build()).filter(Boolean),
    matched: trimmed,
  };
}

export const PROMPT_SUGGESTIONS = [
  'Monthly SEO report for a home care client',
  'Detailed paid media performance review',
  'Link building progress and anchor spread',
  'Executive summary with rankings and traffic',
];

/* ── Documents ─────────────────────────────────────────────────────── */

export function emptyPage(title = 'Untitled Dashboard'): ReportPage {
  return {
    id: newId('p'),
    title,
    sections: [
      {
        id: newId('s'),
        title: 'Untitled Section',
        span: 12,
        banner: true,
        tone: 'ink',
        widgets: [],
      },
    ],
  };
}

/**
 * The name a document carries before the client roster has been consulted.
 * The store treats this exact string as "not yet claimed" and replaces it with
 * the active client, so it must stay a single shared constant.
 */
export const PLACEHOLDER_CLIENT = 'Demo client';

/** The document a first-time user lands on — the reference layout, populated. */
export function starterDoc(client = PLACEHOLDER_CLIENT, clientDomain?: string): ReportDoc {
  return {
    version: 1,
    id: newId('r'),
    name: 'Dashboard',
    client,
    clientDomain,
    range: 'lastMonth',
    dataMode: 'sample',
    accent: 'clay',
    density: 'comfortable',
    pageSetup: {
      size: 'letter',
      orientation: 'portrait',
      showHeader: true,
      showFooter: true,
      footerText: 'Prepared by your SitePilot dashboard',
    },
    customMetrics: [
      {
        id: 'cm_cost_per_lead',
        label: 'Cost per Lead',
        expression: 'ads_cost / ads_conversions',
        format: 'currency2',
      },
    ],
    benchmarks: [{ metricId: 'ads_roas', target: 4, direction: 'atLeast' }],
    pages: [
      {
        id: newId('p'),
        title: 'Overview',
        sections: [
          presetByKey('rankings')!.build(),
          presetByKey('traffic')!.build(),
          presetByKey('ads')!.build(),
          presetByKey('backlinks')!.build(),
          presetByKey('gsc')!.build(),
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** A blank document, for "start from scratch". */
export function blankDoc(client = PLACEHOLDER_CLIENT, clientDomain?: string): ReportDoc {
  const doc = starterDoc(client, clientDomain);
  return {
    ...doc,
    id: newId('r'),
    name: 'Untitled Report',
    customMetrics: [],
    benchmarks: [],
    pages: [emptyPage('Overview')],
  };
}
