'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { accentMeta, type AccentKey } from '@/lib/builder/types';
import { useBuilder } from './store';

type Client = { id: string; name: string; domain: string };

/**
 * Binds the open report to a client from the roster.
 *
 * Previously the client was a free-text field, which is why a report could sit
 * there reading "Demo client" while its live numbers came from whichever domain
 * the session happened to be on. Selecting here writes both the display name
 * and the domain onto the document, and the live-data effect in the store keys
 * its cache on that domain — so switching client actually reloads the metrics.
 *
 * The name stays editable for the case where the report title should differ
 * from the roster entry (a trading name, say); editing it does not unbind the
 * domain.
 */
export function ClientPicker({ accent }: { accent: AccentKey }) {
  const { state, dispatch } = useBuilder();
  const doc = state.doc;

  const [clients, setClients] = useState<Client[] | null>(null);
  const [activeDomain, setActiveDomain] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // The roster is fetched once the picker is first opened, not on mount — the
  // builder already fires a live-data request on load and this need not race it.
  useEffect(() => {
    if (!open || clients !== null) return;
    let cancelled = false;

    fetch('/api/clients')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { clients?: Client[]; activeDomain?: string }) => {
        if (cancelled) return;
        setClients(payload.clients ?? []);
        setActiveDomain(payload.activeDomain ?? '');
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, clients]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(client: Client) {
    setOpen(false);
    if (client.domain === doc.clientDomain) return;
    dispatch({
      type: 'patchDoc',
      patch: { client: client.name, clientDomain: client.domain },
    });
  }

  const bound = Boolean(doc.clientDomain);

  return (
    <span className="relative flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-2xs font-bold text-white"
        style={{ background: accentMeta(accent).base }}
      >
        {doc.client.slice(0, 1).toUpperCase()}
      </span>

      {editing ? (
        <input
          value={doc.client}
          autoFocus
          onChange={(event) =>
            dispatch({ type: 'patchDoc', patch: { client: event.target.value } })
          }
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') setEditing(false);
          }}
          aria-label="Client name"
          className="min-w-0 max-w-[180px] rounded-lg bg-surface-sunken px-1 text-sm text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          title={bound ? `${doc.client} — ${doc.clientDomain}` : 'No client selected'}
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-surface-sunken"
        >
          <span className="min-w-0">
            <span className="block max-w-[180px] truncate text-sm leading-tight text-ink">
              {doc.client}
            </span>
            <span
              className={cx(
                'block max-w-[180px] truncate text-2xs leading-tight',
                bound ? 'text-ink-muted' : 'text-status-warning',
              )}
            >
              {bound ? doc.clientDomain : 'Not linked to a client'}
            </span>
          </span>
          <Icon name="chevronDown" size={13} className="shrink-0 text-ink-muted" />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-hairline bg-surface-raised p-2 shadow-lift"
        >
          <p className="mb-1.5 px-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Report client
          </p>

          {clients === null ? (
            <p className="px-1.5 py-3 text-center text-xs text-ink-muted">Loading roster…</p>
          ) : clients.length === 0 ? (
            <p className="px-1.5 py-3 text-xs leading-relaxed text-ink-secondary">
              No clients saved yet. Add one from the switcher in the dashboard top bar, then
              reopen this menu.
            </p>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {clients.map((client) => {
                const selected = client.domain === doc.clientDomain;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => choose(client)}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                        selected
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-ink hover:bg-surface-sunken',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{client.name}</span>
                        <span className="block truncate text-2xs text-ink-muted">
                          {client.domain}
                          {client.domain === activeDomain && ' · dashboard default'}
                        </span>
                      </span>
                      {selected && <Icon name="check" size={13} className="shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
            className="mt-1.5 flex w-full items-center gap-2 border-t border-hairline px-2 pt-2 text-2xs text-ink-secondary hover:text-ink"
          >
            <Icon name="pencil" size={12} />
            Rename on this report only
          </button>
        </div>
      )}
    </span>
  );
}
