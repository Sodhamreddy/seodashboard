'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, Input, Note, Select, cx } from '@/components/ui/primitives';
// Type-only: importing a *value* from `@/lib/clients` would pull `store.ts`
// and therefore `node:fs/promises` into the browser bundle. The field
// descriptors are presentation anyway, so they belong here.
import type { Client } from '@/lib/clients';

type Ga4Option = { id: string; displayName: string; account: string };

/**
 * Ranks properties by how well they match a domain, best first.
 *
 * Only used to put a likely candidate at the top of the list — the operator
 * still chooses. Automatic name matching is exactly what put an empty property
 * on screen once already.
 */
function rankForDomain(properties: Ga4Option[], domain: string) {
  const bare = domain.replace(/^www\./, '').toLowerCase();
  const label = bare.split('.')[0];
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

  return [...properties].sort((a, b) => score(b) - score(a));

  function score(property: Ga4Option) {
    const name = squash(property.displayName);
    if (name === squash(bare)) return 3;
    if (name.includes(label) || label.includes(name)) return 2;
    if (squash(property.account).includes(label)) return 1;
    return 0;
  }
}

const CLIENT_PROVIDER_FIELDS = [
  {
    key: 'ga4PropertyId' as const,
    label: 'GA4 property ID',
    placeholder: '323604980',
    hint: 'Analytics → Admin → Property details. Numeric, not the G- measurement id.',
  },
  {
    key: 'adsCustomerId' as const,
    label: 'Google Ads customer ID',
    placeholder: '1350001149',
    hint: 'The 10-digit account id, dashes optional.',
  },
  {
    key: 'gmbLocationId' as const,
    label: 'Business Profile location ID',
    placeholder: 'optional',
    hint: 'Only needed when the Google account manages several locations.',
  },
];

/**
 * Per-client provider account ids.
 *
 * This exists because those ids used to be single environment variables. With
 * one client that was invisible; with three it meant every client rendered the
 * first client's traffic and ad spend under its own name. Each client now
 * carries its own, and a blank field means that panel stays empty for that
 * client rather than borrowing someone else's numbers.
 */
export function ClientIntegrations({
  clients,
  activeDomain,
  envFallbackActive,
}: {
  clients: Client[];
  activeDomain: string;
  /** True while a single client exists and env vars still supply the defaults. */
  envFallbackActive: boolean;
}) {
  const [rows, setRows] = useState(clients);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');

  /*
   * The GA4 properties the connected Google account can actually see.
   *
   * Typing a numeric property id by hand was the wrong design: the account
   * exposes twenty of them, several with near-identical names, and the id lives
   * in a different product's admin screen. Picking from the real list removes
   * both the lookup and the typo.
   */
  const [ga4Properties, setGa4Properties] = useState<Ga4Option[] | null>(null);
  const [discoveryError, setDiscoveryError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/integrations')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((payload: { ga4?: { error: string | null; properties?: Ga4Option[] } }) => {
        if (cancelled) return;
        if (payload.ga4?.error) {
          setDiscoveryError(payload.ga4.error);
          setGa4Properties([]);
        } else {
          setGa4Properties(payload.ga4?.properties ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiscoveryError('unreachable');
          setGa4Properties([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function edit(id: string, key: string, value: string) {
    setSaved(null);
    setRows((current) =>
      current.map((client) => (client.id === id ? { ...client, [key]: value } : client)),
    );
  }

  async function save(client: Client) {
    setSaving(client.id);
    setError('');
    try {
      const response = await fetch('/api/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: client.id,
          ga4PropertyId: client.ga4PropertyId ?? '',
          adsCustomerId: client.adsCustomerId ?? '',
          gmbLocationId: client.gmbLocationId ?? '',
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; client?: Client };
      if (!response.ok) {
        setError(data.error ?? 'Could not save.');
      } else {
        // Adopt the server's normalised values — it strips dashes from the Ads
        // id and the "properties/" prefix from GA4, so the field should show
        // what was actually stored.
        if (data.client) {
          setRows((current) =>
            current.map((row) => (row.id === data.client!.id ? data.client! : row)),
          );
        }
        setSaved(client.id);
      }
    } catch {
      setError('Network error — could not save.');
    } finally {
      setSaving(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Note tone="neutral" icon="info">
        No clients saved yet. Add one from the switcher in the top bar.
      </Note>
    );
  }

  return (
    <div className="space-y-3">
      {envFallbackActive ? (
        <Note tone="neutral" icon="info">
          <span className="font-semibold">One client saved, so environment defaults still apply.</span>{' '}
          <code className="font-mono">GA4_PROPERTY_ID</code> and{' '}
          <code className="font-mono">GOOGLE_ADS_CUSTOMER_ID</code> fill in where a field below is
          blank. Add a second client and those defaults are ignored, because a global id cannot
          belong to two businesses.
        </Note>
      ) : (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">
            Several clients are saved, so environment defaults are ignored.
          </span>{' '}
          Each client shows a provider&rsquo;s data only if its own id is set below. A blank field
          means an empty panel — which is the intended behaviour, because the alternative was
          showing one client&rsquo;s numbers under another&rsquo;s name.
        </Note>
      )}

      {error && (
        <Note tone="critical" icon="alert">
          {error}
        </Note>
      )}

      {discoveryError && (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Could not list the account&rsquo;s GA4 properties</span> (
          {discoveryError}). Enter property ids by hand below, or reconnect Google in the section
          underneath if the Analytics permission was not granted.
        </Note>
      )}

      {rows.map((client) => {
        const configured = CLIENT_PROVIDER_FIELDS.filter(
          (field) => (client[field.key] ?? '').toString().trim() !== '',
        ).length;

        return (
          <Card key={client.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {client.name}
                  {client.domain === activeDomain && (
                    <Badge tone="accent" icon="check">
                      Active
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 truncate text-2xs text-ink-muted">{client.domain}</p>
              </div>
              <Badge tone={configured === 0 ? 'warning' : 'good'} icon={configured === 0 ? 'alert' : 'check'}>
                {configured} of {CLIENT_PROVIDER_FIELDS.length} set
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {CLIENT_PROVIDER_FIELDS.map((field) => {
                const value = (client[field.key] ?? '') as string;

                // GA4 is a pick-list because the account exposes the real
                // properties; the other two have no equivalent listing yet.
                const isGa4 = field.key === 'ga4PropertyId';
                const options = isGa4 && ga4Properties ? rankForDomain(ga4Properties, client.domain) : null;
                const known = options?.some((option) => option.id === value) ?? false;

                return (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-2xs font-medium text-ink-secondary">
                      {field.label}
                    </span>

                    {isGa4 && options && options.length > 0 ? (
                      <>
                        <Select
                          value={known ? value : ''}
                          onChange={(event) => edit(client.id, field.key, event.target.value)}
                        >
                          <option value="">— not configured —</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.displayName} · {option.account} ({option.id})
                            </option>
                          ))}
                        </Select>
                        {value && !known && (
                          <span className="mt-1 block text-2xs leading-relaxed text-status-warning">
                            Saved id {value} is not in this account&rsquo;s list. Pick one above to
                            replace it.
                          </span>
                        )}
                      </>
                    ) : (
                      <Input
                        value={value}
                        placeholder={field.placeholder}
                        autoComplete="off"
                        onChange={(event) => edit(client.id, field.key, event.target.value)}
                      />
                    )}

                    <span className="mt-1 block text-2xs leading-relaxed text-ink-muted">
                      {isGa4 && ga4Properties === null
                        ? 'Loading the properties on the connected account…'
                        : isGa4 && options && options.length > 0
                          ? `${options.length} properties on the connected account, closest match first.`
                          : field.hint}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                icon={saved === client.id ? 'check' : 'copy'}
                loading={saving === client.id}
                onClick={() => save(client)}
              >
                {saved === client.id ? 'Saved' : 'Save'}
              </Button>
              <span
                className={cx(
                  'text-2xs',
                  saved === client.id ? 'text-status-good' : 'text-ink-muted',
                )}
              >
                {saved === client.id ? (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="check" size={11} />
                    Stored — reload the dashboard to see it apply
                  </span>
                ) : (
                  'Leave a field blank to leave that provider unconfigured for this client.'
                )}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
