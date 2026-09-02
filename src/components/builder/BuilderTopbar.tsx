'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ClientPicker } from './ClientPicker';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import { downloadDoc, loadRevisions, pushRevision, readDocFile, type Revision } from '@/lib/builder/persist';
import { starterDoc } from '@/lib/builder/templates';
import { ACCENTS, RANGES, type AccentKey, type RangeKey } from '@/lib/builder/types';
import { relativeTime } from '@/lib/format';
import { useBuilder } from './store';

/**
 * The editor's own top bar. It replaces the app shell's chrome entirely — a
 * report builder is a full-screen mode, and the close button is what returns to
 * the dashboard.
 */

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-hairline" />;
}

function BarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  title,
}: {
  icon: IconName;
  label?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active}
      className={cx(
        'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-transparent bg-accent-soft text-accent'
          : 'border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink',
      )}
    >
      <Icon name={icon} size={15} />
      {label && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}

/** Click-outside popover used by the date, theme, setup and history menus. */
function Popover({
  open,
  onClose,
  children,
  align = 'right',
  width = 280,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{ width }}
      className={cx(
        'absolute top-11 z-50 rounded-xl border border-hairline bg-surface-raised p-3 shadow-lift',
        align === 'right' ? 'right-0' : 'left-0',
      )}
    >
      {children}
    </div>
  );
}

export function BuilderTopbar() {
  const { state, dispatch } = useBuilder();
  const { doc } = state;

  const [menu, setMenu] = useState<
    'range' | 'theme' | 'setup' | 'export' | 'history' | 'help' | null
  >(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => setMenu(null);
  const toggle = (next: typeof menu) => setMenu((current) => (current === next ? null : next));

  const saveLabel =
    state.saveState === 'saving'
      ? 'Saving…'
      : state.saveState === 'error'
        ? 'Not saved'
        : 'Auto saved';

  return (
    <header className="relative z-40 flex shrink-0 flex-col border-b border-hairline bg-[color:var(--topbar-bg)] backdrop-blur-xl">
      {/* Row 1 — identity */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <input
          value={doc.name}
          onChange={(event) => dispatch({ type: 'patchDoc', patch: { name: event.target.value } })}
          aria-label="Report name"
          className="min-w-0 max-w-[280px] flex-none rounded-lg bg-transparent px-1 text-lg font-semibold tracking-[-0.02em] text-ink outline-none hover:bg-surface-sunken focus:bg-surface-sunken"
        />

        <span className="h-6 w-px bg-hairline" />

        <ClientPicker accent={doc.accent} />

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cx(
              'hidden items-center gap-1.5 text-2xs sm:flex',
              state.saveState === 'error' ? 'text-status-critical' : 'text-ink-muted',
            )}
          >
            <Icon name="cloud" size={13} />
            {saveLabel}
          </span>
          {/* An unlabelled × read as "discard", not "go back". The exit is
              labelled now; autosave means leaving loses nothing. */}
          <Link
            href="/dashboard"
            title="Return to the dashboard Overview"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent-soft px-3 text-xs font-semibold text-accent shadow-card transition-shadow hover:shadow-lift"
          >
            <Icon name="chevronLeft" size={14} />
            <span className="hidden sm:inline">Return to Overview</span>
            <span className="sm:hidden">Overview</span>
          </Link>
        </div>
      </div>

      {/* Row 2 — tools */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
        {/* Data mode */}
        <div role="group" aria-label="Data mode" className="flex rounded-lg border border-hairline p-0.5">
          {(['live', 'sample'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch({ type: 'patchDoc', patch: { dataMode: mode } })}
              aria-pressed={doc.dataMode === mode}
              className={cx(
                'h-8 rounded-md px-3 text-xs font-medium capitalize transition-colors',
                doc.dataMode === mode
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {mode === 'live' ? 'Live Data' : 'Sample Data'}
            </button>
          ))}
        </div>

        <Divider />

        <BarButton
          icon="undo"
          title="Undo (Ctrl+Z)"
          onClick={() => dispatch({ type: 'undo' })}
          disabled={state.past.length === 0}
        />
        <BarButton
          icon="redo"
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => dispatch({ type: 'redo' })}
          disabled={state.future.length === 0}
        />

        <Divider />

        <div role="group" aria-label="Viewport" className="flex rounded-lg border border-hairline p-0.5">
          {([
            ['desktop', 'desktop'],
            ['mobile', 'mobile'],
          ] as const).map(([viewport, icon]) => (
            <button
              key={viewport}
              type="button"
              onClick={() => dispatch({ type: 'setViewport', viewport })}
              aria-pressed={state.viewport === viewport}
              title={`${viewport} preview`}
              className={cx(
                'grid h-8 w-9 place-items-center rounded-md transition-colors',
                state.viewport === viewport
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              <Icon name={icon} size={15} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {/* Page setup */}
          <div className="relative">
            <BarButton icon="grid" label="Page Setup" onClick={() => toggle('setup')} active={menu === 'setup'} />
            <Popover open={menu === 'setup'} onClose={close} width={300}>
              <p className="mb-2 text-xs font-semibold text-ink">Page setup</p>
              <label className="mb-2 flex items-center justify-between text-xs text-ink-secondary">
                Paper size
                <select
                  value={doc.pageSetup.size}
                  onChange={(event) =>
                    dispatch({
                      type: 'patchDoc',
                      patch: { pageSetup: { ...doc.pageSetup, size: event.target.value as 'letter' | 'a4' } },
                    })
                  }
                  className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink"
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
              </label>
              <label className="mb-2 flex items-center justify-between text-xs text-ink-secondary">
                Orientation
                <select
                  value={doc.pageSetup.orientation}
                  onChange={(event) =>
                    dispatch({
                      type: 'patchDoc',
                      patch: {
                        pageSetup: {
                          ...doc.pageSetup,
                          orientation: event.target.value as 'portrait' | 'landscape',
                        },
                      },
                    })
                  }
                  className="h-8 rounded-lg border border-hairline bg-surface px-2 text-xs text-ink"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              <label className="mb-1.5 flex items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={doc.pageSetup.showHeader}
                  onChange={(event) =>
                    dispatch({
                      type: 'patchDoc',
                      patch: { pageSetup: { ...doc.pageSetup, showHeader: event.target.checked } },
                    })
                  }
                />
                Show report header
              </label>
              <label className="mb-2 flex items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={doc.pageSetup.showFooter}
                  onChange={(event) =>
                    dispatch({
                      type: 'patchDoc',
                      patch: { pageSetup: { ...doc.pageSetup, showFooter: event.target.checked } },
                    })
                  }
                />
                Show footer
              </label>
              <input
                value={doc.pageSetup.footerText}
                onChange={(event) =>
                  dispatch({
                    type: 'patchDoc',
                    patch: { pageSetup: { ...doc.pageSetup, footerText: event.target.value } },
                  })
                }
                placeholder="Footer text"
                className="h-8 w-full rounded-lg border border-hairline bg-surface px-2 text-xs text-ink"
              />
              <p className="mt-3 border-t border-hairline pt-2.5 text-2xs leading-relaxed text-ink-muted">
                Paper size and orientation apply when this report is printed or saved as PDF.
                Those actions live in the <span className="font-medium text-ink-secondary">Export</span>{' '}
                menu.
              </p>
            </Popover>
          </div>

          {/* Export — its own menu, because this is what people come looking
              for. It used to be two secondary buttons at the bottom of Page
              Setup, where `bg-surface-raised` on a `bg-surface-raised` popover
              made them all but invisible. */}
          <div className="relative">
            <BarButton
              icon="download"
              label="Export"
              onClick={() => toggle('export')}
              active={menu === 'export'}
            />
            <Popover open={menu === 'export'} onClose={close} width={288}>
              <p className="mb-2 text-xs font-semibold text-ink">Export report</p>

              <button
                type="button"
                onClick={() => {
                  close();
                  // Leaving preview first: the editor chrome is print-hidden by
                  // CSS, but widget selection outlines are not.
                  dispatch({ type: 'setPreview', preview: true });
                  window.setTimeout(() => window.print(), 120);
                }}
                className="flex w-full items-start gap-2.5 rounded-lg bg-accent px-2.5 py-2 text-left text-white transition-opacity hover:opacity-90"
              >
                <Icon name="printer" size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">Save as PDF</span>
                  <span className="block text-2xs leading-relaxed opacity-85">
                    Opens the print dialog — choose &ldquo;Save as PDF&rdquo;
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  close();
                  downloadDoc(doc);
                }}
                className="mt-1.5 flex w-full items-start gap-2.5 rounded-lg border border-hairline bg-surface px-2.5 py-2 text-left text-ink transition-colors hover:bg-surface-sunken"
              >
                <Icon name="doc" size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">Download report file</span>
                  <span className="block text-2xs leading-relaxed text-ink-muted">
                    A .report.json layout you can re-import — not a document
                  </span>
                </span>
              </button>

              <p className="mt-2 border-t border-hairline pt-2 text-2xs leading-relaxed text-ink-muted">
                Currently {doc.pageSetup.size === 'a4' ? 'A4' : 'Letter'},{' '}
                {doc.pageSetup.orientation}. Change that in Page Setup.
              </p>
            </Popover>
          </div>

          {/* Theme */}
          <div className="relative">
            <BarButton icon="palette" label="Theme" onClick={() => toggle('theme')} active={menu === 'theme'} />
            <Popover open={menu === 'theme'} onClose={close} width={272}>
              <p className="mb-2 text-xs font-semibold text-ink">Report accent</p>
              <div className="grid grid-cols-3 gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.key}
                    type="button"
                    onClick={() => dispatch({ type: 'patchDoc', patch: { accent: accent.key as AccentKey } })}
                    className={cx(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2 text-2xs',
                      doc.accent === accent.key
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-5 w-full rounded"
                      style={{ background: accent.base }}
                    />
                    {accent.label}
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-3 text-xs font-semibold text-ink">Density</p>
              <div className="flex rounded-lg border border-hairline p-0.5">
                {(['comfortable', 'compact'] as const).map((density) => (
                  <button
                    key={density}
                    type="button"
                    onClick={() => dispatch({ type: 'patchDoc', patch: { density } })}
                    className={cx(
                      'h-8 flex-1 rounded-md text-xs font-medium capitalize',
                      doc.density === density ? 'bg-accent-soft text-accent' : 'text-ink-muted',
                    )}
                  >
                    {density}
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-2xs leading-relaxed text-ink-muted">
                The accent styles report chrome and filled tiles. Chart series keep the validated
                palette so the two never get confused.
              </p>
            </Popover>
          </div>

          {/* Date range */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle('range')}
              className={cx(
                'flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium',
                menu === 'range'
                  ? 'border-transparent bg-accent-soft text-accent'
                  : 'border-hairline text-ink hover:bg-surface-sunken',
              )}
            >
              <Icon name="calendar" size={15} />
              {RANGES.find((range) => range.key === doc.range)?.label}
              <Icon name="chevronDown" size={13} className="text-ink-muted" />
            </button>
            <Popover open={menu === 'range'} onClose={close} width={220}>
              <ul className="space-y-0.5">
                {RANGES.map((range) => (
                  <li key={range.key}>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'patchDoc', patch: { range: range.key as RangeKey } });
                        close();
                      }}
                      className={cx(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs',
                        doc.range === range.key
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
                      )}
                    >
                      {range.label}
                      {doc.range === range.key && <Icon name="check" size={13} />}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          </div>

          {/* Help */}
          <div className="relative">
            <BarButton icon="info" title="Keyboard shortcuts and tips" onClick={() => toggle('help')} active={menu === 'help'} />
            <Popover open={menu === 'help'} onClose={close} width={300}>
              <p className="mb-2 text-xs font-semibold text-ink">Editing</p>
              <ul className="space-y-1.5 text-2xs leading-relaxed text-ink-secondary">
                <li>Click a metric in the right rail to add it, or drag it onto a section.</li>
                <li>Drag a widget by its grip; drop between cards to reorder.</li>
                <li>Drag the corner grip to resize — columns and rows snap to the grid.</li>
                <li>Drag a section band grip to reorder; drag its right edge to change width.</li>
                <li>Double-click a section band to rename it.</li>
                <li className="pt-1 font-medium text-ink">
                  Ctrl+Z undo · Ctrl+Shift+Z redo · Delete removes the selected widget · Esc
                  deselects
                </li>
              </ul>
            </Popover>
          </div>

          {/* Revision history */}
          <div className="relative">
            <BarButton
              icon="history"
              title="Version history"
              active={menu === 'history'}
              onClick={() => {
                setRevisions(loadRevisions());
                toggle('history');
              }}
            />
            <Popover open={menu === 'history'} onClose={close} width={320}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Version history</p>
                <button
                  type="button"
                  onClick={() => setRevisions(pushRevision(doc, `${doc.name} (manual)`))}
                  className="text-2xs font-medium text-accent hover:underline"
                >
                  Save a version
                </button>
              </div>
              {revisions.length === 0 ? (
                <p className="text-2xs text-ink-muted">
                  No versions yet. One is kept automatically every couple of minutes while you edit.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {revisions.map((revision) => (
                    <li key={revision.at}>
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'replaceDoc', doc: revision.doc });
                          close();
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                      >
                        <span className="min-w-0 truncate">{revision.name}</span>
                        <span className="shrink-0 text-2xs text-ink-muted">
                          {relativeTime(revision.at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 space-y-2 border-t border-hairline pt-3">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                >
                  <Icon name="upload" size={14} /> Import a report JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({ type: 'replaceDoc', doc: starterDoc(doc.client) });
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                >
                  <Icon name="refresh" size={14} /> Reset to the starter layout
                </button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const imported = await readDocFile(file);
                  if (imported) dispatch({ type: 'replaceDoc', doc: imported });
                  event.target.value = '';
                  close();
                }}
              />
            </Popover>
          </div>

          <Button
            size="sm"
            variant={state.preview ? 'secondary' : 'primary'}
            icon={state.preview ? 'pencil' : 'play'}
            onClick={() => dispatch({ type: 'setPreview', preview: !state.preview })}
          >
            {state.preview ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>
    </header>
  );
}
