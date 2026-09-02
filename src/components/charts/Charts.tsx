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
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cx } from '../ui/primitives';
import {
  ChartEmpty,
  LABEL_FORMATTERS,
  formatValue,
  type LabelFormat,
  type SeriesSpec,
  type ValueFormat,
} from './ChartShell';

/*
 * The recharts-backed charts only.
 *
 * Frames, tables, distribution strips and simple bar lists live in
 * ChartShell.tsx, which has no charting dependency — importing THIS module
 * pulls in ~1,600 modules of recharts, so pages that do not plot a series
 * should import from ChartShell instead.
 *
 * Chart layer rules (from the data-viz procedure):
 *  - Series colours are the validated categorical slots 1–3, fixed order,
 *    never cycled. Nothing here generates a hue.
 *  - Magnitude uses the single-hue sequential ramp.
 *  - Gained/lost uses the diverging pair around a zero baseline.
 *  - Grid and axes are recessive; marks thin; data-ends 4px rounded.
 *  - Formatting is passed as tokens, not functions: most callers are server
 *    components, which cannot serialise a function prop.
 */

export { ChartFrame, DistributionStrip, SimpleTable, ChartEmpty } from './ChartShell';
export type { ValueFormat, LabelFormat, SeriesSpec } from './ChartShell';

type TooltipPayload = { name?: string; value?: number | string; color?: string; dataKey?: string };

function ChartTooltip({
  active,
  payload,
  label,
  seriesFormats,
  fallbackFormat,
  labelFormat,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  /** dataKey → value format token. */
  seriesFormats?: Record<string, ValueFormat | undefined>;
  fallbackFormat?: ValueFormat;
  labelFormat?: LabelFormat;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-hairline bg-surface-raised px-3 py-2 shadow-lift">
      <p className="mb-1 text-2xs font-medium uppercase tracking-[0.06em] text-ink-muted">
        {LABEL_FORMATTERS[labelFormat ?? 'raw'](String(label))}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs text-ink">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span className="text-ink-secondary">{entry.name}</span>
            <span className="ml-auto font-medium tnum">
              {typeof entry.value === 'number'
                ? formatValue(
                    entry.value,
                    seriesFormats?.[String(entry.dataKey)] ?? fallbackFormat,
                  )
                : String(entry.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 } as const;

/* ── Trend over time ───────────────────────────────────────────────── */

export function TrendLine<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  xFormat = 'raw',
  yFormat,
  referenceValue,
  referenceLabel,
  area,
}: {
  data: T[];
  xKey: string;
  series: SeriesSpec[];
  height?: number;
  xFormat?: LabelFormat;
  yFormat?: ValueFormat;
  referenceValue?: number;
  referenceLabel?: string;
  /** Fill under the line with a fading gradient. Single series only. */
  area?: boolean;
}) {
  const seriesFormats = Object.fromEntries(series.map((spec) => [spec.key, spec.format]));
  const filled = !!area && series.length === 1;
  const ChartRoot = filled ? AreaChart : LineChart;
  const gradientId = `fill-${series.map((spec) => spec.key).join('-')}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartRoot data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
          {filled && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series[0].color} stopOpacity={0.34} />
                <stop offset="100%" stopColor={series[0].color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            tickFormatter={LABEL_FORMATTERS[xFormat]}
            minTickGap={24}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatValue(value, yFormat ?? 'compact')}
          />
          {referenceValue !== undefined && (
            <ReferenceLine
              y={referenceValue}
              stroke="var(--axis)"
              strokeDasharray="4 4"
              label={{
                value: referenceLabel,
                position: 'insideTopRight',
                fill: 'var(--text-muted)',
                fontSize: 10,
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={
              <ChartTooltip
                seriesFormats={seriesFormats}
                fallbackFormat={yFormat}
                labelFormat={xFormat}
              />
            }
          />
          {filled
            ? (
                <Area
                  type="monotone"
                  dataKey={series[0].key}
                  name={series[0].label}
                  stroke={series[0].color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--surface-1)' }}
                />
              )
            : series.map((spec) => (
                <Line
                  key={spec.key}
                  type="monotone"
                  dataKey={spec.key}
                  name={spec.label}
                  stroke={spec.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--surface-1)' }}
                />
              ))}
        </ChartRoot>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Diverging columns (above / below a zero baseline) ─────────────── */

export function DivergingColumns<T extends Record<string, unknown>>({
  data,
  xKey,
  positive,
  negative,
  height = 240,
  xFormat = 'raw',
}: {
  data: T[];
  xKey: string;
  positive: SeriesSpec;
  negative: SeriesSpec;
  height?: number;
  xFormat?: LabelFormat;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            tickFormatter={LABEL_FORMATTERS[xFormat]}
            minTickGap={16}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(value: number) => String(Math.abs(value))}
          />
          <ReferenceLine y={0} stroke="var(--axis)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: 'var(--accent-soft)' }}
            content={<ChartTooltip fallbackFormat="abs" labelFormat={xFormat} />}
          />
          <Bar
            dataKey={positive.key}
            name={positive.label}
            fill={positive.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
          />
          <Bar
            dataKey={negative.key}
            name={negative.label}
            fill={negative.color}
            radius={[0, 0, 4, 4]}
            maxBarSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Magnitude bars (sequential, one hue) ──────────────────────────── */

export function MagnitudeBars({
  data,
  height,
  valueFormat = 'number',
  layout = 'horizontal',
}: {
  data: { label: string; value: number }[];
  height?: number;
  valueFormat?: ValueFormat;
  /** 'horizontal' draws bars left→right with category labels on the y axis. */
  layout?: 'horizontal' | 'vertical';
}) {
  const max = Math.max(1, ...data.map((row) => row.value));
  // Sequential encoding: more is darker, driven by the value itself (not rank).
  const ramp = ['var(--seq-250)', 'var(--seq-400)', 'var(--seq-550)', 'var(--seq-700)'];
  const colorFor = (value: number) =>
    ramp[Math.min(ramp.length - 1, Math.floor((value / max) * ramp.length))];

  const resolvedHeight = height ?? Math.max(160, data.length * 34 + 20);
  const tickFormatter = (value: number) => formatValue(value, valueFormat);

  if (layout === 'horizontal') {
    return (
      <div style={{ height: resolvedHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={tickFormatter}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
              width={148}
            />
            <Tooltip
              cursor={{ fill: 'var(--accent-soft)' }}
              content={<ChartTooltip fallbackFormat={valueFormat} />}
            />
            <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {data.map((row) => (
                <Cell key={row.label} fill={colorFor(row.value)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ height: resolvedHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--gridline)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={tickFormatter}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent-soft)' }}
            content={<ChartTooltip fallbackFormat={valueFormat} />}
          />
          <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]} maxBarSize={44}>
            {data.map((row) => (
              <Cell key={row.label} fill={colorFor(row.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Simple key/value table used as the table view for charts ──────── */

