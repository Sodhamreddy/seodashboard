'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { Badge, cx, type Tone } from './primitives';

/* ── Delta ─────────────────────────────────────────────────────────────
 * Direction is carried by an arrow glyph plus a sign, so colour is never
 * the only channel. `inverted` is for metrics where lower is better
 * (average position, CPA).
 */

export function Delta({
  value,
  suffix = '',
  inverted = false,
  label,
}: {
  value: number;
  suffix?: string;
  inverted?: boolean;
  label?: string;
}) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-muted">
        ±0{suffix} {label}
      </span>
    );
  }

  const improving = inverted ? value < 0 : value > 0;
  const magnitude = Math.abs(value);
  const formatted = magnitude >= 100 ? magnitude.toFixed(0) : magnitude.toFixed(1).replace(/\.0$/, '');

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-2xs font-medium tnum',
        improving ? 'text-delta-up' : 'text-delta-down',
      )}
    >
      <Icon name={value > 0 ? 'arrowUp' : 'arrowDown'} size={11} />
      {formatted}
      {suffix}
      {label && <span className="text-ink-muted">{label}</span>}
    </span>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────── */

export function Sparkline({
  values,
  width = 108,
  height = 30,
  strokeVar = 'var(--series-1)',
}: {
  values: number[];
  width?: number;
  height?: number;
  strokeVar?: string;
}) {
  // useId is stable across SSR and hydration; a module counter would not be.
  const gradientId = `spark${useId().replace(/:/g, '')}`;

  const points = useMemo(() => {
    const clean = values.filter((value) => Number.isFinite(value));
    if (clean.length < 2) return null;

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const padding = 3;
    const innerHeight = height - padding * 2;

    return clean.map((value, index) => {
      const x = (index / (clean.length - 1)) * width;
      const y = padding + innerHeight - ((value - min) / span) * innerHeight;
      return { x, y };
    });
  }, [values, width, height]);

  if (!points) return null;
  const last = points[points.length - 1];
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  // Close the path down to the baseline so the fill has an area to shade.
  const area = `${line} ${width},${height} 0,${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeVar} stopOpacity={0.28} />
          <stop offset="100%" stopColor={strokeVar} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={strokeVar}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 2px surface ring keeps the end marker legible over the line */}
      <circle cx={last.x} cy={last.y} r={3.5} fill={strokeVar} stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaSuffix = '%',
  deltaInverted,
  deltaLabel,
  footnote,
  spark,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number;
  deltaSuffix?: string;
  deltaInverted?: boolean;
  deltaLabel?: string;
  footnote?: string;
  spark?: number[];
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div data-stat-tile className="surface-card surface-card-hover rounded-card border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <p data-stat-label className="text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
          {label}
        </p>
        {icon && <Icon name={icon} size={15} className="shrink-0 text-ink-muted" />}
      </div>

      <div className="mt-2 flex items-end gap-1.5">
        <span data-stat-value className="text-[1.75rem] font-semibold leading-none text-ink">
          {value}
        </span>
        {unit && <span className="pb-0.5 text-xs text-ink-secondary">{unit}</span>}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {delta !== undefined && (
            <Delta value={delta} suffix={deltaSuffix} inverted={deltaInverted} label={deltaLabel} />
          )}
          {footnote && (
            <p data-stat-detail className="mt-1 truncate text-2xs text-ink-muted">
              {footnote}
            </p>
          )}
          {tone && !footnote && delta === undefined && <Badge tone={tone}>{label}</Badge>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
    </div>
  );
}

/* ── Score gauge ───────────────────────────────────────────────────── */

const SCORE_BANDS: { min: number; color: string; label: string; tone: Tone }[] = [
  { min: 90, color: 'var(--status-good)', label: 'Excellent', tone: 'good' },
  { min: 75, color: 'var(--seq-400)', label: 'Good', tone: 'accent' },
  { min: 50, color: 'var(--status-serious)', label: 'Needs work', tone: 'serious' },
  { min: 0, color: 'var(--status-critical)', label: 'Critical', tone: 'critical' },
];

export function scoreBand(score: number) {
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export function ScoreGauge({
  score,
  grade,
  size = 168,
}: {
  score: number;
  grade?: string;
  size?: number;
}) {
  const band = scoreBand(score);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`SEO score ${score} out of 100`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--gridline)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={band.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-[2.75rem] font-semibold leading-none text-ink">{score}</span>
          <span className="mt-1 text-2xs uppercase tracking-[0.12em] text-ink-muted">
            of 100{grade ? ` · grade ${grade}` : ''}
          </span>
        </div>
      </div>
      <Badge tone={band.tone}>{band.label}</Badge>
    </div>
  );
}

/* ── Mini gauge (a small 0–100 ring, for paired scores like DA / PA) ── */

/*
 * Domain/Page Authority is NOT a 0–100 quality score — a DA of 40 is a
 * respectable site, not a failure. Scoring it with the SEO-score bands
 * mislabels normal profiles as "Critical", so authority gets its own scale.
 */
const AUTHORITY_BANDS: { min: number; color: string; label: string; tone: Tone }[] = [
  { min: 70, color: 'var(--status-good)', label: 'Excellent', tone: 'good' },
  { min: 50, color: 'var(--status-good)', label: 'Strong', tone: 'good' },
  { min: 30, color: 'var(--seq-400)', label: 'Fair', tone: 'accent' },
  { min: 15, color: 'var(--status-warning)', label: 'Low', tone: 'warning' },
  { min: 0, color: 'var(--status-critical)', label: 'Very low', tone: 'critical' },
];

export function authorityBand(value: number) {
  return AUTHORITY_BANDS.find((band) => value >= band.min) ?? AUTHORITY_BANDS[AUTHORITY_BANDS.length - 1];
}

export function MiniGauge({
  value,
  max = 100,
  caption,
  size = 96,
  scale = 'score',
}: {
  value: number;
  max?: number;
  caption: string;
  size?: number;
  /** 'authority' uses the DA/PA bands; 'score' uses the 0–100 quality bands. */
  scale?: 'score' | 'authority';
}) {
  const band = scale === 'authority' ? authorityBand(value) : scoreBand((value / max) * 100);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(max, value)) / max) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${caption}: ${value} of ${max}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--gridline)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={band.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-xl font-semibold leading-none tnum text-ink">{value}</span>
          {/* Band name in text, so the ring's colour is never the only signal. */}
          <span className="mt-0.5 text-2xs text-ink-muted">{band.label}</span>
        </div>
      </div>
      <span className="text-2xs font-medium uppercase tracking-[0.06em] text-ink-secondary">
        {caption}
      </span>
    </div>
  );
}

/* ── Compact metric cell, for dense clusters inside a panel ────────── */

/**
 * Colours the value when a metric is outside acceptable range.
 *
 * Deliberately opt-in and sparing: if every cell in a row is tinted, none of
 * them reads as a signal. A tone is never the only cue — the figure and its
 * footnote still say what is wrong.
 */
const CELL_TONE: Record<'good' | 'warning' | 'critical', string> = {
  good: 'text-status-good',
  warning: 'text-status-warning',
  critical: 'text-status-critical',
};

export function MetricCell({
  label,
  value,
  delta,
  deltaInverted,
  footnote,
  tone,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaInverted?: boolean;
  footnote?: string;
  /** Omit for the default ink. Use only when the number itself is the alert. */
  tone?: 'good' | 'warning' | 'critical';
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cx(
            'tnum text-xl font-semibold leading-none',
            tone ? CELL_TONE[tone] : 'text-ink',
          )}
        >
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} inverted={deltaInverted} />}
      </p>
      {footnote && <p className="mt-1 truncate text-2xs text-ink-muted">{footnote}</p>}
    </div>
  );
}

/* ── Meter (a ratio against a limit) ───────────────────────────────── */

export function Meter({
  value,
  max,
  label,
  valueLabel,
  markerPct,
  markerLabel,
  tone = 'accent',
}: {
  value: number;
  max: number;
  label?: string;
  valueLabel?: string;
  /** Optional reference marker, e.g. "% of the month elapsed". */
  markerPct?: number;
  markerLabel?: string;
  tone?: Extract<Tone, 'accent' | 'good' | 'warning' | 'serious' | 'critical'>;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fill: Record<string, string> = {
    accent: 'var(--seq-400)',
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    serious: 'var(--status-serious)',
    critical: 'var(--status-critical)',
  };

  return (
    <div data-meter className="space-y-1.5">
      {(label || valueLabel) && (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          {label && (
            <span data-meter-label className="truncate text-ink-secondary">
              {label}
            </span>
          )}
          {valueLabel && (
            <span data-meter-value className="shrink-0 font-medium tnum text-ink">
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: fill[tone] }}
        />
        {markerPct !== undefined && (
          <span
            title={markerLabel}
            className="absolute top-[-3px] h-[14px] w-[2px] rounded-full bg-ink-secondary"
            style={{ left: `calc(${Math.min(100, Math.max(0, markerPct))}% - 1px)` }}
          />
        )}
      </div>
      {markerLabel && (
        <p className="text-2xs text-ink-muted">
          <span className="mr-1 inline-block h-2 w-[2px] translate-y-px rounded-full bg-ink-secondary align-middle" />
          {markerLabel}
        </p>
      )}
    </div>
  );
}

/* ── Length meter (title / description budgets) ────────────────────── */

export function LengthMeter({ length, min, max }: { length: number; min: number; max: number }) {
  const pct = Math.min(100, (length / max) * 100);
  const state = length === 0 ? 'critical' : length < min ? 'warning' : length <= max ? 'good' : 'critical';
  const fill = {
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  }[state];

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
        <span
          className="absolute top-[-2px] h-[9px] w-[2px] bg-ink-muted"
          style={{ left: `calc(${(min / max) * 100}% - 1px)` }}
        />
      </div>
      <span className="shrink-0 text-2xs tnum text-ink-secondary">
        {length}/{max}
      </span>
    </div>
  );
}

/* ── Data table ────────────────────────────────────────────────────── */

export type Column<T> = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  className?: string;
  render: (row: T) => ReactNode;
  /** Supplying this makes the column sortable. */
  sortValue?: (row: T) => number | string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  initialSortDirection = 'desc',
  emptyMessage = 'No rows.',
  maxHeight,
  caption,
  pageSize = 10,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSort?: string;
  initialSortDirection?: 'asc' | 'desc';
  emptyMessage?: string;
  maxHeight?: number;
  caption?: string;
  /** Rows per page. Every table in the app pages through this one component. */
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState(initialSort ?? '');
  const [direction, setDirection] = useState<'asc' | 'desc'>(initialSortDirection);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sortKey);
    if (!column?.sortValue) return rows;

    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right));
      return direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, columns, sortKey, direction]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // A filter or resort can easily leave `page` pointing past the new last
  // page (e.g. narrowing 90 rows to 3 while sitting on page 4) — clamp on
  // render rather than only in an effect, so it never flashes an empty page.
  const clampedPage = Math.min(page, pageCount - 1);
  const start = clampedPage * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  function toggle(key: string) {
    setPage(0);
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('desc');
    }
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-xs text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="w-full min-w-full border-collapse text-left text-xs">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-0 z-10 bg-surface-sunken">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    'whitespace-nowrap border-b border-hairline px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                    column.align === 'right' && 'text-right',
                    column.className,
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cx(
                        'inline-flex items-center gap-1 hover:text-ink',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      {sortKey === column.key && (
                        <Icon name={direction === 'asc' ? 'arrowUp' : 'arrowDown'} size={10} />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, index) => (
              <tr
                key={rowKey(row, start + index)}
                className="border-b border-hairline last:border-0 hover:bg-surface-sunken"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cx(
                      'px-3 py-2 align-middle text-ink',
                      column.align === 'right' && 'text-right tnum',
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2.5">
          <p className="text-2xs text-ink-muted">
            <span className="tnum">{start + 1}</span>–
            <span className="tnum">{Math.min(start + pageSize, sorted.length)}</span> of{' '}
            <span className="tnum">{sorted.length}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={clampedPage === 0}
              aria-label="Previous page"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Icon name="chevronLeft" size={13} />
            </button>
            <span className="px-1.5 text-2xs tnum text-ink-secondary">
              {clampedPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={clampedPage >= pageCount - 1}
              aria-label="Next page"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-secondary hover:bg-surface-sunken disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Icon name="chevronRight" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
