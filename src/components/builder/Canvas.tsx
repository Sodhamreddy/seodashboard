'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { GRID_COLS, GRID_GAP, accentMeta, newId, rangeMeta, type Section } from '@/lib/builder/types';
import { clearDragPayload, DRAG_MIME, getDragPayload, setDragPayload } from './dnd';
import { useActivePage, useBuilder } from './store';
import { WidgetShell } from './WidgetShell';

/**
 * The canvas: a fixed-width report page holding a two-level grid.
 *
 * Zoom uses the CSS `zoom` property rather than a transform, deliberately: `zoom`
 * participates in layout, so the scroll container keeps working at 150% instead
 * of clipping the page the way a scaled transform would.
 */

/**
 * The desktop page is fluid up to a report-sized maximum rather than a fixed
 * width: with both rails open the canvas is often narrower than 1180px, and a
 * fixed page would simply disappear behind the library instead of fitting.
 */
const PAGE_MAX_WIDTH = 1180;
const MOBILE_WIDTH = 430;

function bandStyle(tone: Section['tone'], accent: string): CSSProperties {
  switch (tone) {
    case 'accent':
      return { background: accent, color: '#fff' };
    case 'blue':
      return { background: 'var(--series-1)', color: '#fff' };
    case 'aqua':
      return { background: 'var(--series-3)', color: '#fff' };
    case 'orange':
      return { background: 'var(--series-2)', color: '#fff' };
    case 'rose':
      return { background: 'var(--div-neg)', color: '#fff' };
    case 'plain':
      return { background: 'transparent', color: 'var(--text-primary)' };
    default:
      return { background: 'var(--band-ink)', color: '#fff' };
  }
}

/* ── Section ───────────────────────────────────────────────────────── */

function SectionBlock({
  section,
  index,
  accent,
  preview,
  forceFullWidth,
}: {
  section: Section;
  index: number;
  accent: string;
  preview: boolean;
  /** The mobile viewport stacks every section to full width. */
  forceFullWidth: boolean;
}) {
  const { state, dispatch } = useBuilder();
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const sectionResize = useRef<{ x: number; span: number; pageColumn: number } | null>(null);

  // One column's width drives widget resize maths. It changes with the section's
  // own span, the viewport and the zoom level, so it is measured, not computed.
  useLayoutEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    const measure = () => {
      const width = element.clientWidth;
      setColumnWidth((width - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [section.span, state.viewport, state.zoom]);

  const span = forceFullWidth ? GRID_COLS : section.span;

  /** Insertion index from the pointer: nearest card centre, then which side. */
  function indexFromPointer(clientX: number, clientY: number) {
    const container = gridRef.current;
    if (!container) return section.widgets.length;
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-widget-id]'),
    );
    if (!cards.length) return 0;

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let after = false;

    cards.forEach((card, cardIndex) => {
      const rect = card.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;
      const distance = (clientX - centreX) ** 2 + (clientY - centreY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = cardIndex;
        after = clientX > centreX;
      }
    });

    return after ? bestIndex + 1 : bestIndex;
  }

  function onDragOver(event: React.DragEvent) {
    const payload = getDragPayload();
    if (!payload || payload.type === 'section') return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = payload.type === 'move' ? 'move' : 'copy';
    setDropIndex(indexFromPointer(event.clientX, event.clientY));
  }

  function onDrop(event: React.DragEvent) {
    const payload = getDragPayload();
    if (!payload || payload.type === 'section') return;
    event.preventDefault();
    event.stopPropagation();
    const target = dropIndex ?? indexFromPointer(event.clientX, event.clientY);
    setDropIndex(null);

    if (payload.type === 'new') {
      dispatch({
        type: 'addWidget',
        sectionId: section.id,
        widget: { ...payload.widget, id: newId('w') },
        index: target,
        scaleToSection: true,
      });
    } else {
      dispatch({
        type: 'moveWidget',
        from: { sectionId: payload.sectionId, widgetId: payload.widgetId },
        to: { sectionId: section.id, index: target },
      });
    }
    clearDragPayload();
  }

  /* Section reordering: the band is the drag handle and the drop target. */
  function onSectionDragOver(event: React.DragEvent) {
    const payload = getDragPayload();
    if (payload?.type !== 'section' || payload.sectionId === section.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function onSectionDrop(event: React.DragEvent) {
    const payload = getDragPayload();
    if (payload?.type !== 'section' || payload.sectionId === section.id) return;
    event.preventDefault();
    dispatch({ type: 'moveSection', sectionId: payload.sectionId, toIndex: index });
    clearDragPayload();
  }

  function onSectionResizeStart(event: React.PointerEvent<HTMLButtonElement>) {
    const page = gridRef.current?.closest<HTMLElement>('[data-page-grid]');
    if (!page) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pageColumn = (page.clientWidth - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS;
    sectionResize.current = { x: event.clientX, span: section.span, pageColumn };
    dispatch({ type: 'snapshot' });
  }

  function onSectionResizeMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = sectionResize.current;
    if (!start) return;
    const step = start.pageColumn + GRID_GAP;
    const next = Math.min(
      GRID_COLS,
      Math.max(2, start.span + Math.round((event.clientX - start.x) / step)),
    );
    if (next === section.span) return;
    dispatch({ type: 'updateSection', sectionId: section.id, patch: { span: next }, history: false });
  }

  return (
    <section
      className="group/section relative min-w-0"
      style={{ gridColumn: `span ${span} / span ${span}` }}
      onDragOver={onSectionDragOver}
      onDrop={onSectionDrop}
      onDragStart={(event) => {
        // Only the band grip arms this; a widget drag stops propagation first.
        setDragPayload({ type: 'section', sectionId: section.id });
        event.dataTransfer.setData(DRAG_MIME, section.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={(event) => {
        (event.currentTarget as HTMLElement).removeAttribute('draggable');
        clearDragPayload();
      }}
    >
      {section.banner && (
        <header
          className="relative mb-3 flex items-center gap-2 rounded-xl px-4 py-2.5"
          style={bandStyle(section.tone, accent)}
          onDoubleClick={() => !preview && setRenaming(true)}
        >
          {renaming && !preview ? (
            <input
              autoFocus
              defaultValue={section.title}
              onBlur={(event) => {
                dispatch({
                  type: 'updateSection',
                  sectionId: section.id,
                  patch: { title: event.target.value || 'Untitled Section' },
                });
                setRenaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                if (event.key === 'Escape') setRenaming(false);
              }}
              className="w-full rounded-md bg-black/20 px-2 py-1 text-lg font-semibold text-white outline-none ring-1 ring-white/40"
            />
          ) : (
            <h3 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.02em]">
              {section.title}
            </h3>
          )}

          {!preview && (
            // Zero-width until hovered rather than merely transparent: a
            // four-column band is only ~300px wide, so seven reserved-but-invisible
            // buttons would truncate the title permanently. Staying in flow (rather
            // than overlaying) keeps the band itself hoverable and clickable.
            <div className="flex w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity focus-within:w-auto focus-within:opacity-100 group-hover/section:w-auto group-hover/section:opacity-100">
              <span className="mr-1 rounded-md bg-black/20 px-1.5 py-0.5 text-2xs font-medium tnum">
                {section.span}/12
              </span>
              <BandButton
                icon="drag"
                title="Drag to reorder section"
                onPointerDown={(event) => {
                  // Arming the parent element is what lets a click-and-hold on this
                  // grip start a native drag of the whole section.
                  const host = (event.currentTarget as HTMLElement).closest('section');
                  if (host) host.setAttribute('draggable', 'true');
                }}
              />
              <BandButton
                icon="pencil"
                title="Rename section"
                onClick={() => setRenaming(true)}
              />
              <BandButton
                icon={section.collapsed ? 'chevronRight' : 'chevronDown'}
                title={section.collapsed ? 'Expand section' : 'Collapse section'}
                onClick={() =>
                  dispatch({
                    type: 'updateSection',
                    sectionId: section.id,
                    patch: { collapsed: !section.collapsed },
                  })
                }
              />
              <BandButton
                icon="copy"
                title="Duplicate section"
                onClick={() => dispatch({ type: 'duplicateSection', sectionId: section.id })}
              />
              <BandButton
                icon="trash"
                title="Delete section"
                onClick={() => dispatch({ type: 'removeSection', sectionId: section.id })}
              />
            </div>
          )}
        </header>
      )}

      {!section.collapsed && (
        <div
          ref={gridRef}
          data-section-grid={section.id}
          onDragOver={onDragOver}
          onDragLeave={() => setDropIndex(null)}
          onDrop={onDrop}
          className={cx(
            'grid items-start',
            dropIndex !== null && 'rounded-xl outline-dashed outline-2 outline-offset-4 outline-[color:var(--accent)]',
          )}
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gap: GRID_GAP,
          }}
        >
          {section.widgets.map((widget, widgetIndex) => (
            <Fragment key={widget.id}>
              {dropIndex === widgetIndex && <DropSlot />}
              <WidgetShell
                widget={widget}
                sectionId={section.id}
                columnWidth={columnWidth}
                accent={accent}
                preview={preview}
              />
            </Fragment>
          ))}
          {dropIndex !== null && dropIndex >= section.widgets.length && <DropSlot />}

          {section.widgets.length === 0 && dropIndex === null && (
            <div
              className="col-span-12 grid place-items-center rounded-xl border border-dashed border-hairline py-8 text-center"
              style={{ minHeight: 96 }}
            >
              <div>
                <Icon name="plus" size={16} className="mx-auto text-ink-muted" />
                <p className="mt-1 text-xs text-ink-secondary">
                  {preview ? 'Empty section' : 'Drag a metric here, or click one in the library'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right-edge grip: changes how many page columns the section occupies. */}
      {!preview && !forceFullWidth && (
        <button
          type="button"
          aria-label={`Resize section — currently ${section.span} of 12 columns`}
          onPointerDown={onSectionResizeStart}
          onPointerMove={onSectionResizeMove}
          onPointerUp={() => {
            sectionResize.current = null;
          }}
          className="absolute -right-1.5 top-0 z-10 h-9 w-3 cursor-ew-resize rounded-full opacity-0 transition-opacity group-hover/section:opacity-100"
          style={{ background: 'var(--accent)' }}
        />
      )}
    </section>
  );
}

function BandButton({
  icon,
  title,
  onClick,
  onPointerDown,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  onClick?: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className="grid h-6 w-6 place-items-center rounded-md opacity-80 hover:bg-black/20 hover:opacity-100"
    >
      <Icon name={icon} size={13} />
    </button>
  );
}

function DropSlot() {
  return (
    <div
      className="rounded-xl border-2 border-dashed"
      style={{
        gridColumn: 'span 2 / span 2',
        height: 64,
        borderColor: 'var(--accent)',
        background: 'var(--accent-soft)',
      }}
    />
  );
}

/* ── Report surface (shared by editor and preview) ──────────────────── */

export function ReportSurface({ preview }: { preview: boolean }) {
  const { state, dispatch } = useBuilder();
  const page = useActivePage();
  const accent = accentMeta(state.doc.accent).base;
  const { doc } = state;
  const mobile = state.viewport === 'mobile';

  return (
    <div
      className="report-page surface-card rounded-card border border-hairline"
      style={{ padding: mobile ? 16 : 28 }}
      onClick={() => dispatch({ type: 'select', selection: null })}
    >
      {doc.pageSetup.showHeader && (
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-hairline pb-4">
          <div className="min-w-0">
            <p className="text-2xs font-medium uppercase tracking-[0.14em]" style={{ color: accent }}>
              {doc.client}
            </p>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em] text-ink">
              {page?.title || doc.name}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-ink">{rangeMeta(doc.range).label}</p>
            <p className="mt-0.5 text-2xs text-ink-muted">
              {doc.dataMode === 'live' ? 'Live data' : 'Sample data'}
            </p>
          </div>
        </header>
      )}

      <div
        data-page-grid
        className="grid items-start"
        style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`, gap: GRID_GAP + 4 }}
      >
        {(page?.sections ?? []).map((section, index) => (
          <SectionBlock
            key={section.id}
            section={section}
            index={index}
            accent={accent}
            preview={preview}
            forceFullWidth={mobile}
          />
        ))}
      </div>

      {doc.pageSetup.showFooter && (
        <footer className="mt-7 flex items-center justify-between border-t border-hairline pt-3 text-2xs text-ink-muted">
          <span className="truncate">{doc.pageSetup.footerText}</span>
          <span className="tnum">
            {(doc.pages.findIndex((candidate) => candidate.id === page?.id) + 1) || 1} /{' '}
            {doc.pages.length}
          </span>
        </footer>
      )}
    </div>
  );
}

/* ── Canvas shell ──────────────────────────────────────────────────── */

export function Canvas() {
  const { state, dispatch } = useBuilder();
  const mobile = state.viewport === 'mobile';

  // Dropping outside any section still has to clean up, or the next dragover
  // reads a stale payload.
  useEffect(() => {
    const clear = () => clearDragPayload();
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  return (
    <div className="relative min-w-0 flex-1 overflow-auto">
      <div className="px-5 py-6 pb-24">
        <div
          className="canvas-page-frame mx-auto"
          style={{
            width: mobile ? MOBILE_WIDTH : '100%',
            maxWidth: mobile ? MOBILE_WIDTH : PAGE_MAX_WIDTH,
            zoom: state.zoom,
          }}
        >
          <ReportSurface preview={state.preview} />
        </div>
      </div>

      {!state.preview && (
        <div
          data-zoom-control
          className="pointer-events-auto sticky bottom-4 left-4 z-20 ml-4 inline-flex w-auto items-center gap-1 rounded-full border border-hairline bg-surface-raised/95 px-2 py-1.5 shadow-lift backdrop-blur"
        >
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom - 0.1 })}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-surface-sunken"
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="w-12 text-center text-xs font-medium tnum text-ink">
            {Math.round(state.zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom + 0.1 })}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-surface-sunken"
          >
            <Icon name="plus" size={14} />
          </button>
          <span className="mx-0.5 h-5 w-px bg-hairline" />
          <button
            type="button"
            aria-label="Reset zoom"
            onClick={() => dispatch({ type: 'setZoom', zoom: 1 })}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-surface-sunken"
          >
            <Icon name="expand" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
