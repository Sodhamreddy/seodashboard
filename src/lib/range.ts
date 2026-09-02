/**
 * The reporting window shared by the Overview page and the printable report.
 *
 * Kept separate from the report builder's `RANGES` on purpose: the builder's
 * entries are canvas presets whose `days` are rough (its `monthToDate` is a
 * flat 18), whereas these drive real provider calls and so have to be honest
 * about how many days they ask for. Anything that hits `getAdsReport` or
 * `getBacklinkReport` should resolve its window through here.
 */

export type RangeKey = '7d' | '30d' | '90d' | '180d' | '365d';

export const DASH_RANGES: { key: RangeKey; label: string; short: string; days: number }[] = [
  { key: '7d', label: 'Last 7 days', short: '7d', days: 7 },
  { key: '30d', label: 'Last 30 days', short: '30d', days: 30 },
  { key: '90d', label: 'Last 90 days', short: '90d', days: 90 },
  { key: '180d', label: 'Last 6 months', short: '6m', days: 180 },
  { key: '365d', label: 'Last 12 months', short: '12m', days: 365 },
];

export const DEFAULT_RANGE: RangeKey = '30d';

/**
 * An explicit calendar window, as `YYYY-MM-DD`.
 *
 * The presets above are *rolling* windows that always end today. A custom range
 * is not, and that distinction is the whole reason this type exists: passing a
 * custom range to a provider as a day count would silently report the last N
 * days instead of the months the operator actually picked. Providers that can
 * accept explicit dates take this; the one that cannot says so.
 */
export type DateWindow = { from: string; to: string };

export type ResolvedRange = {
  key: RangeKey | 'custom';
  label: string;
  /** Day span. For a custom window this is `to - from`, inclusive. */
  days: number;
  /** Present only for a custom range. Absent means "rolling, ending today". */
  custom?: DateWindow;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days between two ISO dates, inclusive of both ends. */
function inclusiveDays(from: string, to: string) {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Resolves the search params to a window.
 *
 * Accepts either `?range=<preset>` or `?range=custom&from=…&to=…`. Every
 * validation failure degrades to the 30-day preset rather than erroring, so a
 * hand-edited or truncated URL still renders a page.
 */
export function resolveRange(
  input: string | string[] | undefined,
  from?: string | string[],
  to?: string | string[],
): ResolvedRange {
  const key = Array.isArray(input) ? input[0] : input;

  if (key === 'custom') {
    const custom = normalizeWindow(
      Array.isArray(from) ? from[0] : from,
      Array.isArray(to) ? to[0] : to,
    );
    if (custom) {
      return {
        key: 'custom',
        label: `${prettyDate(custom.from)} – ${prettyDate(custom.to)}`,
        days: inclusiveDays(custom.from, custom.to),
        custom,
      };
    }
    // Fall through to the default when the dates are unusable.
  }

  const preset = DASH_RANGES.find((range) => range.key === key) ?? rangeMeta(DEFAULT_RANGE);
  return { key: preset.key, label: preset.label, days: preset.days };
}

/**
 * Validates and orders a custom window, or returns null.
 *
 * Rules: both dates present and ISO-shaped, start before end (swapped inputs
 * are corrected rather than rejected), nothing in the future, and a span no
 * wider than three years — past that the provider calls get slow enough to time
 * out, which reads as a broken page rather than a rejected input.
 */
export function normalizeWindow(
  fromInput: string | undefined,
  toInput: string | undefined,
): DateWindow | null {
  const from = (fromInput ?? '').trim();
  const to = (toInput ?? '').trim();
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) return null;

  const [start, end] = from <= to ? [from, to] : [to, from];
  const today = isoToday();
  const cappedEnd = end > today ? today : end;
  if (start > cappedEnd) return null;
  if (inclusiveDays(start, cappedEnd) > 1096) return null;

  return { from: start, to: cappedEnd };
}

/** The furthest-back date the picker offers, so the inputs can bound themselves. */
export function earliestSelectableDate() {
  return new Date(Date.now() - 1095 * 86_400_000).toISOString().slice(0, 10);
}

export { isoToday };

export function rangeMeta(key: RangeKey) {
  return DASH_RANGES.find((range) => range.key === key) ?? DASH_RANGES[1];
}

/**
 * Formats the first–last date span of a series.
 *
 * The year is added only when the span crosses a calendar year, because a
 * 12-month window rendered as "Aug 28 – Aug 27" is unreadable without it while
 * a 30-day window is cluttered by it.
 */
export function formatWindow(firstIso: string, lastIso: string) {
  const first = new Date(firstIso);
  const last = new Date(lastIso);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return `${firstIso} – ${lastIso}`;
  }

  const sameYear = first.getFullYear() === last.getFullYear();
  const options: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };

  return `${first.toLocaleDateString('en-US', options)} – ${last.toLocaleDateString(
    'en-US',
    options,
  )}`;
}
