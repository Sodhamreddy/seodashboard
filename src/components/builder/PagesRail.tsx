'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { emptyPage } from '@/lib/builder/templates';
import { newId } from '@/lib/builder/types';
import { useActivePage, useBuilder } from './store';

/**
 * Left rail: the dashboards in this report, and the sections inside the active
 * one. Sections can be reordered here as well as on the canvas — a keyboard-only
 * path to the same edit, since drag is not one.
 */
export function PagesRail() {
  const { state, dispatch } = useBuilder();
  const page = useActivePage();
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <button
        type="button"
        onClick={() => dispatch({ type: 'addPage', page: emptyPage(`Dashboard ${state.doc.pages.length + 1}`) })}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        <Icon name="plus" size={16} />
        Add dashboard
      </button>

      <ul className="space-y-1.5">
        {state.doc.pages.map((candidate) => {
          const active = candidate.id === page?.id;
          return (
            <li key={candidate.id}>
              <div
                className={cx(
                  'group/page flex items-center gap-1.5 rounded-xl border px-2.5 py-2.5 transition-colors',
                  active
                    ? 'border-transparent bg-accent-soft'
                    : 'border-hairline hover:bg-surface-sunken',
                )}
              >
                <Icon
                  name="doc"
                  size={15}
                  className={active ? 'shrink-0 text-accent' : 'shrink-0 text-ink-muted'}
                />

                {renaming === candidate.id ? (
                  <input
                    autoFocus
                    defaultValue={candidate.title}
                    onBlur={(event) => {
                      dispatch({
                        type: 'updatePage',
                        pageId: candidate.id,
                        patch: { title: event.target.value || 'Untitled Dashboard' },
                      });
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                      if (event.key === 'Escape') setRenaming(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-hairline bg-surface px-1.5 py-0.5 text-sm text-ink outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'setActivePage', pageId: candidate.id })}
                    onDoubleClick={() => setRenaming(candidate.id)}
                    className={cx(
                      'min-w-0 flex-1 truncate text-left text-sm font-medium',
                      active ? 'text-accent' : 'text-ink',
                    )}
                  >
                    {candidate.title}
                  </button>
                )}

                <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/page:opacity-100">
                  <RailButton
                    icon="pencil"
                    title="Rename dashboard"
                    onClick={() => setRenaming(candidate.id)}
                  />
                  <RailButton
                    icon="copy"
                    title="Duplicate dashboard"
                    onClick={() => dispatch({ type: 'duplicatePage', pageId: candidate.id })}
                  />
                  <RailButton
                    icon="trash"
                    title="Delete dashboard"
                    disabled={state.doc.pages.length <= 1}
                    onClick={() => dispatch({ type: 'removePage', pageId: candidate.id })}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
            Sections
          </h3>
          <button
            type="button"
            title="Add section"
            aria-label="Add section"
            onClick={() =>
              dispatch({
                type: 'addSection',
                section: {
                  id: newId('s'),
                  title: 'Untitled Section',
                  span: 12,
                  banner: true,
                  tone: 'ink',
                  widgets: [],
                },
              })
            }
            className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        <ul className="space-y-1">
          {(page?.sections ?? []).map((section, index) => (
            <li
              key={section.id}
              className="group/sec flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
            >
              <Icon name="drag" size={13} className="shrink-0 text-ink-muted" />
              <button
                type="button"
                onClick={() => {
                  document
                    .querySelector(`[data-section-grid="${section.id}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="min-w-0 flex-1 truncate text-left text-xs text-ink-secondary hover:text-ink"
              >
                {section.title}
              </button>
              <span className="shrink-0 text-2xs tnum text-ink-muted">{section.widgets.length}</span>
              <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/sec:opacity-100">
                <RailButton
                  icon="arrowUp"
                  title="Move section up"
                  disabled={index === 0}
                  onClick={() =>
                    dispatch({ type: 'moveSection', sectionId: section.id, toIndex: index - 1 })
                  }
                />
                <RailButton
                  icon="arrowDown"
                  title="Move section down"
                  disabled={index === (page?.sections.length ?? 0) - 1}
                  onClick={() =>
                    dispatch({ type: 'moveSection', sectionId: section.id, toIndex: index + 1 })
                  }
                />
                <RailButton
                  icon="trash"
                  title="Delete section"
                  onClick={() => dispatch({ type: 'removeSection', sectionId: section.id })}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RailButton({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="grid h-6 w-6 place-items-center rounded-md text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-30"
    >
      <Icon name={icon} size={12} />
    </button>
  );
}
