'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { NAV_ITEMS, type NavItem } from '@/lib/nav';

/**
 * Jump to any tool by typing.
 *
 * Seventeen destinations do not fit a list you scan comfortably, and the
 * answer to that is not a smaller font — it is not having to read the list.
 * Once someone knows the tool they want, a keystroke and three letters beats
 * finding the right row in the rail every time, which is what lets the groups
 * in the sidebar stay collapsed by default.
 *
 * Matching runs over the label, the group and the one-line blurb, so "spend"
 * finds Google Ads and "toxic" finds the backlink tracker without either word
 * being in the tool's name.
 */

export const OPEN_PALETTE_EVENT = 'sitepilot:open-palette';

/** Settings is a real destination but deliberately not in NAV_ITEMS. */
const EXTRA: NavItem[] = [
  {
    href: '/settings',
    label: 'Settings',
    icon: 'settings',
    group: 'Account',
    blurb: 'Client integrations, Google connection and provider keys.',
    tone: 'blue',
    mode: 'real',
  },
];

function score(item: NavItem, needle: string) {
  const label = item.label.toLowerCase();
  if (label === needle) return 0;
  if (label.startsWith(needle)) return 1;
  if (label.includes(needle)) return 2;
  if (item.group.toLowerCase().includes(needle)) return 3;
  if (item.blurb.toLowerCase().includes(needle)) return 4;
  return -1;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const all = useMemo(() => [...NAV_ITEMS, ...EXTRA], []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all
      .map((item) => ({ item, rank: score(item, needle) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.item);
  }, [all, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setCursor(0);
  }, []);

  const go = useCallback(
    (item: NavItem) => {
      close();
      router.push(item.href);
    },
    [close, router],
  );

  // Ctrl/Cmd+K from anywhere, plus the sidebar button's event.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The highlighted row follows the filter rather than pointing at a row the
  // new results no longer have.
  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  if (!open) return null;

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (results.length ? (current + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = results[cursor];
      if (target) go(target);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-[color:rgba(11,13,21,0.45)] p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Jump to a tool"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-hairline bg-surface-raised shadow-lift">
        <div className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-3">
          <Icon name="search" size={15} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a tool, or search what it does…"
            aria-label="Search tools"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="shrink-0 rounded border border-hairline bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
            esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-ink-muted">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {results.map((item, index) => {
              const active = index === cursor;
              return (
                <li key={item.href}>
                  <button
                    type="button"
                    data-active={active}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(item)}
                    className={cx(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                      active ? 'bg-accent-soft' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx('tile h-7 w-7 shrink-0', `tile-${item.tone}`)}
                    >
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx(
                          'block truncate text-xs font-medium',
                          active ? 'text-accent' : 'text-ink',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="block truncate text-2xs text-ink-muted">{item.blurb}</span>
                    </span>
                    <span className="shrink-0 font-mono text-2xs text-ink-muted">{item.group}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-3 border-t border-hairline bg-surface-sunken px-3.5 py-2 font-mono text-2xs text-ink-muted">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span className="ml-auto">{results.length} of {all.length}</span>
        </div>
      </div>
    </div>
  );
}
