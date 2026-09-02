import { clockDuration, compactNumber, currency, number, percent } from '@/lib/format';
import { intBetween, isoDaysAgo, makeRandom, walk, type Random } from '@/lib/providers/seed';
import { metricById, type MetricDef, type TableColumn } from './catalog';
import { rangeMeta, type CustomMetric, type MetricFormat, type RangeKey } from './types';

/**
 * The value layer behind every widget.
 *
 * Sample data is *deterministic* — a pure function of (metric, range, salt) — for
 * the same reason the rest of the app's seeded providers are: the editor renders
 * on the client and re-renders on every keystroke, and a metric whose "trend"
 * changed each time you typed would be unusable, quite apart from hydration.
 *
 * Live data arrives from `/api/builder/live` as the same shape, so a widget never
 * knows or cares which mode it is in — except that `state: 'unavailable'` makes
 * it say so out loud rather than fall back to invented numbers.
 */

export type SeriesPoint = { date: string; value: number };
export type Slice = { label: string; value: number };
export type TableRow = Record<string, string | number>;

export type MetricValue = {
  state: 'ok' | 'unavailable';
  /** Why there is no live value — shown in the widget body. */
  reason?: string;
  value?: number;
  previous?: number;
  points?: SeriesPoint[];
  slices?: Slice[];
  columns?: TableColumn[];
  rows?: TableRow[];
};

export const UNAVAILABLE: MetricValue = { state: 'unavailable', reason: 'No data' };

/* ── Formatting ────────────────────────────────────────────────────── */

export function formatMetric(value: number | undefined, format: MetricFormat) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  switch (format) {
    case 'compact':
      return compactNumber(value);
    case 'currency':
      return currency(value);
    case 'currency2':
      return currency(value, 2);
    case 'percent':
      return percent(value, value >= 10 ? 1 : 2);
    case 'decimal1':
      return number(value, 1);
    case 'position':
      return number(value, 1);
    case 'duration':
      return clockDuration(value);
    default:
      return number(value);
  }
}

/** Percentage change, or undefined when there is nothing to compare against. */
export function changePct(value: number | undefined, previous: number | undefined) {
  if (value === undefined || previous === undefined || previous === 0) return undefined;
  return ((value - previous) / Math.abs(previous)) * 100;
}

/**
 * A rise is not automatically good — cost, bounce rate and SERP position all
 * improve as they fall, so the direction comes from the metric definition.
 */
export function deltaTone(change: number | undefined, goodDirection: 'up' | 'down') {
  if (change === undefined || Math.abs(change) < 0.05) return 'flat' as const;
  const rising = change > 0;
  return (goodDirection === 'up' ? rising : !rising) ? ('good' as const) : ('bad' as const);
}

/* ── Sample generation ─────────────────────────────────────────────── */

/** How many points a range gets, and how far apart they sit. */
function seriesShape(range: RangeKey) {
  const days = rangeMeta(range).days;
  if (days <= 31) return { count: days, step: 1 };
  if (days <= 120) return { count: Math.ceil(days / 7), step: 7 };
  return { count: 12, step: Math.round(days / 12) };
}

function seriesFor(metric: MetricDef, range: RangeKey, random: Random): SeriesPoint[] {
  const { count, step } = seriesShape(range);
  const spread = metric.spread ?? 0.15;

  // A "change" metric oscillates around zero and must be allowed to go negative;
  // a level metric drifts upward from just below its anchor and has a floor.
  const values = metric.signed
    ? walk(random, {
        start: 0,
        steps: count,
        drift: 0,
        volatility: metric.base * 2,
        min: -metric.base * 3,
        max: metric.base * 3,
      })
    : walk(random, {
        start: metric.base * (1 - spread * 0.5),
        steps: count,
        drift: (metric.base * spread) / count / 2,
        volatility: metric.base * spread,
        min: metric.format === 'position' ? 1 : 0,
      });

  return values.map((value, index) => ({
    date: isoDaysAgo((count - 1 - index) * step),
    value: metric.format === 'number' || metric.format === 'compact' ? Math.round(value) : Number(value.toFixed(2)),
  }));
}

const WORDS = {
  keywords: [
    'home care services',
    'in home care near me',
    'senior care agency',
    'respite care cost',
    'dementia care at home',
    '24 hour home care',
    'live in caregiver',
    'companion care services',
    'elderly care reviews',
    'private duty nursing',
  ],
  paths: ['/', '/services', '/pricing', '/locations/austin', '/blog/dementia-care', '/contact', '/about', '/careers'],
  campaigns: [
    'Brand — Exact',
    'Non-Brand — Services',
    'Performance Max — All',
    'Competitor — Phrase',
    'Remarketing — Display',
    'Local — Near Me',
  ],
  anchors: ['home care', 'read more', 'brand name', 'senior care services', 'click here', 'in-home care guide', 'learn more'],
} as const;

function tableFor(metric: MetricDef, random: Random): TableRow[] {
  const columns = metric.columns ?? [];
  switch (metric.id) {
    case 'keyword_movers':
      return WORDS.keywords.slice(0, 8).map((keyword) => {
        const change = intBetween(random, -9, 14);
        return { keyword, position: intBetween(random, 1, 42), change };
      });
    case 'top_pages':
      return WORDS.paths.map((path) => ({
        path,
        sessions: intBetween(random, 18, 460),
        bounce: Number((30 + random() * 40).toFixed(1)),
      }));
    case 'ads_campaigns':
      return WORDS.campaigns.map((name) => {
        const clicks = intBetween(random, 60, 620);
        return {
          name,
          spend: Number((clicks * (1.4 + random() * 3)).toFixed(2)),
          clicks,
          conversions: Math.round(clicks * (0.06 + random() * 0.2)),
        };
      });
    case 'top_anchors': {
      const counts = WORDS.anchors.map(() => intBetween(random, 6, 90));
      const total = counts.reduce((sum, value) => sum + value, 0);
      return WORDS.anchors.map((anchor, index) => ({
        anchor,
        count: counts[index],
        share: Number(((counts[index] / total) * 100).toFixed(1)),
      }));
    }
    case 'gsc_queries':
      return WORDS.keywords.slice(0, 9).map((query) => {
        const impressions = intBetween(random, 220, 9_400);
        const clicks = Math.round(impressions * (0.005 + random() * 0.09));
        return {
          query,
          clicks,
          impressions,
          ctr: Number(((clicks / impressions) * 100).toFixed(2)),
        };
      });
    default:
      // Unknown table metric: still produce the right column count so layout holds.
      return Array.from({ length: 6 }, (_, row) =>
        Object.fromEntries(
          columns.map((column, index) => [
            column.key,
            index === 0 ? `Row ${row + 1}` : intBetween(random, 10, 900),
          ]),
        ),
      );
  }
}

function breakdownFor(metric: MetricDef, random: Random): Slice[] {
  const buckets = metric.buckets ?? ['A', 'B', 'C'];
  const weights = buckets.map(() => 0.25 + random());
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return buckets.map((label, index) => ({
    label,
    value: Math.max(1, Math.round((weights[index] / total) * metric.base)),
  }));
}

/** Deterministic sample value for one metric. */
export function sampleMetric(metricId: string, range: RangeKey, salt = ''): MetricValue {
  const metric = metricById(metricId);
  if (!metric) return { state: 'unavailable', reason: 'Unknown metric' };

  const random = makeRandom(`builder:${metric.id}:${range}:${salt}`);

  if (metric.shape === 'series') {
    const points = seriesFor(metric, range, random);
    const value = points[points.length - 1]?.value;
    // Previous period is the mirror-image window, approximated by the head of
    // the walk — enough to make the comparison stable and directional. Signed
    // metrics get none: a percentage change of a change is not a number anyone
    // can read.
    const previous = metric.signed ? undefined : points[0]?.value;
    return { state: 'ok', points, value, previous };
  }

  if (metric.shape === 'breakdown') {
    const slices = breakdownFor(metric, random);
    return {
      state: 'ok',
      slices,
      value: slices.reduce((sum, slice) => sum + slice.value, 0),
    };
  }

  if (metric.shape === 'table') {
    return { state: 'ok', columns: metric.columns ?? [], rows: tableFor(metric, random) };
  }

  const spread = metric.spread ?? 0.15;
  const value = Number((metric.base * (1 + (random() - 0.5) * spread)).toFixed(2));
  const previous = Number((value * (1 + (random() - 0.5) * spread * 1.4)).toFixed(2));
  const rounded = metric.format === 'number' ? Math.round(value) : value;
  return {
    state: 'ok',
    value: rounded,
    previous: metric.format === 'number' ? Math.round(previous) : previous,
  };
}

/* ── Custom metrics (formula over other metrics) ───────────────────── */

type Token = { type: 'num' | 'id' | 'op' | 'paren'; text: string };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*([0-9]*\.?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*|[-+*/()])/g;
  let match: RegExpExecArray | null;
  let consumed = 0;

  while ((match = pattern.exec(expression))) {
    if (match.index !== consumed) break; // a gap means an illegal character
    consumed = pattern.lastIndex;
    const text = match[1];
    if (/^[0-9.]/.test(text)) tokens.push({ type: 'num', text });
    else if (/^[a-zA-Z_]/.test(text)) tokens.push({ type: 'id', text });
    else if (text === '(' || text === ')') tokens.push({ type: 'paren', text });
    else tokens.push({ type: 'op', text });
  }

  if (consumed !== expression.trimEnd().length) return [];
  return tokens;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/**
 * Shunting-yard evaluation over `+ - * / ( )`, metric ids and numbers.
 * Deliberately not `eval`/`new Function` — the expression comes from a text
 * field that is persisted and re-run on load.
 */
export function evaluateFormula(
  expression: string,
  resolve: (metricId: string) => number | undefined,
): number | undefined {
  const tokens = tokenize(expression);
  if (!tokens.length) return undefined;

  const values: number[] = [];
  const operators: string[] = [];

  const apply = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (operator === undefined || right === undefined || left === undefined) return false;
    switch (operator) {
      case '+':
        values.push(left + right);
        break;
      case '-':
        values.push(left - right);
        break;
      case '*':
        values.push(left * right);
        break;
      case '/':
        if (right === 0) return false;
        values.push(left / right);
        break;
      default:
        return false;
    }
    return true;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'num') {
      values.push(Number(token.text));
      continue;
    }

    if (token.type === 'id') {
      const resolved = resolve(token.text);
      if (resolved === undefined) return undefined;
      values.push(resolved);
      continue;
    }

    if (token.text === '(') {
      operators.push('(');
      continue;
    }

    if (token.text === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') {
        if (!apply()) return undefined;
      }
      if (operators.pop() !== '(') return undefined;
      continue;
    }

    // Unary minus at the start of an expression or right after another operator.
    const previous = tokens[index - 1];
    const isUnary =
      token.text === '-' && (!previous || previous.type === 'op' || previous.text === '(');
    if (isUnary) {
      values.push(0);
    }

    while (
      operators.length &&
      operators[operators.length - 1] !== '(' &&
      PRECEDENCE[operators[operators.length - 1]] >= PRECEDENCE[token.text]
    ) {
      if (!apply()) return undefined;
    }
    operators.push(token.text);
  }

  while (operators.length) {
    if (operators[operators.length - 1] === '(') return undefined;
    if (!apply()) return undefined;
  }

  const result = values.pop();
  return values.length === 0 && result !== undefined && Number.isFinite(result) ? result : undefined;
}

/** Metric ids referenced by a formula, for dependency display. */
export function formulaDependencies(expression: string) {
  return Array.from(new Set(tokenize(expression).filter((token) => token.type === 'id').map((token) => token.text)));
}

/* ── Resolution ────────────────────────────────────────────────────── */

export type MetricLookup = (metricId: string) => MetricValue;

/**
 * Resolve any metric id — catalog metric or custom formula — into a value.
 * Custom metrics always come out as scalars, with the previous period computed
 * from the same formula run against the inputs' previous values.
 */
export function resolveMetric(
  metricId: string | undefined,
  options: {
    lookup: MetricLookup;
    customMetrics: CustomMetric[];
  },
): MetricValue {
  if (!metricId) return { state: 'unavailable', reason: 'No metric selected' };

  const custom = options.customMetrics.find((entry) => entry.id === metricId);
  if (!custom) return options.lookup(metricId);

  const pick = (key: 'value' | 'previous') => (id: string) => {
    const resolved = options.lookup(id);
    return resolved.state === 'ok' ? resolved[key] : undefined;
  };

  const value = evaluateFormula(custom.expression, pick('value'));
  if (value === undefined) {
    return { state: 'unavailable', reason: 'Formula could not be evaluated' };
  }
  return { state: 'ok', value, previous: evaluateFormula(custom.expression, pick('previous')) };
}

/** Format token for a metric id, catalog or custom. */
export function formatFor(metricId: string | undefined, customMetrics: CustomMetric[]): MetricFormat {
  const custom = customMetrics.find((entry) => entry.id === metricId);
  if (custom) return custom.format;
  return metricById(metricId)?.format ?? 'number';
}

export function labelFor(metricId: string | undefined, customMetrics: CustomMetric[]) {
  const custom = customMetrics.find((entry) => entry.id === metricId);
  if (custom) return custom.label;
  return metricById(metricId)?.label ?? 'Metric';
}
