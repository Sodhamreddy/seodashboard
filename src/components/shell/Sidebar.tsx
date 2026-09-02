'use client';

import { BrandMark } from './BrandMark';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { NAV_GROUPS, NAV_ITEMS } from '@/lib/nav';

export function Sidebar({
  onNavigate,
  username = 'user',
}: {
  onNavigate?: () => void;
  username?: string;
}) {
  const pathname = usePathname();
  const settingsActive = pathname === '/settings';

  return (
    <nav aria-label="Tools" className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
      >
        <BrandMark size={32} className="shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[0.85rem] font-bold leading-tight text-ink">
            SitePilot
          </span>
          <span className="block text-2xs text-ink-muted">Premium dashboard</span>
        </span>
      </Link>

      <div className="flex-1 space-y-4">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group);
          if (items.length === 0) return null;

          return (
            <div key={group}>
              <p className="mb-1.5 px-2 text-2xs font-bold uppercase tracking-[0.1em] text-ink-muted">
                {group}
              </p>
              <ul className="space-y-0.5">
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
                        className={cx(
                          'group flex items-center gap-2.5 rounded-lg px-2 py-2 text-[0.8rem] transition-colors',
                          active && 'nav-active font-semibold',
                          !active && promoted && 'bg-accent-soft font-semibold text-accent',
                          !active && !promoted && 'font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink',
                        )}
                      >
                        <Icon name={item.icon} size={16} className="shrink-0" />
                        <span className="truncate">{item.label}</span>

                        {item.badge && (
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
                            title="Seeded data — provider adapter not wired"
                            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning"
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
      <div className="space-y-2 border-t border-hairline pt-3">
        <p className="flex items-center gap-1.5 px-2 text-2xs text-ink-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-warning" />
          Seeded data source
        </p>

        <div className="flex items-center gap-2.5 rounded-lg bg-surface-sunken px-2.5 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-2xs font-bold uppercase text-white">
            {username.slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-ink">{username}</span>
            <span className="block text-2xs text-ink-muted">Signed in</span>
          </span>
        </div>

        <div className="flex gap-2">
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={settingsActive ? 'page' : undefined}
            className={cx(
              'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-2xs font-semibold transition-colors',
              settingsActive
                ? 'border-transparent bg-accent-soft text-accent'
                : 'border-hairline text-ink-secondary hover:bg-surface-raised hover:text-ink',
            )}
          >
            <Icon name="target" size={13} />
            Settings
          </Link>

          <form action="/api/auth/logout" method="post" className="flex-1">
            <button
              type="submit"
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-hairline text-2xs font-semibold text-ink-secondary transition-colors hover:bg-tint-critical hover:text-status-critical"
            >
              <Icon name="logout" size={13} />
              Log out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
