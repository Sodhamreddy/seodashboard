'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { metricById } from '@/lib/builder/catalog';
import { formatFor, labelFor } from '@/lib/builder/data';
import { GRID_GAP, ROW_PX, isDataKind, type Widget } from '@/lib/builder/types';
import { clearDragPayload, DRAG_MIME, setDragPayload } from './dnd';
import { useBuilder, useMetricLookup } from './store';
import { WidgetBody } from './widgets/WidgetBody';

/**
 * The card around a widget: chrome, selection, drag handle, resize grip.
 *
 * Height is derived (`rows × ROW_PX` plus the gaps the rows span) rather than
 * stored in pixels, so a report keeps its proportions at any zoom level and the
 * same integers survive export/import.
 */

export function widgetHeight(rows: number) {
  return rows * ROW_PX + (rows - 1) * GRID_GAP;
}

const CHROME_KINDS = ['line', 'area', 'bar', 'donut', 'table'];

export function WidgetShell({
  widget,
  sectionId,
  columnWidth,
  accent,
  preview,
}: {
  widget: Widget;
  sectionId: string;
  /** Measured width of one grid column, for span maths while resizing. */
  columnWidth: number;
  accent: string;
  preview: boolean;
}) {
  const { state, dispatch } = useBuilder();
  const { resolve } = useMetricLookup();
  const [armed, setArmed] = useState(false);
  const resizing = useRef<{ x: number; y: number; span: number; rows: number } | null>(null);

  const selected =
    state.selection?.sectionId === sectionId && state.selection.widgetId === widget.id;
  const compact = state.doc.density === 'compact';

  const value = isDataKind(widget.kind)
    ? resolve(widget.metricId)
    : { state: 'ok' as const };
  const label = widget.title || labelFor(widget.metricId, state.doc.customMetrics);
  const format = formatFor(widget.metricId, state.doc.customMetrics);
  const benchmark = state.doc.benchmarks.find((entry) => entry.metricId === widget.metricId);

  const filled = !!widget.filled && isDataKind(widget.kind);
  const bare = widget.kind === 'divider' || widget.kind === 'spacer' || widget.kind === 'heading';

  const style: CSSProperties = {
    gridColumn: `span ${widget.span} / span ${widget.span}`,
    height: widgetHeight(widget.rows),
    ...(filled ? { background: accent, borderColor: 'transparent' } : {}),
  };

  /* ── Resize ──────────────────────────────────────────────────────── */

  function onResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing.current = { x: event.clientX, y: event.clientY, span: widget.span, rows: widget.rows };
    // One snapshot for the whole gesture: undo returns to the pre-drag size
    // instead of stepping back through every intermediate column.
    dispatch({ type: 'snapshot' });
  }

  function onResizeMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = resizing.current;
    if (!start) return;
    const step = columnWidth + GRID_GAP;
    const spanDelta = step > 0 ? Math.round((event.clientX - start.x) / step) : 0;
    const rowDelta = Math.round((event.clientY - start.y) / (ROW_PX + GRID_GAP));
    const span = Math.min(12, Math.max(1, start.span + spanDelta));
    const rows = Math.min(24, Math.max(1, start.rows + rowDelta));
    if (span === widget.span && rows === widget.rows) return;
    dispatch({
      type: 'updateWidget',
      sectionId,
      widgetId: widget.id,
      patch: { span, rows },
      history: false,
    });
  }

  function onResizeEnd() {
    resizing.current = null;
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  const showChrome = CHROME_KINDS.includes(widget.kind) && !!label;

  return (
    <div
      data-widget-id={widget.id}
      draggable={armed && !preview}
      onDragStart={(event) => {
        // The section is also a drag source (for reordering); without this the
        // section handler would overwrite the payload with its own.
        event.stopPropagation();
        setDragPayload({ type: 'move', sectionId, widgetId: widget.id });
        event.dataTransfer.setData(DRAG_MIME, widget.id);
        event.dataTransfer.setData('text/plain', label);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setArmed(false);
        clearDragPayload();
      }}
      onPointerDown={() => {
        // Pressing anywhere on the card arms the native drag, so a widget can be
        // picked up without hunting for the grip. Text blocks are excluded — there
        // `draggable` would make the copy unselectable.
        if (!preview && widget.kind !== 'text') setArmed(true);
      }}
      onClick={(event) => {
        if (preview) return;
        event.stopPropagation();
        // A click means no drag happened (dragstart would have suppressed it), so
        // disarm — a card left permanently draggable blocks selecting table text.
        setArmed(false);
        dispatch({ type: 'select', selection: { sectionId, widgetId: widget.id } });
      }}
      className={cx(
        'group/widget relative min-w-0',
        bare ? 'rounded-lg' : 'surface-card rounded-card border border-hairline',
        !bare && (compact ? 'p-2.5' : 'p-3.5'),
        !preview && 'transition-shadow',
        selected && 'ring-2 ring-[color:var(--accent)] ring-offset-2 ring-offset-[color:var(--plane)]',
      )}
      style={style}
    >
      <div className="flex h-full min-h-0 flex-col">
        {showChrome && (
          <header className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
            <h4
              className="truncate text-xs font-semibold text-ink"
              style={filled ? { color: '#fff' } : undefined}
            >
              {label}
            </h4>
            {widget.compare && value.state === 'ok' && metricById(widget.metricId)?.signed && (
              <span className="text-2xs text-ink-muted">net change</span>
            )}
          </header>
        )}

        {/* `data-widget-body` is the print stylesheet's clipping hook — see the
            chart-rescale block in globals.css. */}
        <div data-widget-body className="min-h-0 flex-1">
          <WidgetBody
            widget={widget}
            value={value}
            label={label}
            format={format}
            accent={accent}
            benchmark={benchmark}
            compact={compact}
          />
        </div>
      </div>

      {!preview && (
        <>
          {/* Hover toolbar sits inside the card so nothing clips at the edges. */}
          <div
            className={cx(
              'absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-lg border border-hairline bg-surface-raised/95 p-0.5 shadow-card backdrop-blur',
              'opacity-0 transition-opacity focus-within:opacity-100 group-hover/widget:opacity-100',
              selected && 'opacity-100',
            )}
          >
            <button
              type="button"
              title="Drag to move"
              aria-label="Drag to move widget"
              onPointerDown={() => setArmed(true)}
              className="grid h-6 w-6 cursor-grab place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <Icon name="drag" size={13} />
            </button>
            <button
              type="button"
              title="Widget settings"
              aria-label="Widget settings"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'select', selection: { sectionId, widgetId: widget.id } });
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <Icon name="sliders" size={13} />
            </button>
            <button
              type="button"
              title="Duplicate"
              aria-label="Duplicate widget"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'duplicateWidget', sectionId, widgetId: widget.id });
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <Icon name="copy" size={13} />
            </button>
            <button
              type="button"
              title="Delete"
              aria-label="Delete widget"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: 'removeWidget', sectionId, widgetId: widget.id });
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-tint-critical hover:text-status-critical"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>

          <button
            type="button"
            aria-label={`Resize widget — currently ${widget.span} of 12 columns`}
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            className={cx(
              'absolute -bottom-1 -right-1 z-10 grid h-5 w-5 cursor-nwse-resize place-items-center rounded-md border border-hairline bg-surface-raised text-ink-muted',
              'opacity-0 transition-opacity group-hover/widget:opacity-100',
              selected && 'opacity-100',
            )}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
              <path d="M8 1v7H1" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
