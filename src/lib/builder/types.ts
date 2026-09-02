/**
 * Report-builder document model.
 *
 * The document is the single source of truth for the editor: every panel reads
 * it, every action produces a new one, and the whole thing is JSON-serialisable
 * so autosave, revision history, export and import are all the same operation.
 *
 * Layout is a *flow* grid, not free positioning: widgets are an ordered list and
 * each one carries a column span (1–12) and a row height. Reordering is an array
 * move and resizing is two integers, which keeps drag-and-drop collision-free
 * and makes the mobile viewport a pure span clamp.
 */

/** Columns in the canvas grid. Spans are always expressed against this. */
export const GRID_COLS = 12;

/** One row unit in CSS pixels — widget height is `rows × ROW_PX` plus gaps. */
export const ROW_PX = 52;

export const GRID_GAP = 12;

export type MetricFormat =
  | 'number'
  | 'compact'
  | 'currency'
  | 'currency2'
  | 'percent'
  | 'decimal1'
  | 'position'
  | 'duration';

export type WidgetKind =
  | 'stat'
  | 'delta'
  | 'sparkStat'
  | 'line'
  | 'area'
  | 'bar'
  | 'donut'
  | 'gauge'
  | 'table'
  | 'heading'
  | 'text'
  | 'divider'
  | 'spacer'
  | 'image';

/** Kinds that bind to a metric; the rest are static content blocks. */
export const DATA_KINDS: WidgetKind[] = [
  'stat',
  'delta',
  'sparkStat',
  'line',
  'area',
  'bar',
  'donut',
  'gauge',
  'table',
];

export function isDataKind(kind: WidgetKind) {
  return DATA_KINDS.includes(kind);
}

export type Widget = {
  id: string;
  kind: WidgetKind;
  /** Overrides the metric's own label. Empty means "use the metric label". */
  title?: string;
  metricId?: string;
  span: number;
  rows: number;
  /** Show period-over-period change next to the value. */
  compare?: boolean;
  /** Categorical colour slot 0–2, or 'accent' to follow the report theme. */
  colorSlot?: 0 | 1 | 2 | 'accent';
  /** Filled tiles carry the theme accent as a background, like the reference. */
  filled?: boolean;
  /** Content-block payloads. */
  text?: string;
  level?: 1 | 2 | 3;
  align?: 'left' | 'center';
  src?: string;
  alt?: string;
  /** Rows shown by table widgets. */
  limit?: number;
};

export type SectionTone = 'ink' | 'accent' | 'blue' | 'aqua' | 'orange' | 'rose' | 'plain';

/**
 * Sections nest one grid inside another: the section itself takes a span in the
 * page's 12-column grid, and its widgets take spans in the section's own
 * 12-column grid. That is what lets three narrow metric groups sit side by side
 * the way a report page actually reads, instead of one flat column of cards.
 */
export type Section = {
  id: string;
  title: string;
  /** Columns the section occupies in the page grid, 1–12. */
  span: number;
  /** Draw the titled band above the widgets (the dark strip in the reference). */
  banner: boolean;
  tone: SectionTone;
  collapsed?: boolean;
  widgets: Widget[];
};

export type ReportPage = {
  id: string;
  title: string;
  sections: Section[];
};

export type RangeKey =
  | 'last7'
  | 'last30'
  | 'lastMonth'
  | 'last90'
  | 'monthToDate'
  | 'yearToDate'
  | 'last12Months';

export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: 'last7', label: 'Last 7 days', days: 7 },
  { key: 'last30', label: 'Last 30 days', days: 30 },
  { key: 'lastMonth', label: 'Last Month', days: 30 },
  { key: 'monthToDate', label: 'Month to date', days: 18 },
  { key: 'last90', label: 'Last 90 days', days: 90 },
  { key: 'yearToDate', label: 'Year to date', days: 220 },
  { key: 'last12Months', label: 'Last 12 months', days: 365 },
];

export function rangeMeta(key: RangeKey) {
  return RANGES.find((range) => range.key === key) ?? RANGES[1];
}

/**
 * Theme accents are report-level chrome, deliberately separate from the chart
 * series slots — a report can be clay-brown without ever recolouring a line.
 */
export type AccentKey = 'violet' | 'clay' | 'blue' | 'emerald' | 'slate' | 'rose';

export const ACCENTS: { key: AccentKey; label: string; base: string; ink: string }[] = [
  { key: 'violet', label: 'Violet', base: '#6d5ce0', ink: '#ffffff' },
  { key: 'clay', label: 'Clay', base: '#9a5233', ink: '#ffffff' },
  { key: 'blue', label: 'Blue', base: '#2a6fd6', ink: '#ffffff' },
  { key: 'emerald', label: 'Emerald', base: '#15805c', ink: '#ffffff' },
  { key: 'slate', label: 'Slate', base: '#3f4a63', ink: '#ffffff' },
  { key: 'rose', label: 'Rose', base: '#b03b5a', ink: '#ffffff' },
];

export function accentMeta(key: AccentKey) {
  return ACCENTS.find((accent) => accent.key === key) ?? ACCENTS[0];
}

export type CustomMetric = {
  id: string;
  label: string;
  /** Infix expression over metric ids and numbers, e.g. `ads_cost / ads_conversions`. */
  expression: string;
  format: MetricFormat;
};

export type Benchmark = {
  metricId: string;
  target: number;
  /** Which direction counts as hitting the target. */
  direction: 'atLeast' | 'atMost';
};

export type PageSetup = {
  size: 'letter' | 'a4';
  orientation: 'portrait' | 'landscape';
  showHeader: boolean;
  showFooter: boolean;
  footerText: string;
};

export type DataMode = 'live' | 'sample';

export type ReportDoc = {
  version: 1;
  id: string;
  name: string;
  client: string;
  /**
   * The client's domain, which is what live data is actually fetched for.
   * Optional because documents saved before reports were bound to a client
   * still load; those fall back to the session's active domain.
   */
  clientDomain?: string;
  range: RangeKey;
  dataMode: DataMode;
  accent: AccentKey;
  density: 'comfortable' | 'compact';
  pageSetup: PageSetup;
  customMetrics: CustomMetric[];
  benchmarks: Benchmark[];
  pages: ReportPage[];
  updatedAt: string;
};

/* ── ids ───────────────────────────────────────────────────────────── */

let counter = 0;

/**
 * Ids only have to be unique inside one document. A counter plus a per-load
 * random prefix avoids `Date.now()` collisions when a preset drops six widgets
 * in the same tick.
 */
const PREFIX = Math.random().toString(36).slice(2, 7);

export function newId(kind = 'w') {
  counter += 1;
  return `${kind}_${PREFIX}${counter.toString(36)}`;
}

/** Deep clone that also re-ids every node, for duplicate actions. */
export function cloneWidget(widget: Widget): Widget {
  return { ...widget, id: newId('w') };
}

export function cloneSection(section: Section): Section {
  return {
    ...section,
    id: newId('s'),
    widgets: section.widgets.map(cloneWidget),
  };
}

export function clonePage(page: ReportPage): ReportPage {
  return {
    ...page,
    id: newId('p'),
    sections: page.sections.map(cloneSection),
  };
}
