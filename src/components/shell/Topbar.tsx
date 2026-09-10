'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Badge, cx } from '@/components/ui/primitives';
import { MODE_LABEL, navItemFor } from '@/lib/nav';
import { DomainSwitcher } from './DomainSwitcher';
import { Sidebar } from './Sidebar';

type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_KEY = 'seodash-theme';

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'layers' },
];

function prefersDark() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

/**
 * Light is the default. An explicit Light/Dark choice is respected regardless
 * of the OS setting; only 'system' follows it, and then it keeps following it
 * live via the media-query listener.
 */
function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('light');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      /* private mode — fall back to the default */
    }
    if (stored === 'light' || stored === 'dark' || stored === 'system') setChoice(stored);
  }, []);

  // Keep 'system' live: react to the OS flipping while the page is open.
  useEffect(() => {
    if (choice !== 'system' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [choice]);

  function select(value: ThemeChoice) {
    setChoice(value);
    document.documentElement.classList.toggle(
      'dark',
      value === 'dark' || (value === 'system' && prefersDark()),
    );
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      /* private mode — theme just won't persist */
    }
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex rounded-lg border border-hairline p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const active = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={cx(
              'flex h-8 items-center gap-1.5 rounded-md px-2 text-2xs font-medium transition-colors',
              active
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon name={option.icon} size={14} />
            <span className="hidden xl:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Topbar({ domain, username }: { domain: string; username: string }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const item = navItemFor(pathname);
  // Routes outside the nav (e.g. /settings) still deserve their own title
  // rather than silently reading "Dashboard".
  const fallbackTitle =
    pathname === '/'
      ? 'Dashboard'
      : pathname
          .split('/')
          .filter(Boolean)
          .slice(-1)[0]
          .replace(/[-_]+/g, ' ')
          .replace(/\w/g, (character) => character.toUpperCase());

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-hairline bg-[color:var(--topbar-bg)] backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-7">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-ink-secondary lg:hidden"
          >
            <Icon name="layers" size={16} />
          </button>

          {item && (
            <span aria-hidden="true" className={cx('tile hidden h-10 w-10 shrink-0 sm:grid', `tile-${item.tone}`)}>
              <Icon name={item.icon} size={19} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold leading-tight text-ink">
                {item?.label ?? fallbackTitle}
              </h1>
              {/* Hidden on narrow screens so the page title keeps its room —
                  each panel repeats its data-mode as an in-page banner. */}
              {item && (
                <span className="hidden shrink-0 sm:inline-flex">
                  <Badge
                    tone={item.mode === 'real' ? 'good' : item.mode === 'partial' ? 'accent' : 'warning'}
                    icon={item.mode === 'seed' ? 'alert' : item.mode === 'real' ? 'check' : 'info'}
                  >
                    {MODE_LABEL[item.mode]}
                  </Badge>
                </span>
              )}
            </div>
            {item && <p className="mt-0.5 truncate text-xs text-ink-secondary">{item.blurb}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* The switcher lives at the top of the sidebar now. Below `lg`
                that rail is behind a drawer, so the compact chip stays. */}
            <span className="lg:hidden">
              <DomainSwitcher domain={domain} />
            </span>
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title={`Sign out ${username}`}
                aria-label={`Sign out ${username}`}
                className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-ink-secondary hover:bg-surface-sunken hover:text-ink"
              >
                <Icon name="logout" size={16} />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile navigation drawer */}
      <div
        className={cx(
          'fixed inset-0 z-50 lg:hidden',
          drawerOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className={cx(
            'absolute inset-0 bg-black transition-opacity',
            drawerOpen ? 'opacity-50' : 'opacity-0',
          )}
        />
        <div
          className={cx(
            'absolute inset-y-0 left-0 w-[280px] border-r border-hairline bg-surface transition-transform',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} username={username} domain={domain} />
        </div>
      </div>
    </>
  );
}
