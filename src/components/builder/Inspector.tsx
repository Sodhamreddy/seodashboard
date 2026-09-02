'use client';

import { Icon } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import { INTEGRATIONS, KIND_META, metricById, metricsFor } from '@/lib/builder/catalog';
import { GRID_COLS, accentMeta, isDataKind, type Widget, type WidgetKind } from '@/lib/builder/types';
import { useBuilder } from './store';

/**
 * Settings for the selected widget.
 *
 * This takes over the left rail while something is selected: it keeps the
 * three-column shell stable, and the canvas never has a floating panel covering
 * the widget being edited.
 */

const CONTENT_KIND_LABEL: Partial<Record<WidgetKind, string>> = {
  heading: 'Heading',
  text: 'Text block',
  divider: 'Divider',
  spacer: 'Spacer',
  image: 'Image',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-2xs font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-hairline bg-surface-raised px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none';

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-sunken"
      >
        <Icon name="minus" size={13} />
      </button>
      <span className="flex-1 text-center text-xs font-medium tnum text-ink">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid h-8 w-8 place-items-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-sunken"
      >
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}

export function Inspector() {
  const { state, dispatch } = useBuilder();
  const selection = state.selection;

  const section = state.doc.pages
    .flatMap((page) => page.sections)
    .find((candidate) => candidate.id === selection?.sectionId);
  const widget = section?.widgets.find((candidate) => candidate.id === selection?.widgetId);

  if (!selection || !section || !widget) return null;

  const metric = metricById(widget.metricId);
  const isData = isDataKind(widget.kind);

  function patch(next: Partial<Widget>, history = true) {
    dispatch({
      type: 'updateWidget',
      sectionId: section!.id,
      widgetId: widget!.id,
      patch: next,
      history,
    });
  }

  /** Kinds this widget may switch to, given what its metric can render. */
  const allowedKinds: WidgetKind[] = isData
    ? metric?.kinds ?? ['stat', 'delta', 'sparkStat', 'line', 'area', 'bar', 'gauge']
    : [widget.kind];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-surface px-3 py-2.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'select', selection: null })}
          title="Back to dashboards"
          aria-label="Back to dashboards"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
          {CONTENT_KIND_LABEL[widget.kind] ?? metric?.label ?? 'Widget'}
        </h2>
        <span className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
          {section.title}
        </span>
      </header>

      <div className="space-y-3.5 p-3">
        {/* Title */}
        {widget.kind !== 'divider' && widget.kind !== 'spacer' && (
          <Row label="Title">
            <input
              value={widget.title ?? ''}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder={metric?.label ?? 'Optional'}
              className={inputClass}
            />
          </Row>
        )}

        {/* Metric */}
        {isData && (
          <Row label="Metric">
            <select
              value={widget.metricId ?? ''}
              onChange={(event) => patch({ metricId: event.target.value })}
              className={cx(inputClass, 'pr-8')}
            >
              {INTEGRATIONS.map((integration) => (
                <optgroup key={integration.key} label={integration.label}>
                  {metricsFor(integration.key).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              {state.doc.customMetrics.length > 0 && (
                <optgroup label="Custom">
                  {state.doc.customMetrics.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Row>
        )}

        {/* Kind */}
        {isData && allowedKinds.length > 1 && (
          <div className="space-y-1">
            <span className="text-2xs font-medium text-ink-secondary">Visualisation</span>
            <div className="grid grid-cols-4 gap-1.5">
              {allowedKinds.map((kind) => {
                const meta = KIND_META[kind];
                const active = widget.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    title={meta.label}
                    aria-label={meta.label}
                    aria-pressed={active}
                    onClick={() => patch({ kind })}
                    className={cx(
                      'grid h-9 place-items-center rounded-lg border transition-colors',
                      active
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                    )}
                  >
                    <Icon name={meta.icon} size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Size */}
        <div className="grid grid-cols-2 gap-2">
          <Row label={`Width (${widget.span}/12)`}>
            <Stepper
              value={widget.span}
              min={1}
              max={GRID_COLS}
              onChange={(span) => patch({ span })}
            />
          </Row>
          <Row label="Height">
            <Stepper value={widget.rows} min={1} max={24} onChange={(rows) => patch({ rows })} />
          </Row>
        </div>

        {/* Data options */}
        {isData && (
          <>
            <div className="space-y-1.5 rounded-lg border border-hairline p-2.5">
              <label className="flex items-center justify-between text-xs text-ink">
                Filled tile
                <input
                  type="checkbox"
                  checked={!!widget.filled}
                  onChange={(event) => patch({ filled: event.target.checked })}
                />
              </label>
              {!metric?.signed && (
                <label className="flex items-center justify-between text-xs text-ink">
                  Show period change
                  <input
                    type="checkbox"
                    checked={!!widget.compare}
                    onChange={(event) => patch({ compare: event.target.checked })}
                  />
                </label>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-2xs font-medium text-ink-secondary">Series colour</span>
              <div className="flex gap-1.5">
                {(['accent', 0, 1, 2] as const).map((slot) => {
                  const active = (widget.colorSlot ?? 'accent') === slot;
                  // The first swatch is the *report* accent, not the app's UI
                  // accent — that is what the widget will actually be drawn in.
                  const swatch =
                    slot === 'accent'
                      ? accentMeta(state.doc.accent).base
                      : `var(--series-${(slot as number) + 1})`;
                  return (
                    <button
                      key={String(slot)}
                      type="button"
                      aria-label={slot === 'accent' ? 'Report accent' : `Series slot ${Number(slot) + 1}`}
                      aria-pressed={active}
                      onClick={() => patch({ colorSlot: slot })}
                      className={cx(
                        'h-8 flex-1 rounded-lg border-2 transition-colors',
                        active ? 'border-accent' : 'border-transparent',
                      )}
                      style={{ background: swatch }}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}

        {widget.kind === 'table' && (
          <Row label="Rows shown">
            <Stepper
              value={widget.limit ?? 10}
              min={3}
              max={50}
              onChange={(limit) => patch({ limit })}
            />
          </Row>
        )}

        {/* Content-block options */}
        {widget.kind === 'heading' && (
          <>
            <Row label="Heading text">
              <input
                value={widget.text ?? ''}
                onChange={(event) => patch({ text: event.target.value })}
                className={inputClass}
              />
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <Row label="Level">
                <select
                  value={widget.level ?? 1}
                  onChange={(event) => patch({ level: Number(event.target.value) as 1 | 2 | 3 })}
                  className={cx(inputClass, 'pr-8')}
                >
                  <option value={1}>Large</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Small</option>
                </select>
              </Row>
              <Row label="Align">
                <select
                  value={widget.align ?? 'left'}
                  onChange={(event) => patch({ align: event.target.value as 'left' | 'center' })}
                  className={cx(inputClass, 'pr-8')}
                >
                  <option value="left">Left</option>
                  <option value="center">Centre</option>
                </select>
              </Row>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-hairline p-2.5 text-xs text-ink">
              Filled band
              <input
                type="checkbox"
                checked={!!widget.filled}
                onChange={(event) => patch({ filled: event.target.checked })}
              />
            </label>
          </>
        )}

        {widget.kind === 'text' && (
          <Row label="Text">
            <textarea
              value={widget.text ?? ''}
              onChange={(event) => patch({ text: event.target.value })}
              rows={6}
              placeholder="Commentary for this section…"
              className="w-full rounded-lg border border-hairline bg-surface-raised px-2.5 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </Row>
        )}

        {widget.kind === 'image' && (
          <>
            <Row label="Image URL">
              <input
                value={widget.src ?? ''}
                onChange={(event) => patch({ src: event.target.value })}
                className={inputClass}
              />
            </Row>
            <Row label="Alt text">
              <input
                value={widget.alt ?? ''}
                onChange={(event) => patch({ alt: event.target.value })}
                className={inputClass}
              />
            </Row>
          </>
        )}

        {/* Section options, reachable from the selected widget */}
        <div className="space-y-2 rounded-lg border border-hairline p-2.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Section
          </p>
          <Row label={`Section width (${section.span}/12)`}>
            <Stepper
              value={section.span}
              min={2}
              max={GRID_COLS}
              onChange={(span) =>
                dispatch({ type: 'updateSection', sectionId: section.id, patch: { span } })
              }
            />
          </Row>
          <Row label="Band colour">
            <select
              value={section.tone}
              onChange={(event) =>
                dispatch({
                  type: 'updateSection',
                  sectionId: section.id,
                  patch: { tone: event.target.value as typeof section.tone },
                })
              }
              className={cx(inputClass, 'pr-8')}
            >
              <option value="ink">Charcoal</option>
              <option value="accent">Report accent</option>
              <option value="blue">Blue</option>
              <option value="aqua">Aqua</option>
              <option value="orange">Orange</option>
              <option value="rose">Rose</option>
              <option value="plain">No band</option>
            </select>
          </Row>
        </div>

        <div className="flex gap-2 border-t border-hairline pt-3">
          <Button
            size="sm"
            variant="secondary"
            icon="copy"
            className="flex-1"
            onClick={() =>
              dispatch({ type: 'duplicateWidget', sectionId: section.id, widgetId: widget.id })
            }
          >
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            className="flex-1"
            onClick={() =>
              dispatch({ type: 'removeWidget', sectionId: section.id, widgetId: widget.id })
            }
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
