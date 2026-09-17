'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { NAV_GROUPS, NAV_ITEMS } from '@/lib/nav';

/**
 * The same navigation as the rail, along the top.
 *
 * The sidebar collapses to keep seventeen tools from becoming a scroll, which
 * is right for the rail and leaves the horizontal space beside the page title
 * doing nothing. This puts every group up there: one click to open a group,
 * one more to land on a tool, without touching the rail's collapsed state.
 *
 * One shared panel rather than a dropdown per button, anchored to the right
 * edge of the row. Seven individually-positioned menus would each need their
 * own overflow handling against the viewport edge; one panel cannot fall off
 * the screen, and switching groups swaps its contents in place.
 */

/** Long group names lose their suffix up here, where the row has to fit. */
const SHORT_LABEL: Record<string, string> = {
  'On-page tools': 'On-page',
  'Paid media': 'Paid',
};

export function TopNav() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openGroup) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenGroup(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openGroup]);

  // Landing on a page closes the menu that sent you there.
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  const items = openGroup ? NAV_ITEMS.filter((item) => item.group === openGroup) : [];

  return (
    <div ref={rootRef} className="relative hidden min-w-0 xl:block">
      <nav aria-label="Sections" className="flex items-center gap-0.5">
        {NAV_GROUPS.map((group) => {
          const groupItems = NAV_ITEMS.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;

          const holdsActive = groupItems.some((item) => item.href === pathname);
          const open = openGroup === group;

          return (
            <button
              key={group}
              type="button"
              onClick={() => setOpenGroup(open ? null : group)}
              aria-expanded={open}
              className={cx(
                'flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                open
                  ? 'bg-accent-soft text-accent'
                  : holdsActive
                    ? 'text-ink hover:bg-surface-sunken'
                    : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {SHORT_LABEL[group] ?? group}
              {/* The dot marks the section you are in, so the row still says
                  where you are once the panel is closed. */}
              {holdsActive && (
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      {openGroup && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[22rem] overflow-hidden rounded-xl border border-hairline bg-surface-raised shadow-lift">
          <p className="border-b border-hairline bg-surface-sunken px-3.5 py-2 text-2xs font-bold uppercase tracking-[0.08em] text-ink-muted">
            {openGroup}
          </p>
          <ul className="p-1.5">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(
                      'flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                      active ? 'bg-accent-soft' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx('tile h-7 w-7 shrink-0', `tile-${item.tone}`)}
                    >
                      <Icon name={item.icon} size={14} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cx(
                          'block truncate text-xs font-medium leading-tight',
                          active ? 'text-accent' : 'text-ink',
                        )}
                      >
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-2xs leading-snug text-ink-muted">
                        {item.blurb}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
