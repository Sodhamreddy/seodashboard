'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import type { Client } from '@/lib/clients';

/** Shown once the roster is long enough that scanning beats scrolling. */
const FILTER_THRESHOLD = 6;

/**
 * The client roster + switcher.
 *
 * A "client" is a saved (name, domain) pair persisted server-side (so it
 * survives across sessions and machines) via `/api/clients`. Switching one in
 * just posts its domain to the existing `/api/domain` cookie endpoint — every
 * panel that already reads `getActiveDomain()` keeps working unchanged, this
 * is a convenience layer on top of it, not a new scoping mechanism.
 */
export function DomainSwitcher({
  domain,
  variant = 'topbar',
  onNavigate,
}: {
  domain: string;
  /**
   * 'sidebar' is the primary placement: a full-width row pinned under the
   * brand, the way a workspace switcher sits in the products this is measured
   * against. 'topbar' is the compact chip, kept for narrow screens where the
   * sidebar is behind a drawer.
   */
  variant?: 'topbar' | 'sidebar';
  /** Lets the mobile drawer close itself when a client is chosen. */
  onNavigate?: () => void;
}) {
  const sidebar = variant === 'sidebar';
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

  /*
   * The roster loads on mount, not when the popover first opens.
   *
   * The client's *name* is the whole point of this row — it is the one label
   * that says whose numbers are on screen. Fetching it lazily meant the
   * trigger showed the bare domain on both lines until someone happened to
   * click it, which reads as a bug rather than as lazy loading. One small GET
   * on load is worth the row being right the first time it is seen.
   */
  useEffect(() => {
    if (clients !== null) return;
    fetch('/api/clients')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { clients: Client[] }) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [clients]);

  const activeClient = clients?.find((client) => client.domain === domain);
  // A domain with no roster entry has nothing to add on a second line, and
  // printing it twice looks like a rendering fault.
  const label = activeClient?.name ?? domain;
  const showDomainLine = label !== domain;
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
    onNavigate?.();
    /*
     * A full document load, not `router.refresh()`.
     *
     * The active client is a cookie every server component reads, so switching
     * it re-scopes the entire app. `router.refresh()` re-renders the route
     * that happens to be mounted, but the App Router keeps the RSC payloads of
     * recently visited routes in its client-side cache — so navigating back to
     * a page visited under the previous client served that client's numbers
     * under the new client's name. Reloading is the only thing that drops that
     * cache wholesale, and it costs one navigation on an action taken a few
     * times a day.
     */
    window.location.reload();
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
    <div className={cx('relative', sidebar && 'w-full')}>
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
        className={cx(
          'flex items-center gap-2.5 text-left transition-colors',
          sidebar
            ? 'h-11 w-full rounded-lg border border-hairline bg-surface px-2 hover:bg-surface-sunken'
            : 'h-10 rounded-xl border border-accent bg-accent-soft px-2.5 shadow-card transition-shadow hover:shadow-lift',
        )}
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
            <span
              className={cx(
                'truncate text-sm font-semibold leading-tight',
                sidebar ? 'max-w-[142px] text-ink' : 'max-w-[180px] text-accent',
              )}
            >
              {label}
            </span>
          </span>
          {showDomainLine && (
            <span
              className={cx(
                'block truncate text-2xs leading-tight text-ink-secondary',
                sidebar ? 'max-w-[142px]' : 'max-w-[170px]',
              )}
            >
              {domain}
            </span>
          )}
        </span>
        <Icon
          name="chevronDown"
          size={14}
          className={cx('shrink-0', sidebar ? 'ml-auto text-ink-muted' : 'text-accent')}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={cx(
            'absolute z-50 mt-2 rounded-xl border border-hairline bg-surface-raised p-3 shadow-lift',
            sidebar ? 'left-0 right-0 w-auto' : 'right-0 w-80',
          )}
        >
          <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.07em] text-ink">
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
                          'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                          active
                            ? 'bg-accent-soft text-accent ring-1 ring-inset ring-accent'
                            : 'text-ink hover:bg-surface-sunken',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold leading-tight">
                            {client.name}
                          </span>
                          <span
                            className={cx(
                              'mt-0.5 block truncate text-2xs leading-tight',
                              active ? 'text-ink-secondary' : 'text-ink-muted',
                            )}
                          >
                            {client.domain}
                          </span>
                        </span>
                        {active && <Icon name="check" size={14} className="shrink-0" />}
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
