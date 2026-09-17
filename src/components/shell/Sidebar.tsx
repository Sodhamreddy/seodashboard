'use client';

import { BrandMark } from './BrandMark';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { NAV_GROUPS, NAV_ITEMS } from '@/lib/nav';

const GROUPS_KEY = 'sitepilot-nav-groups';
const COLLAPSED_KEY = 'sitepilot-nav-collapsed';

export function Sidebar({
  onNavigate,
  username = 'user',
  collapsible = true,
}: {
  onNavigate?: () => void;
  username?: string;
  /**
   * False inside the mobile drawer: that panel is already an overlay someone
   * opened on purpose, and a rail you can shrink to icons inside a sheet you
   * have to open first is a control with nothing to buy.
   */
  collapsible?: boolean;
}) {
  const pathname = usePathname();
  const settingsActive = pathname === '/settings';
  const activeGroup = NAV_ITEMS.find((item) => item.href === pathname)?.group;

  /*
   * Groups collapse, and only the one you are in opens by default.
   *
   * Seventeen tools in one open list is a rail you scroll rather than read,
   * and scrolling a nav to find a nav item is the failure. Collapsed, the
   * whole product is seven headings that fit without scrolling, each carrying
   * its own count; the section you are working in is already open, and the
   * palette covers the case where you want something from a section you are
   * not in.
   *
   * Derived from the path on first render rather than from storage, so the
   * server and client agree; the remembered state is applied after mount.
   */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((group) => [group, group === (activeGroup ?? 'Overview')])),
  );

  /** Icons-only rail. Same reason: the width is the scarcest thing on screen. */
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const storedGroups = localStorage.getItem(GROUPS_KEY);
      if (storedGroups) setOpenGroups((current) => ({ ...current, ...JSON.parse(storedGroups) }));
      if (collapsible) setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      /* private mode — the path-derived default stands */
    }
  }, [collapsible]);

  // Navigating into a collapsed section opens it, so the current page is never
  // hidden behind a chevron.
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((current) =>
      current[activeGroup] ? current : { ...current, [activeGroup]: true },
    );
  }, [activeGroup]);

  function toggleGroup(group: string) {
    setOpenGroups((current) => {
      const next = { ...current, [group]: !current[group] };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* not persisting is survivable; collapsing must still work */
      }
      return next;
    });
  }

  function toggleRail() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* as above */
      }
      return next;
    });
  }

  const mini = collapsible && collapsed;

  return (
    <nav
      aria-label="Tools"
      className={cx(
        'flex h-full flex-col overflow-y-auto overflow-x-hidden py-4 transition-[width] duration-200',
        mini ? 'w-[72px] gap-3 px-2' : 'w-[266px] gap-4 px-3',
      )}
    >
      {/* ── Brand + rail toggle ───────────────────────────────────────── */}
      <div className={cx('flex items-center', mini ? 'flex-col gap-2' : 'gap-1')}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          title={mini ? 'SitePilot' : undefined}
          className={cx(
            'flex min-w-0 items-center rounded-lg hover:bg-surface-sunken',
            mini ? 'justify-center p-1.5' : 'flex-1 gap-2.5 px-2 py-1.5',
          )}
        >
          <BrandMark size={mini ? 30 : 32} className="shrink-0" />
          {!mini && (
            <span className="min-w-0">
              <span className="block truncate text-[0.85rem] font-bold leading-tight text-ink">
                SitePilot
              </span>
              <span className="block text-2xs text-ink-muted">Premium dashboard</span>
            </span>
          )}
        </Link>

        {collapsible && (
          <button
            type="button"
            onClick={toggleRail}
            aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <Icon name={mini ? 'chevronRight' : 'chevronLeft'} size={15} />
          </button>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────
          Collapsed, the grouping survives as dividers rather than headings:
          the icons keep their order, so muscle memory holds, and a heading
          truncated to two letters would be worse than none. */}
      <div className={cx('flex-1', mini ? 'space-y-2' : 'space-y-1.5')}>
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;

          const expanded = openGroups[group] ?? false;
          const holdsActive = items.some((item) => item.href === pathname);

          return (
            <div
              key={group}
              className={cx(
                'border-t border-hairline first:border-0',
                mini ? 'pt-2 first:pt-0' : 'pt-1.5 first:pt-0',
              )}
            >
              {!mini && (
                /* Section headings carry full ink, not muted: at this size a
                   muted uppercase label sits under the contrast floor and the
                   groups stop reading as structure. */
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8rem] font-bold uppercase tracking-[0.07em] text-ink transition-colors hover:bg-surface-sunken"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'h-3 w-0.5 shrink-0 rounded-full',
                      holdsActive ? 'bg-accent' : 'bg-hairline',
                    )}
                  />
                  {group}
                  <span className="ml-auto flex items-center gap-1.5">
                    {/* A collapsed group still says how much is inside it. */}
                    {!expanded && (
                      <span className="tnum text-2xs font-medium normal-case tracking-normal text-ink-muted">
                        {items.length}
                      </span>
                    )}
                    <Icon
                      name={expanded ? 'chevronDown' : 'chevronRight'}
                      size={12}
                      className="text-ink-muted"
                    />
                  </span>
                </button>
              )}

              <ul className={cx(mini ? 'space-y-1' : 'space-y-0.5 pt-1', !mini && !expanded && 'hidden')}>
                {items.map((item) => {
                  const active = pathname === item.href;
                  // A badged item stays visually raised even when inactive, so a
                  // new tool is discoverable without being mistaken for selected.
                  const promoted = !!item.badge && !active;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        title={mini ? item.label : undefined}
                        className={cx(
                          'group relative flex items-center rounded-lg transition-colors',
                          mini
                            ? 'h-10 w-10 justify-center'
                            : 'gap-2.5 px-2 py-2 text-[0.85rem]',
                          active && 'nav-active font-semibold',
                          !active && promoted && 'bg-accent-soft font-semibold text-accent',
                          !active && !promoted && 'font-medium text-ink hover:bg-surface-raised',
                        )}
                      >
                        <Icon name={item.icon} size={mini ? 17 : 16} className="shrink-0" />
                        {!mini && <span className="truncate">{item.label}</span>}

                        {item.badge && !mini && (
                          <span
                            className={cx(
                              'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide',
                              active ? 'bg-white/25 text-white' : 'btn-accent',
                            )}
                          >
                            {item.badge}
                          </span>
                        )}

                        {/* Decorative only. Without aria-hidden the title text is
                            folded into the link's accessible name, so screen
                            readers announce "Backlink Tracker Seeded data —
                            provider adapter not wired". Each panel states its
                            data mode in-page instead. */}
                        {!item.badge && item.mode === 'seed' && (
                          <span
                            aria-hidden="true"
                            title={mini ? undefined : 'Seeded data — provider adapter not wired'}
                            className={cx(
                              'h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning',
                              mini ? 'absolute right-1 top-1' : 'ml-auto',
                            )}
                          />
                        )}

                        {/* The badge has nowhere to sit at this width, so it
                            becomes a dot rather than disappearing. */}
                        {item.badge && mini && (
                          <span
                            aria-hidden="true"
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* ── Account footer ──────────────────────────────────────────── */}
      <div className={cx('border-t border-hairline pt-3', mini ? 'space-y-2' : 'space-y-2')}>
        {!mini && (
          <p className="flex items-center gap-1.5 px-2 text-2xs text-ink-muted">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-warning" />
            Seeded data source
          </p>
        )}

        <div
          className={cx(
            'flex items-center rounded-lg bg-surface-sunken',
            mini ? 'justify-center p-1.5' : 'gap-2.5 px-2.5 py-2',
          )}
          title={mini ? `${username} — signed in` : undefined}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-2xs font-bold uppercase text-white">
            {username.slice(0, 2)}
          </span>
          {!mini && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-ink">{username}</span>
              <span className="block text-2xs text-ink-muted">Signed in</span>
            </span>
          )}
        </div>

        <div className={cx('flex gap-2', mini && 'flex-col')}>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={settingsActive ? 'page' : undefined}
            title={mini ? 'Settings' : undefined}
            className={cx(
              'flex items-center justify-center rounded-lg border text-2xs font-semibold transition-colors',
              mini ? 'h-9 w-full' : 'h-8 flex-1 gap-1.5',
              settingsActive
                ? 'border-transparent bg-accent-soft text-accent'
                : 'border-hairline text-ink-secondary hover:bg-surface-raised hover:text-ink',
            )}
          >
            <Icon name="settings" size={13} />
            {!mini && 'Settings'}
          </Link>

          <form action="/api/auth/logout" method="post" className={cx(mini ? 'w-full' : 'flex-1')}>
            <button
              type="submit"
              title={mini ? 'Log out' : undefined}
              aria-label="Log out"
              className={cx(
                'flex w-full items-center justify-center rounded-lg border border-hairline text-2xs font-semibold text-ink-secondary transition-colors hover:bg-tint-critical hover:text-status-critical',
                mini ? 'h-9' : 'h-8 gap-1.5',
              )}
            >
              <Icon name="logout" size={13} />
              {!mini && 'Log out'}
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
