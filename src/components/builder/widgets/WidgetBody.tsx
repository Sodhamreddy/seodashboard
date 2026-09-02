'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { metricById } from '@/lib/builder/catalog';
import {
  changePct,
  deltaTone,
  formatMetric,
  type MetricValue,
  type SeriesPoint,
} from '@/lib/builder/data';
import { shortDate } from '@/lib/format';
import type { Benchmark, MetricFormat, Widget } from '@/lib/builder/types';

/**
 * Widget bodies.
 *
 * Every renderer receives an already-resolved `MetricValue` and does no fetching
 * of its own, which is what lets the same component tree serve the editor, the
 * preview and the printed page. The `unavailable` state is rendered explicitly:
 * a widget in Live mode whose integration is not connected says so instead of
 * showing a number nobody can trace.
 */

export type WidgetBodyProps = {
  widget: Widget;
  value: MetricValue;
  label: string;
  format: MetricFormat;
  accent: string;
  benchmark?: Benchmark;
  /** Compact density trims paddings and type sizes for dense pages. */
  compact?: boolean;
};

/* ── Colour resolution ─────────────────────────────────────────────── */

function seriesColor(widget: Widget, accent: string) {
  if (widget.colorSlot === 0) return 'var(--series-1)';
  if (widget.colorSlot === 1) return 'var(--series-2)';
  if (widget.colorSlot === 2) return 'var(--series-3)';
  return accent;
}

/**
 * Donut fills walk the sequential ramp first (magnitude reads correctly when the
 * slices are sorted by size) and only then borrow the two remaining categorical
 * slots. Beyond that everything folds into the neutral grid tone rather than
 * inventing hues outside the validated token set.
 */
const DONUT_FILLS = [
  'var(--seq-700)',
  'var(--seq-550)',
  'var(--seq-400)',
  'var(--seq-250)',
  'var(--seq-100)',
  'var(--series-2)',
  'var(--series-3)',
];

function donutFill(index: number) {
  return DONUT_FILLS[index] ?? 'var(--gridline)';
}

/* ── Shared pieces ─────────────────────────────────────────────────── */

function Unavailable({ reason, onAccent }: { reason?: string; onAccent?: boolean }) {
  const color = onAccent ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)';
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 text-center">
      <Icon name="info" size={16} style={{ color }} />
      <p className="text-2xs leading-snug" style={{ color }}>
        {reason ?? 'No data for this metric'}
      </p>
    </div>
  );
}

function DeltaChip({
  change,
  goodDirection,
  suffix = '%',
  digits = 1,
  onAccent,
}: {
  change: number;
  goodDirection: 'up' | 'down';
  suffix?: string;
  digits?: number;
  onAccent?: boolean;
}) {
  const tone = deltaTone(change, goodDirection);
  const rising = change > 0;

  // On a filled tile the accent already carries the emphasis, so the chip drops
  // to white-on-transparent rather than fighting it with a status colour.
  const color = onAccent
    ? 'rgba(255,255,255,0.92)'
    : tone === 'good'
      ? 'var(--delta-up)'
      : tone === 'bad'
        ? 'var(--delta-down)'
        : 'var(--text-muted)';

  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold tnum" style={{ color }}>
      {tone !== 'flat' && <Icon name={rising ? 'arrowUp' : 'arrowDown'} size={12} />}
      {Math.abs(change).toFixed(digits)}
      {suffix}
    </span>
  );
}

function BenchmarkMeter({
  value,
  benchmark,
  onAccent,
}: {
  value: number;
  benchmark: Benchmark;
  onAccent?: boolean;
}) {
  const ratio =
    benchmark.direction === 'atLeast'
      ? value / (benchmark.target || 1)
      : (benchmark.target || 1) / (value || 1);
  const pct = Math.min(100, Math.max(0, ratio * 100));
  const hit = ratio >= 1;

  return (
    <div className="mt-auto space-y-1">
      <div
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: onAccent ? 'rgba(255,255,255,0.25)' : 'var(--surface-0)' }}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${pct}%`,
            background: onAccent
              ? 'rgba(255,255,255,0.9)'
              : hit
                ? 'var(--status-good)'
                : 'var(--status-warning)',
          }}
        />
      </div>
      <p
        className="text-2xs tnum"
        style={{ color: onAccent ? 'rgba(255,255,255,0.82)' : 'var(--text-muted)' }}
      >
        {hit ? 'Target met' : 'Target'} · {benchmark.direction === 'atLeast' ? '≥' : '≤'}{' '}
        {benchmark.target}
      </p>
    </div>
  );
}

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 10 } as const;

function MiniTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
  format: MetricFormat;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.value;
  return (
    <div className="rounded-lg border border-hairline bg-surface-raised px-2.5 py-1.5 shadow-lift">
      <p className="text-2xs text-ink-muted">{shortDate(String(label))}</p>
      <p className="text-xs font-semibold tnum text-ink">
        {typeof raw === 'number' ? formatMetric(raw, format) : String(raw ?? '—')}
      </p>
    </div>
  );
}

/* ── Body ──────────────────────────────────────────────────────────── */

export function WidgetBody(props: WidgetBodyProps) {
  const { widget, value } = props;

  // Handled once here so the reason is legible on filled tiles too, rather than
  // in each renderer with the default ink colour.
  if (value.state !== 'ok') {
    return <Unavailable reason={value.reason} onAccent={!!widget.filled} />;
  }

  switch (widget.kind) {
    case 'heading':
      return <HeadingBody {...props} />;
    case 'text':
      return <TextBody {...props} />;
    case 'divider':
      return (
        <div className="flex h-full items-center px-1">
          <span className="h-px w-full bg-hairline" />
        </div>
      );
    case 'spacer':
      return <div className="h-full" />;
    case 'image':
      return <ImageBody {...props} />;
    case 'stat':
      return <StatBody {...props} />;
    case 'delta':
      return <StatBody {...props} emphasiseChange />;
    case 'sparkStat':
      return <SparkStatBody {...props} />;
    case 'line':
    case 'area':
      return <TrendBody {...props} />;
    case 'bar':
      return <BarBody {...props} />;
    case 'donut':
      return <DonutBody {...props} />;
    case 'gauge':
      return <GaugeBody {...props} />;
    case 'table':
      return <TableBody {...props} />;
    default:
      return <Unavailable reason="Unsupported widget" />;
  }
}

/* ── Content blocks ────────────────────────────────────────────────── */

function HeadingBody({ widget, accent }: WidgetBodyProps) {
  const size =
    widget.level === 3 ? 'text-sm' : widget.level === 2 ? 'text-base' : 'text-xl sm:text-2xl';

  return (
    <div
      className={cx(
        'flex h-full items-center px-4',
        widget.align === 'center' && 'justify-center text-center',
      )}
      style={
        widget.filled
          ? { background: accent, color: '#fff', borderRadius: 10 }
          : { color: 'var(--text-primary)' }
      }
    >
      <span className={cx('truncate font-semibold tracking-[-0.02em]', size)}>
        {widget.text || widget.title || 'Heading'}
      </span>
    </div>
  );
}

function TextBody({ widget }: WidgetBodyProps) {
  return (
    <div className="h-full overflow-auto px-1">
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
        {widget.text || 'Double-click to write commentary for this section.'}
      </p>
    </div>
  );
}

function ImageBody({ widget }: WidgetBodyProps) {
  if (!widget.src) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline">
        <Icon name="image" size={18} className="text-ink-muted" />
        <p className="text-2xs text-ink-muted">Add an image URL in the panel</p>
      </div>
    );
  }
  return (
    // A report image is arbitrary user content of unknown dimensions; next/image
    // would need a configured remote host per client, so a plain img is correct.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={widget.src}
      alt={widget.alt ?? ''}
      className="h-full w-full rounded-lg object-cover"
    />
  );
}

/* ── Metric bodies ─────────────────────────────────────────────────── */

function MetricLabel({ label, onAccent }: { label: string; onAccent?: boolean }) {
  // Wraps to two lines rather than truncating: a three-column tile is narrow, and
  // "GOOGLE ADS CONV…" tells the reader less than a wrapped full label.
  return (
    <p
      className="line-clamp-2 text-2xs font-medium uppercase leading-tight tracking-[0.07em]"
      style={{ color: onAccent ? 'rgba(255,255,255,0.86)' : 'var(--text-secondary)' }}
    >
      {label}
    </p>
  );
}

/**
 * Headline figures scale down as their formatted string grows, so `$4,066.70`
 * stays inside a narrow tile instead of running past its edge.
 */
function valueSizeClass(text: string, compact: boolean) {
  if (text.length >= 11) return compact ? 'text-base' : 'text-lg';
  if (text.length >= 8) return compact ? 'text-lg' : 'text-2xl';
  return compact ? 'text-2xl' : 'text-3xl';
}

function StatBody({
  widget,
  value,
  label,
  format,
  accent,
  benchmark,
  compact,
  emphasiseChange,
}: WidgetBodyProps & { emphasiseChange?: boolean }) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;

  const metric = metricById(widget.metricId);
  const goodDirection = metric?.goodDirection ?? 'up';
  const signed = metric?.signed ?? false;
  const onAccent = !!widget.filled;
  const change = signed ? undefined : changePct(value.value, value.previous);
  const text = formatMetric(signed ? Math.abs(value.value ?? 0) : value.value, format);

  return (
    <div className="flex h-full min-w-0 flex-col justify-center gap-1 px-1">
      <MetricLabel label={label} onAccent={onAccent} />

      {/* Wrapping, not truncating: in a three-column tile the change chip and the
          figure cannot share a line, and an ellipsised number is worthless. The
          chip drops to the next line and the figure stays whole. */}
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {signed && value.value !== undefined && (
          <Icon
            name={value.value >= 0 ? 'arrowUp' : 'arrowDown'}
            size={compact ? 16 : 20}
            className="shrink-0"
            style={{
              color: onAccent
                ? '#fff'
                : deltaTone(value.value, goodDirection) === 'bad'
                  ? 'var(--delta-down)'
                  : 'var(--delta-up)',
            }}
          />
        )}
        <span
          className={cx('whitespace-nowrap font-semibold leading-none', valueSizeClass(text, !!compact))}
          style={{ color: onAccent ? '#fff' : 'var(--text-primary)' }}
        >
          {text}
        </span>

        {widget.compare && change !== undefined && (
          <span className="shrink-0">
            <DeltaChip change={change} goodDirection={goodDirection} onAccent={onAccent} />
          </span>
        )}
      </div>

      {emphasiseChange && !signed && change === undefined && (
        <p
          className="text-2xs"
          style={{ color: onAccent ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}
        >
          No comparison period
        </p>
      )}

      {benchmark && value.value !== undefined && (
        <BenchmarkMeter value={value.value} benchmark={benchmark} onAccent={onAccent} />
      )}
    </div>
  );
}

function SparkStatBody({ widget, value, label, format, accent }: WidgetBodyProps) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;
  const color = seriesColor(widget, accent);
  const points: SeriesPoint[] = value.points ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <MetricLabel label={label} />
        <span className="text-sm font-semibold tnum text-ink">
          {formatMetric(value.value, format)}
        </span>
      </div>
      <div className="mt-1 min-h-0 flex-1">
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.8}
                fill={`url(#spark-${widget.id})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-2xs text-ink-muted">No trend for this metric</p>
        )}
      </div>
    </div>
  );
}

function TrendBody({ widget, value, format, accent }: WidgetBodyProps) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;
  const points = value.points ?? [];
  if (points.length < 2) return <Unavailable reason="This metric has no time series" />;

  const color = seriesColor(widget, accent);
  const filled = widget.kind === 'area';
  const Root = filled ? AreaChart : LineChart;
  const hasNegative = points.some((point) => point.value < 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <Root data={points} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
        {filled && (
          <defs>
            <linearGradient id={`fill-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.34} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: 'var(--axis)' }}
          tickFormatter={shortDate}
          minTickGap={26}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(tick: number) => formatMetric(tick, format === 'currency2' ? 'compact' : format)}
        />
        {hasNegative && <ReferenceLine y={0} stroke="var(--axis)" strokeWidth={1} />}
        <Tooltip
          cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
          content={<MiniTooltip format={format} />}
        />
        {filled ? (
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${widget.id})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
          />
        ) : (
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
          />
        )}
      </Root>
    </ResponsiveContainer>
  );
}

function BarBody({ widget, value, format, accent }: WidgetBodyProps) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;

  // A breakdown bars by bucket; a time series bars by date.
  const data = value.slices
    ? value.slices.map((slice) => ({ label: slice.label, value: slice.value }))
    : (value.points ?? []).map((point) => ({ label: point.date, value: point.value }));

  if (!data.length) return <Unavailable reason="Nothing to chart" />;

  const isBreakdown = !!value.slices;
  const max = Math.max(...data.map((row) => row.value), 1);
  const color = seriesColor(widget, accent);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: 'var(--axis)' }}
          tickFormatter={(tick: string) => (isBreakdown ? tick : shortDate(tick))}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(tick: number) => formatMetric(tick, format === 'currency2' ? 'compact' : format)}
        />
        <Tooltip cursor={{ fill: 'var(--accent-soft)' }} content={<MiniTooltip format={format} />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={38}>
          {data.map((row) => (
            <Cell
              key={row.label}
              // Breakdowns encode magnitude on the sequential ramp; a time series
              // is one series and keeps one colour.
              fill={
                isBreakdown
                  ? donutFill(Math.min(4, Math.floor((1 - row.value / max) * 5)))
                  : color
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DonutBody({ widget, value, format, compact }: WidgetBodyProps) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;
  const slices = [...(value.slices ?? [])].sort((a, b) => b.value - a.value);
  if (!slices.length) return <Unavailable reason="This metric has no breakdown" />;

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="flex h-full min-h-0 items-center gap-3">
      <div className="relative h-full min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={1.5}
              stroke="var(--surface-1)"
              strokeWidth={2}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.label} fill={donutFill(index)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cx('font-semibold leading-none text-ink', compact ? 'text-lg' : 'text-2xl')}
          >
            {formatMetric(total, format)}
          </span>
          <span className="mt-0.5 text-2xs text-ink-muted">{widget.title || 'Total'}</span>
        </div>
      </div>

      <ul className="max-h-full min-w-[42%] shrink-0 space-y-1 overflow-auto pr-1">
        {slices.map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-1.5 text-2xs">
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: donutFill(index) }}
            />
            <span className="truncate text-ink-secondary">{slice.label}</span>
            <span className="ml-auto font-medium tnum text-ink">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GaugeBody({ widget, value, label, format, accent, benchmark }: WidgetBodyProps) {
  if (value.state !== 'ok' || value.value === undefined) {
    return <Unavailable reason={value.reason} />;
  }

  const metric = metricById(widget.metricId);
  // Without a benchmark there is no natural ceiling, so percent metrics scale to
  // 100 and everything else to a round number above the current value.
  const max =
    benchmark?.target ??
    (format === 'percent' ? 100 : Math.max(1, Math.ceil((metric?.base ?? value.value) * 1.5)));
  const ratio = Math.min(1, Math.max(0, value.value / max));
  const color = seriesColor(widget, accent);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <div className="relative min-h-0 flex-1 aspect-square">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-0)" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold leading-none tnum text-ink">
            {formatMetric(value.value, format)}
          </span>
          <span className="mt-0.5 text-2xs text-ink-muted">of {formatMetric(max, format)}</span>
        </div>
      </div>
      <p className="w-full truncate text-center text-2xs font-medium uppercase tracking-[0.07em] text-ink-secondary">
        {label}
      </p>
    </div>
  );
}

function TableBody({ widget, value }: WidgetBodyProps) {
  if (value.state !== 'ok') return <Unavailable reason={value.reason} />;
  const columns = value.columns ?? [];
  const rows = (value.rows ?? []).slice(0, widget.limit ?? 10);
  if (!columns.length || !rows.length) return <Unavailable reason="This metric has no rows" />;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-surface-sunken">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  'whitespace-nowrap border-b border-hairline px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                  index > 0 && 'text-right',
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-hairline last:border-0">
              {columns.map((column, index) => {
                const cell = row[column.key];
                return (
                  <td
                    key={column.key}
                    className={cx(
                      'max-w-[220px] truncate px-2.5 py-1.5 text-ink',
                      index > 0 && 'text-right tnum',
                    )}
                  >
                    {typeof cell === 'number' && column.format
                      ? formatMetric(cell, column.format)
                      : String(cell ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
