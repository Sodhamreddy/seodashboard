'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import {
  CONTENT_BLOCKS,
  INTEGRATIONS,
  KIND_META,
  METRICS,
  integrationMeta,
  metricsFor,
  widgetForMetric,
  type MetricDef,
} from '@/lib/builder/catalog';
import { evaluateFormula, formatMetric, formulaDependencies } from '@/lib/builder/data';
import { PROMPT_SUGGESTIONS, SECTION_PRESETS, composeFromPrompt } from '@/lib/builder/templates';
import {
  newId,
  type CustomMetric,
  type MetricFormat,
  type Widget,
} from '@/lib/builder/types';
import { clearDragPayload, DRAG_MIME, setDragPayload } from './dnd';
import { useActivePage, useBuilder, useMetricLookup, type RightTab } from './store';

/**
 * Right rail: everything you can put on the page.
 *
 * Each item is both clickable and draggable. Click appends to the current target
 * section (the selected widget's section, else the last one) because that is the
 * fast path; drag exists for placing something precisely.
 */

const TABS: { key: RightTab; label: string; icon: IconName; badge?: string }[] = [
  { key: 'ai', label: 'Build with AI', icon: 'sparkles' },
  { key: 'metrics', label: 'Integrations Metrics', icon: 'layers' },
  { key: 'views', label: 'Views', icon: 'grid', badge: 'NEW' },
  { key: 'content', label: 'Content Blocks', icon: 'heading' },
  { key: 'media', label: 'Media', icon: 'image' },
  { key: 'custom', label: 'Custom Metrics', icon: 'sliders' },
  { key: 'benchmarks', label: 'Benchmarks', icon: 'target' },
];

export function LibraryRail() {
  const { state, dispatch } = useBuilder();
  const page = useActivePage();
  const [open, setOpen] = useState(true);

  /** Where a clicked library item lands. */
  function targetSectionId() {
    const selected = state.selection?.sectionId;
    if (selected && page?.sections.some((section) => section.id === selected)) return selected;
    return page?.sections[page.sections.length - 1]?.id ?? null;
  }

  function addWidget(widget: Omit<Widget, 'id'>) {
    let sectionId = targetSectionId();

    if (!sectionId) {
      // An empty dashboard still has to accept the first click.
      sectionId = newId('s');
      dispatch({
        type: 'addSection',
        section: { id: sectionId, title: 'Untitled Section', span: 12, banner: true, tone: 'ink', widgets: [] },
      });
    }

    dispatch({
      type: 'addWidget',
      sectionId,
      widget: { ...widget, id: newId('w') },
      scaleToSection: true,
    });
  }

  return (
    <div className="flex h-full min-h-0">
      {open && (
        <div className="flex h-full w-[300px] min-h-0 shrink-0 flex-col border-l border-hairline bg-surface">
          <header className="flex shrink-0 items-center justify-between border-b border-hairline px-3 py-2.5">
            <h2 className="text-xs font-semibold text-ink">
              {TABS.find((tab) => tab.key === state.rightTab)?.label}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Collapse panel"
              aria-label="Collapse panel"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {state.rightTab === 'ai' && <AiPanel />}
            {state.rightTab === 'metrics' && <MetricsPanel onAdd={addWidget} />}
            {state.rightTab === 'views' && <ViewsPanel />}
            {state.rightTab === 'content' && <ContentPanel onAdd={addWidget} />}
            {state.rightTab === 'media' && <MediaPanel onAdd={addWidget} />}
            {state.rightTab === 'custom' && <CustomPanel onAdd={addWidget} />}
            {state.rightTab === 'benchmarks' && <BenchmarksPanel />}
          </div>
        </div>
      )}

      {/* The always-visible icon strip. */}
      <nav
        aria-label="Report library"
        className="flex h-full w-[78px] shrink-0 flex-col gap-0.5 overflow-y-auto border-l border-hairline bg-surface-raised py-2"
      >
        {TABS.map((tab) => {
          const active = state.rightTab === tab.key && open;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (state.rightTab === tab.key && open) {
                  setOpen(false);
                  return;
                }
                dispatch({ type: 'setRightTab', tab: tab.key });
                setOpen(true);
              }}
              className={cx(
                'relative mx-1.5 flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center transition-colors',
                active ? 'bg-accent-soft text-accent' : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {tab.badge && (
                <span className="absolute right-0.5 top-0.5 rounded bg-accent px-1 py-px text-[9px] font-bold leading-none text-white">
                  {tab.badge}
                </span>
              )}
              <Icon name={tab.icon} size={18} />
              <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ── Build with AI ─────────────────────────────────────────────────── */

function AiPanel() {
  const { dispatch } = useBuilder();
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<string[] | null>(null);

  function build() {
    const { sections, matched } = composeFromPrompt(prompt);
    sections.forEach((section) => dispatch({ type: 'addSection', section }));
    setResult(matched);
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-ink-secondary">
        Describe the report you need and the matching blocks are assembled from this workspace&apos;s
        preset library.
      </p>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={4}
        placeholder="e.g. Monthly SEO report with rankings, traffic and paid media"
        className="w-full rounded-lg border border-hairline bg-surface-raised px-2.5 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
      />
      <Button size="sm" icon="sparkles" onClick={build} disabled={!prompt.trim()} className="w-full">
        Build sections
      </Button>

      <div>
        <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
          Try
        </p>
        <ul className="space-y-1">
          {PROMPT_SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => setPrompt(suggestion)}
                className="w-full rounded-lg border border-hairline px-2.5 py-1.5 text-left text-2xs text-ink-secondary hover:bg-surface-sunken hover:text-ink"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {result && (
        <p className="rounded-lg bg-tint-good px-2.5 py-2 text-2xs leading-relaxed text-ink">
          Added {result.length} section{result.length === 1 ? '' : 's'}: {result.join(', ')}.
        </p>
      )}

      <p className="border-t border-hairline pt-2.5 text-2xs leading-relaxed text-ink-muted">
        This is a deterministic template matcher running locally — it never invents a metric the
        catalog does not have, and it does not call out to a model.
      </p>
    </div>
  );
}

/* ── Metrics ───────────────────────────────────────────────────────── */

function MetricRow({
  metric,
  onAdd,
}: {
  metric: MetricDef;
  onAdd: (widget: Omit<Widget, 'id'>) => void;
}) {
  const { state } = useBuilder();
  const widget = widgetForMetric(metric);

  /*
   * The badge reports what the live fetch actually returned, not what the
   * catalog guessed at build time.
   *
   * `metric.liveSource` is a static tag and it went stale the moment GA4 and
   * Search Console were wired: the canvas rendered real numbers while this rail
   * still stamped every one of those rows "SAMPLE". In Live mode the live cache
   * is the only honest source of truth, so it wins; the static tag is only a
   * fallback for Sample mode or before the first fetch lands.
   */
  const liveState =
    state.doc.dataMode === 'live' ? state.live?.metrics[metric.id]?.state : undefined;
  const liveReason =
    state.doc.dataMode === 'live' ? state.live?.metrics[metric.id]?.reason : undefined;

  const showSample =
    liveState === 'unavailable' ||
    (liveState === undefined && state.doc.dataMode === 'live' && !metric.liveSource) ||
    (state.doc.dataMode === 'sample' && !metric.liveSource);

  const badgeTitle =
    liveReason ??
    (metric.liveSource
      ? 'Live in Live Data mode'
      : 'No live adapter yet — renders sample data');

  return (
    <li>
      <div
        draggable
        onDragStart={(event) => {
          setDragPayload({ type: 'new', widget });
          event.dataTransfer.setData(DRAG_MIME, metric.id);
          event.dataTransfer.setData('text/plain', metric.label);
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onDragEnd={clearDragPayload}
        className="flex cursor-grab items-center gap-2 rounded-lg border border-hairline px-2.5 py-1.5 hover:border-accent hover:bg-accent-soft"
      >
        <Icon name={KIND_META[metric.defaultKind].icon} size={14} className="shrink-0 text-ink-muted" />
        <button
          type="button"
          onClick={() => onAdd(widget)}
          className="min-w-0 flex-1 truncate text-left text-xs text-ink"
        >
          {metric.label}
        </button>
        {showSample && (
          <span
            title={badgeTitle}
            className="shrink-0 rounded bg-tint-warning px-1 py-px text-[9px] font-semibold uppercase text-ink"
          >
            sample
          </span>
        )}
        {liveState === 'ok' && (
          <span
            title={`Live${metric.liveSource ? ` via ${metric.liveSource}` : ''}`}
            className="shrink-0 rounded bg-tint-good px-1 py-px text-[9px] font-semibold uppercase text-status-good"
          >
            live
          </span>
        )}
        <Icon name="plus" size={12} className="shrink-0 text-ink-muted" />
      </div>
    </li>
  );
}

function MetricsPanel({ onAdd }: { onAdd: (widget: Omit<Widget, 'id'>) => void }) {
  // Read for the live/sample badges and the per-integration connect hints.
  const { state } = useBuilder();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return METRICS.filter((metric) => metric.label.toLowerCase().includes(needle));
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Icon
          name="search"
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search metrics"
          className="h-9 w-full rounded-lg border border-hairline bg-surface-raised pl-8 pr-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </div>

      {filtered ? (
        <ul className="space-y-1">
          {filtered.map((metric) => (
            <MetricRow key={metric.id} metric={metric} onAdd={onAdd} />
          ))}
          {filtered.length === 0 && (
            <p className="px-1 text-2xs text-ink-muted">No metric matches “{query}”.</p>
          )}
        </ul>
      ) : (
        INTEGRATIONS.map((integration) => {
          const isCollapsed = collapsed.includes(integration.key);

          /*
           * The connect hint is a "you have not set this up" message, so it must
           * disappear once the integration answers. It kept telling the operator
           * "Needs a GA4 property" while GA4 was live on the canvas beside it.
           */
          const groupMetrics = metricsFor(integration.key);
          const anyLive =
            state.doc.dataMode === 'live' &&
            groupMetrics.some((metric) => state.live?.metrics[metric.id]?.state === 'ok');

          return (
            <section key={integration.key}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(integration.key)
                      ? current.filter((key) => key !== integration.key)
                      : [...current, integration.key],
                  )
                }
                className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-sunken"
              >
                <span aria-hidden="true" className={cx('tile h-6 w-6', `tile-${integration.tone}`)}>
                  <Icon name={integration.icon} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                  {integration.label}
                </span>
                <Icon
                  name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                  size={13}
                  className="text-ink-muted"
                />
              </button>
              {!isCollapsed && (
                <>
                  {integration.connectHint && !anyLive && (
                    <p className="mb-1.5 px-1 text-[10px] leading-snug text-ink-muted">
                      {integration.connectHint}
                    </p>
                  )}
                  <ul className="mb-2 space-y-1">
                    {metricsFor(integration.key).map((metric) => (
                      <MetricRow key={metric.id} metric={metric} onAdd={onAdd} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

/* ── Views (section presets) ───────────────────────────────────────── */

function ViewsPanel() {
  const { dispatch } = useBuilder();

  return (
    <div className="space-y-2">
      <p className="text-2xs leading-relaxed text-ink-secondary">
        Prebuilt blocks. Each one drops in as a section you can then resize and edit.
      </p>
      {SECTION_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => dispatch({ type: 'addSection', section: preset.build() })}
          className="flex w-full items-start gap-2.5 rounded-xl border border-hairline p-2.5 text-left hover:border-accent hover:bg-accent-soft"
        >
          <span
            aria-hidden="true"
            className={cx(
              'tile mt-0.5 h-7 w-7 shrink-0',
              preset.integration === 'mixed'
                ? 'tile-violet'
                : `tile-${integrationMeta(preset.integration).tone}`,
            )}
          >
            <Icon
              name={preset.integration === 'mixed' ? 'layers' : integrationMeta(preset.integration).icon}
              size={14}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink">{preset.label}</span>
            <span className="mt-0.5 block text-2xs leading-snug text-ink-secondary">
              {preset.blurb}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Content blocks ────────────────────────────────────────────────── */

function ContentPanel({ onAdd }: { onAdd: (widget: Omit<Widget, 'id'>) => void }) {
  function blockWidget(kind: Widget['kind']): Omit<Widget, 'id'> {
    const meta = KIND_META[kind];
    return {
      kind,
      span: meta.span,
      rows: meta.rows,
      text: kind === 'heading' ? 'Section heading' : kind === 'text' ? '' : undefined,
      level: kind === 'heading' ? 1 : undefined,
      filled: kind === 'heading',
    };
  }

  return (
    <div className="space-y-2">
      {CONTENT_BLOCKS.map((block) => {
        const widget = blockWidget(block.kind);
        return (
          <div
            key={block.kind}
            draggable
            onDragStart={(event) => {
              setDragPayload({ type: 'new', widget });
              event.dataTransfer.setData(DRAG_MIME, block.kind);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={clearDragPayload}
            className="flex cursor-grab items-start gap-2.5 rounded-xl border border-hairline p-2.5 hover:border-accent hover:bg-accent-soft"
          >
            <Icon name={block.icon} size={15} className="mt-0.5 shrink-0 text-ink-muted" />
            <button type="button" onClick={() => onAdd(widget)} className="min-w-0 flex-1 text-left">
              <span className="block text-xs font-semibold text-ink">{block.label}</span>
              <span className="mt-0.5 block text-2xs leading-snug text-ink-secondary">
                {block.blurb}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Media ─────────────────────────────────────────────────────────── */

function MediaPanel({ onAdd }: { onAdd: (widget: Omit<Widget, 'id'>) => void }) {
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-ink-secondary">
        Add a logo, screenshot or chart export by URL. Data URIs work too, which keeps an exported
        report self-contained.
      </p>
      <input
        value={src}
        onChange={(event) => setSrc(event.target.value)}
        placeholder="https://…/logo.png"
        className="h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
      />
      <input
        value={alt}
        onChange={(event) => setAlt(event.target.value)}
        placeholder="Alt text (describe the image)"
        className="h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
      />
      <Button
        size="sm"
        icon="image"
        className="w-full"
        disabled={!src.trim()}
        onClick={() => {
          onAdd({ kind: 'image', span: 6, rows: 5, src: src.trim(), alt: alt.trim() });
          setSrc('');
          setAlt('');
        }}
      >
        Add image
      </Button>
    </div>
  );
}

/* ── Custom metrics ────────────────────────────────────────────────── */

const FORMATS: MetricFormat[] = [
  'number',
  'compact',
  'currency',
  'currency2',
  'percent',
  'decimal1',
  'position',
  'duration',
];

function CustomPanel({ onAdd }: { onAdd: (widget: Omit<Widget, 'id'>) => void }) {
  const { state, dispatch } = useBuilder();
  const { lookup } = useMetricLookup();
  const [label, setLabel] = useState('');
  const [expression, setExpression] = useState('');
  const [format, setFormat] = useState<MetricFormat>('number');

  const preview = useMemo(() => {
    if (!expression.trim()) return undefined;
    return evaluateFormula(expression, (metricId) => {
      const value = lookup(metricId);
      return value.state === 'ok' ? value.value : undefined;
    });
  }, [expression, lookup]);

  const dependencies = useMemo(() => formulaDependencies(expression), [expression]);

  function create() {
    const metric: CustomMetric = {
      id: `cm_${newId('m')}`,
      label: label.trim() || 'Custom metric',
      expression: expression.trim(),
      format,
    };
    dispatch({ type: 'addCustomMetric', metric });
    setLabel('');
    setExpression('');
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-ink-secondary">
        Combine metric ids with <code className="text-ink">+ − × ÷</code> and brackets. Ids are the
        catalog ids, e.g.{' '}
        <code className="text-ink">ads_cost / ads_conversions</code>.
      </p>

      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Metric name"
        className="h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
      />
      <input
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        placeholder="ads_cost / ads_conversions"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
      />
      <select
        value={format}
        onChange={(event) => setFormat(event.target.value as MetricFormat)}
        className="h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 text-xs text-ink"
      >
        {FORMATS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>

      {expression.trim() && (
        <div className="rounded-lg border border-hairline px-2.5 py-2">
          <p className="text-2xs text-ink-muted">Preview</p>
          <p
            className={cx(
              'text-sm font-semibold tnum',
              preview === undefined ? 'text-status-critical' : 'text-ink',
            )}
          >
            {preview === undefined ? 'Cannot evaluate' : formatMetric(preview, format)}
          </p>
          {dependencies.length > 0 && (
            <p className="mt-1 text-[10px] leading-snug text-ink-muted">
              Uses {dependencies.join(', ')}
            </p>
          )}
        </div>
      )}

      <Button
        size="sm"
        icon="plus"
        className="w-full"
        disabled={!expression.trim() || preview === undefined}
        onClick={create}
      >
        Create metric
      </Button>

      {state.doc.customMetrics.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            In this report
          </p>
          <ul className="space-y-1">
            {state.doc.customMetrics.map((metric) => (
              <li
                key={metric.id}
                className="flex items-center gap-2 rounded-lg border border-hairline px-2.5 py-1.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    onAdd({
                      kind: 'stat',
                      metricId: metric.id,
                      span: 3,
                      rows: 3,
                      compare: true,
                      filled: true,
                      colorSlot: 'accent',
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs text-ink">{metric.label}</span>
                  <span className="block truncate font-mono text-[10px] text-ink-muted">
                    {metric.expression}
                  </span>
                </button>
                <button
                  type="button"
                  title="Delete metric"
                  aria-label={`Delete ${metric.label}`}
                  onClick={() => dispatch({ type: 'removeCustomMetric', metricId: metric.id })}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-tint-critical hover:text-status-critical"
                >
                  <Icon name="trash" size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Benchmarks ────────────────────────────────────────────────────── */

function BenchmarksPanel() {
  const { state, dispatch } = useBuilder();

  // Only metrics actually on the report can have a target — a benchmark with
  // nowhere to render is just dead config.
  const used = useMemo(() => {
    const ids = new Set<string>();
    state.doc.pages.forEach((page) =>
      page.sections.forEach((section) =>
        section.widgets.forEach((widget) => widget.metricId && ids.add(widget.metricId)),
      ),
    );
    return Array.from(ids);
  }, [state.doc.pages]);

  return (
    <div className="space-y-3">
      <p className="text-2xs leading-relaxed text-ink-secondary">
        Set a target for any metric on this report. Big-number and gauge widgets then show progress
        against it.
      </p>

      {used.length === 0 && (
        <p className="rounded-lg border border-dashed border-hairline px-2.5 py-3 text-2xs text-ink-muted">
          Add a metric widget first.
        </p>
      )}

      <ul className="space-y-2">
        {used.map((metricId) => {
          const benchmark = state.doc.benchmarks.find((entry) => entry.metricId === metricId);
          const metric = METRICS.find((entry) => entry.id === metricId);
          const label =
            metric?.label ??
            state.doc.customMetrics.find((entry) => entry.id === metricId)?.label ??
            metricId;

          return (
            <li key={metricId} className="rounded-lg border border-hairline px-2.5 py-2">
              <p className="truncate text-xs font-medium text-ink">{label}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <select
                  value={benchmark?.direction ?? 'atLeast'}
                  onChange={(event) =>
                    dispatch({
                      type: 'setBenchmark',
                      benchmark: {
                        metricId,
                        target: benchmark?.target ?? 0,
                        direction: event.target.value as 'atLeast' | 'atMost',
                      },
                    })
                  }
                  className="h-8 rounded-lg border border-hairline bg-surface px-1.5 text-2xs text-ink"
                >
                  <option value="atLeast">at least</option>
                  <option value="atMost">at most</option>
                </select>
                <input
                  type="number"
                  value={benchmark?.target ?? ''}
                  onChange={(event) =>
                    dispatch({
                      type: 'setBenchmark',
                      benchmark: {
                        metricId,
                        target: Number(event.target.value),
                        direction: benchmark?.direction ?? 'atLeast',
                      },
                    })
                  }
                  placeholder="Target"
                  className="h-8 min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-2 text-xs tnum text-ink"
                />
                {benchmark && (
                  <button
                    type="button"
                    title="Clear target"
                    aria-label={`Clear target for ${label}`}
                    onClick={() => dispatch({ type: 'removeBenchmark', metricId })}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
