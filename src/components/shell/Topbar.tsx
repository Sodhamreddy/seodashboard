'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Badge, Button, cx } from '@/components/ui/primitives';
import type { Client } from '@/lib/clients';
import { MODE_LABEL, navItemFor } from '@/lib/nav';
import { Sidebar } from './Sidebar';

/** Shown once the roster is long enough that scanning beats scrolling. */
const FILTER_THRESHOLD = 6;

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

/**
 * The client roster + switcher.
 *
 * A "client" is a saved (name, domain) pair persisted server-side (so it
 * survives across sessions and machines) via `/api/clients`. Switching one in
 * just posts its domain to the existing `/api/domain` cookie endpoint — every
 * panel that already reads `getActiveDomain()` keeps working unchanged, this
 * is a convenience layer on top of it, not a new scoping mechanism.
 */
function DomainSwitcher({ domain }: { domain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [addDomain, setAddDomain] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open || clients !== null) return;
    fetch('/api/clients')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { clients: Client[] }) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [open, clients]);

  const activeClient = clients?.find((client) => client.domain === domain);
  const visible = useMemo(() => {
    if (!clients) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter(
      (client) => client.name.toLowerCase().includes(needle) || client.domain.includes(needle),
    );
  }, [clients, filter]);

  async function switchTo(nextDomain: string) {
    setPending(true);
    setError('');
    const response = await fetch('/api/domain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: nextDomain }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error ?? 'Could not switch domain.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, domain: addDomain }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; client?: Client };
    setPending(false);

    if (!response.ok || !data.client) {
      setError(data.error ?? 'Could not add client.');
      return;
    }

    setClients((current) => {
      const rest = (current ?? []).filter((client) => client.id !== data.client!.id);
      return [...rest, data.client!];
    });
    setName('');
    setAddDomain('');
    setAdding(false);
    await switchTo(data.client.domain);
  }

  async function remove(id: string) {
    setClients((current) => (current ?? []).filter((client) => client.id !== id));
    await fetch('/api/clients', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <div className="relative">
      {/*
       * The active client is the single most important fact on the screen: every
       * number below it belongs to that business and to no other. It used to be
       * a quiet outline chip indistinguishable from the theme buttons beside it,
       * which is precisely the wrong emphasis on a dashboard that switches
       * between clients — and a real hazard right after a bug that showed one
       * client's data under another's name. It now carries the accent, an
       * avatar, and the domain underneath so the name alone cannot be misread.
       */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Switch client"
        title={activeClient ? `${activeClient.name} — ${domain}` : domain}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-accent bg-accent-soft px-2.5 text-left shadow-card transition-shadow hover:shadow-lift"
      >
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-2xs font-bold text-white"
        >
          {(activeClient?.name ?? domain).slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-good" />
            <span className="max-w-[160px] truncate text-xs font-semibold leading-tight text-accent">
              {activeClient ? activeClient.name : domain}
            </span>
          </span>
          <span className="block max-w-[170px] truncate text-2xs leading-tight text-ink-secondary">
            {domain}
          </span>
        </span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-accent" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-hairline bg-surface-raised p-3 shadow-lift"
        >
          <p className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Clients
            {clients && clients.length > 0 && <span className="tnum">{clients.length}</span>}
          </p>

          {clients === null ? (
            <p className="px-1 py-3 text-center text-xs text-ink-muted">Loading…</p>
          ) : (
            <>
              {clients.length > FILTER_THRESHOLD && (
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter clients"
                  autoFocus
                  className="mb-2 h-8 w-full rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
              )}

              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {visible.map((client) => {
                  const active = client.domain === domain;
                  return (
                    <li key={client.id} className="group/client flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => switchTo(client.domain)}
                        disabled={pending}
                        className={cx(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                          active
                            ? 'bg-accent-soft font-medium text-accent'
                            : 'text-ink hover:bg-surface-sunken',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{client.name}</span>
                          <span className="block truncate text-2xs text-ink-muted">
                            {client.domain}
                          </span>
                        </span>
                        {active && <Icon name="check" size={13} className="shrink-0" />}
                      </button>
                      <button
                        type="button"
                        title={`Remove ${client.name}`}
                        aria-label={`Remove ${client.name}`}
                        onClick={() => remove(client.id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-muted opacity-0 hover:bg-tint-critical hover:text-status-critical group-hover/client:opacity-100"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </li>
                  );
                })}
                {clients.length > 0 && visible.length === 0 && (
                  <p className="px-2 py-2 text-2xs text-ink-muted">No client matches “{filter}”.</p>
                )}
                {clients.length === 0 && (
                  <p className="px-2 py-2 text-2xs leading-relaxed text-ink-muted">
                    No clients yet. Add one below — there’s no limit on how many you can save.
                  </p>
                )}
              </ul>
            </>
          )}

          <div className="mt-2 border-t border-hairline pt-2">
            {adding ? (
              <form onSubmit={submitAdd} className="space-y-1.5">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Client name"
                  autoFocus
                  className="h-8 w-full rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
                <input
                  value={addDomain}
                  onChange={(event) => setAddDomain(event.target.value)}
                  placeholder="example.com"
                  className="h-8 w-full rounded-lg border border-hairline bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none"
                />
                {error && <p className="text-2xs text-status-critical">{error}</p>}
                <div className="flex justify-end gap-2 pt-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setError('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={pending} disabled={!addDomain.trim()}>
                    Add &amp; switch
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
              >
                <Icon name="plus" size={13} />
                Add client
              </button>
            )}
          </div>

          {!adding && error && <p className="mt-1.5 text-2xs text-status-critical">{error}</p>}

          <p className="mt-2 border-t border-hairline pt-2 text-2xs leading-relaxed text-ink-muted">
            Scopes the overview, backlink, keyword, ads and alert panels. On-page tools take a full
            URL of their own.
          </p>
        </div>
      )}
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
            <DomainSwitcher domain={domain} />
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
          <Sidebar onNavigate={() => setDrawerOpen(false)} username={username} />
        </div>
      </div>
    </>
  );
}
