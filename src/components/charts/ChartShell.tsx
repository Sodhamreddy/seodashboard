'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { cx } from '../ui/primitives';
import { compactNumber, currency, monthLabel, number, percent, shortDate } from '@/lib/format';

/*
 * The chart pieces that need NO charting library: the frame, the table view,
 * the distribution strip, and a CSS-only bar list.
 *
 * This split exists for a concrete reason. Importing anything from Charts.tsx
 * pulls in recharts, which is ~1,600 modules and dominates `next dev` compile
 * time. Pages that only need a frame, a table, or five simple bars (the SEO
 * score checker, the sitemap tool) now import from here and never touch
 * recharts at all.
 */

export type ValueFormat =
  | 'number'
  | 'decimal1'
  | 'compact'
  | 'currency'
  | 'currency2'
  | 'percent'
  | 'percent0'
  | 'abs'
  | 'raw';

export type LabelFormat = 'date' | 'month' | 'raw';

const VALUE_FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  number: (value) => number(value),
  decimal1: (value) => number(value, 1),
  compact: (value) => compactNumber(value),
  currency: (value) => currency(value),
  currency2: (value) => currency(value, 2),
  percent: (value) => percent(value),
  percent0: (value) => percent(value, 0),
  abs: (value) => number(Math.abs(value)),
  raw: (value) => String(value),
};

export const LABEL_FORMATTERS: Record<LabelFormat, (value: string) => string> = {
  date: shortDate,
  month: monthLabel,
  raw: (value) => value,
};

export function formatValue(value: number, token: ValueFormat | undefined) {
  return VALUE_FORMATTERS[token ?? 'number'](value);
}

export type SeriesSpec = {
  key: string;
  label: string;
  color: string;
  /** How this series' values read in tooltips. */
  format?: ValueFormat;
};

/* ── Frame: title, legend, chart/table toggle ──────────────────────── */

export function ChartFrame({
  title,
  subtitle,
  series,
  table,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  series?: SeriesSpec[];
  table?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <section className="surface-card rounded-card border border-hairline p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[0.95rem] font-semibold leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-ink-secondary">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div
              className="flex rounded-lg border border-hairline p-0.5"
              role="tablist"
              aria-label="View mode"
            >
              {(['chart', 'table'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={view === candidate}
                  onClick={() => setView(candidate)}
                  className={cx(
                    'rounded-md px-2 py-1 text-2xs font-medium capitalize transition-colors',
                    view === candidate
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {candidate}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* A legend is always present for two or more series; one series is
          named by the title, so no legend box there. */}
      {series && series.length >= 2 && view === 'chart' && (
        <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {series.map((spec) => (
            <li key={spec.key} className="flex items-center gap-1.5 text-2xs text-ink-secondary">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: spec.color }}
                aria-hidden="true"
              />
              {spec.label}
            </li>
          ))}
        </ul>
      )}

      {view === 'chart' ? children : table}
    </section>
  );
}

/* ── Tooltip ───────────────────────────────────────────────────────── */

export function SimpleTable({
  headers,
  rows,
  maxHeight = 260,
}: {
  headers: string[];
  rows: (string | number)[][];
  maxHeight?: number;
}) {
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-surface-sunken">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={cx(
                  'whitespace-nowrap border-b border-hairline px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                  index > 0 && 'text-right',
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-hairline last:border-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cx('px-3 py-1.5 text-ink', cellIndex > 0 && 'text-right tnum')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Distribution strip (part-to-whole across few buckets) ─────────── */

export function DistributionStrip({
  buckets,
  total,
}: {
  buckets: { label: string; count: number }[];
  total: number;
}) {
  const ramp = [
    'var(--seq-700)',
    'var(--seq-550)',
    'var(--seq-400)',
    'var(--seq-250)',
    'var(--seq-100)',
  ];

  // "Not ranking" is an absence, not a magnitude — it takes the neutral grid tone.
  const fillFor = (label: string, index: number) =>
    label.toLowerCase().includes('not')
      ? 'var(--gridline)'
      : ramp[Math.min(ramp.length - 1, index)];

  return (
    <div className="space-y-3">
      {/* 2px surface gaps between segments keep adjacent fills separable */}
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {buckets.map((bucket, index) => {
          const pct = total > 0 ? (bucket.count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <span
              key={bucket.label}
              title={`${bucket.label}: ${bucket.count}`}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${pct}%`, background: fillFor(bucket.label, index) }}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {buckets.map((bucket, index) => (
          <li key={bucket.label} className="flex items-center gap-1.5 text-2xs text-ink-secondary">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: fillFor(bucket.label, index) }}
              aria-hidden="true"
            />
            <span className="truncate">{bucket.label}</span>
            <span className="ml-auto font-medium tnum text-ink">{bucket.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline text-center">
      <Icon name="info" size={18} className="text-ink-muted" />
      <p className="text-xs text-ink-muted">{message}</p>
    </div>
  );
}


/* ── BarList — magnitude bars with no charting library ─────────────── */

export function BarList({
  data,
  valueFormat = 'number',
  maxLabelWidth = 148,
}: {
  data: { label: string; value: number }[];
  valueFormat?: ValueFormat;
  /** Label column width in px; long category names need more. */
  maxLabelWidth?: number;
}) {
  const max = Math.max(1, ...data.map((row) => row.value));
  // Sequential encoding, same ramp as MagnitudeBars: more is darker.
  const ramp = ['var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'];
  const colorFor = (value: number) =>
    ramp[Math.min(ramp.length - 1, Math.floor((value / max) * ramp.length))];

  if (data.length === 0) {
    return <ChartEmpty message="No data to plot." />;
  }

  return (
    <ul className="space-y-2">
      {data.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span
            className="shrink-0 truncate text-2xs text-ink-secondary"
            style={{ width: maxLabelWidth }}
            title={row.label}
          >
            {row.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full transition-[width]"
              style={{
                width: `${max > 0 ? Math.max(2, (row.value / max) * 100) : 0}%`,
                background: colorFor(row.value),
              }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-2xs font-medium tnum text-ink">
            {formatValue(row.value, valueFormat)}
          </span>
        </li>
      ))}
    </ul>
  );
}
