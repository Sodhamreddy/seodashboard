'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  Badge,
  Button,
  Card,
  Input,
  Note,
  Select,
  cx,
  type Tone,
} from '@/components/ui/primitives';
import { number, relativeTime } from '@/lib/format';
import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_STATUSES,
  AUTOMATION_STATUS_LABEL,
  type Automation,
  type AutomationCategory,
  type AutomationRun,
  type AutomationRunLog,
  type AutomationStatus,
} from '@/lib/automations';

const STATUS_TONE: Record<AutomationStatus, Tone> = {
  live: 'good',
  building: 'accent',
  planned: 'neutral',
  paused: 'warning',
};

const CATEGORY_ICON: Record<AutomationCategory, 'sparkles' | 'refresh' | 'layers'> = {
  Agents: 'sparkles',
  Workflows: 'refresh',
  'Dashboard tools': 'layers',
};

/**
 * The registry editor.
 *
 * Status, client count, cadence and notes are the fields that go stale, so they
 * are editable in place; names, descriptions and the links live in code because
 * they describe what the thing *is*. One Save writes the whole catalogue, the
 * same shape as the alert-rule editor.
 *
 * The last-run column reads the reported run log and says "not reporting" when
 * an automation has never called the ingest endpoint. That distinction is the
 * point of the column: "no runs reported" is a wiring gap, not a healthy
 * automation, and it should not look like one.
 */
export function AutomationRegistry({
  automations: initial,
  runs,
  ingestConfigured,
  ingestPath,
}: {
  automations: Automation[];
  runs: AutomationRunLog;
  /** Whether AUTOMATION_INGEST_TOKEN is set on the server. */
  ingestConfigured: boolean;
  ingestPath: string;
}) {
  const [automations, setAutomations] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<AutomationStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  function update(id: string, patch: Partial<Automation>) {
    setAutomations((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
    setDirty(true);
    setMessage('');
  }

  async function save() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ automations }),
      });
      const data = (await response.json()) as { error?: string; automations?: Automation[] };
      if (!response.ok) {
        setError(data.error ?? 'Could not save the registry.');
        return;
      }
      if (data.automations) setAutomations(data.automations);
      setDirty(false);
      setMessage('Registry saved.');
    } catch {
      setError('Network error — the registry was not saved.');
    } finally {
      setPending(false);
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return automations.filter((entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle) ||
        entry.id.includes(needle)
      );
    });
  }, [automations, statusFilter, query]);

  const counts = useMemo(() => {
    const map = new Map<AutomationStatus, number>();
    for (const status of AUTOMATION_STATUSES) map.set(status, 0);
    for (const entry of automations) map.set(entry.status, (map.get(entry.status) ?? 0) + 1);
    return map;
  }, [automations]);

  return (
    <div className="space-y-4">
      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label="All"
            count={automations.length}
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
          />
          {AUTOMATION_STATUSES.map((status) => (
            <FilterChip
              key={status}
              label={AUTOMATION_STATUS_LABEL[status]}
              count={counts.get(status) ?? 0}
              active={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-48">
            <Input
              value={query}
              placeholder="Search automations"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {dirty && <Badge tone="warning">unsaved changes</Badge>}
          <Button icon="download" loading={pending} onClick={() => void save()}>
            Save registry
          </Button>
        </div>
      </div>

      {message && (
        <Note tone="good" icon="check">
          {message}
        </Note>
      )}
      {error && (
        <Note tone="critical" icon="alert">
          {error}
        </Note>
      )}

      {/* ── Catalogue ───────────────────────────────────────────────── */}
      {AUTOMATION_CATEGORIES.map((category) => {
        const rows = visible.filter((entry) => entry.category === category);
        if (rows.length === 0) return null;

        return (
          <section key={category} className="space-y-2">
            <h2 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.07em] text-ink">
              <Icon name={CATEGORY_ICON[category]} size={14} className="text-accent" />
              {category}
              <span className="tnum text-2xs font-medium text-ink-muted">{rows.length}</span>
            </h2>

            <div className="space-y-2">
              {rows.map((entry) => (
                <AutomationRow
                  key={entry.id}
                  entry={entry}
                  latestRun={runs[entry.id]?.[0]}
                  runCount={runs[entry.id]?.length ?? 0}
                  onChange={(patch) => update(entry.id, patch)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {visible.length === 0 && (
        <Note tone="neutral" icon="info">
          No automation matches that filter.
        </Note>
      )}

      {/* ── Run reporting ───────────────────────────────────────────── */}
      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Reporting runs into this page</h2>
          <Badge tone={ingestConfigured ? 'good' : 'warning'} icon={ingestConfigured ? 'check' : 'alert'}>
            {ingestConfigured ? 'ingest token set' : 'ingest token missing'}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-ink-secondary">
          The automations run in their own framework, so the last-run column is fed by whatever
          executes them rather than polled from here — one HTTP call at the end of a run. Add this
          to each automation, using its id from the row above:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-hairline bg-surface-sunken p-3 text-2xs leading-relaxed text-ink">
          {`curl -X POST ${ingestPath} \\
  -H "authorization: Bearer $AUTOMATION_INGEST_TOKEN" \\
  -H 'content-type: application/json' \\
  -d '{"id":"serp-agent","ok":true,"durationMs":42000,"note":"124 keywords checked"}'`}
        </pre>
        <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
          {ingestConfigured
            ? 'A run may not change status, name or client count — those stay editable here only.'
            : 'Until AUTOMATION_INGEST_TOKEN is set in the server environment, that endpoint answers 503 rather than accepting anonymous writes.'}
        </p>
      </Card>
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-2xs transition-colors',
        active
          ? 'border-transparent bg-accent-soft font-semibold text-accent'
          : 'border-hairline bg-surface text-ink-secondary hover:bg-surface-sunken',
      )}
    >
      {label}
      <span className="tnum text-ink-muted">{count}</span>
    </button>
  );
}

function AutomationRow({
  entry,
  latestRun,
  runCount,
  onChange,
}: {
  entry: Automation;
  latestRun?: AutomationRun;
  runCount: number;
  onChange: (patch: Partial<Automation>) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{entry.name}</h3>
            <Badge tone={STATUS_TONE[entry.status]}>{AUTOMATION_STATUS_LABEL[entry.status]}</Badge>
            {entry.href && (
              <Link
                href={entry.href}
                className="inline-flex items-center gap-1 text-2xs font-medium text-accent underline underline-offset-2"
              >
                Open
                <Icon name="chevronRight" size={11} />
              </Link>
            )}
            {entry.externalUrl && (
              <a
                href={entry.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-2xs font-medium text-accent underline underline-offset-2"
              >
                Runner
                <Icon name="external" size={11} />
              </a>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-secondary">
            {entry.description}
          </p>
          <p className="mt-1 font-mono text-2xs text-ink-muted">{entry.id}</p>
        </div>

        {/* Last reported run — never inferred, only what a runner told us. */}
        <div className="shrink-0 text-right">
          <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">Last run</p>
          {latestRun ? (
            <>
              <p
                className={cx(
                  'mt-0.5 text-xs font-semibold',
                  latestRun.ok ? 'text-status-good' : 'text-status-critical',
                )}
              >
                {latestRun.ok ? 'Succeeded' : 'Failed'}
              </p>
              <p className="text-2xs text-ink-secondary">{relativeTime(latestRun.at)}</p>
              <p className="text-2xs text-ink-muted">
                {runCount} run{runCount === 1 ? '' : 's'} reported
              </p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-xs font-medium text-ink-muted">Not reporting</p>
              <p className="text-2xs text-ink-muted">No runs received</p>
            </>
          )}
        </div>
      </div>

      {latestRun?.note && (
        <p className="mt-2 border-t border-hairline pt-2 text-2xs leading-relaxed text-ink-secondary">
          <span className="font-medium text-ink">Latest:</span> {latestRun.note}
        </p>
      )}

      <div className="mt-3 grid gap-3 border-t border-hairline pt-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-secondary">Status</span>
          <Select
            value={entry.status}
            onChange={(event) => onChange({ status: event.target.value as AutomationStatus })}
          >
            {AUTOMATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {AUTOMATION_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-secondary">
            Clients implemented
          </span>
          <Input
            type="number"
            min={0}
            value={entry.clients === 0 ? '' : entry.clients}
            placeholder="0"
            onChange={(event) => onChange({ clients: Number(event.target.value) })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-secondary">Cadence</span>
          <Input
            value={entry.schedule}
            placeholder="Daily 09:30"
            onChange={(event) => onChange({ schedule: event.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-secondary">Notes</span>
          <Input
            value={entry.notes ?? ''}
            placeholder="optional"
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        </label>
      </div>

      {entry.clients > 0 && (
        <p className="mt-2 text-2xs text-ink-muted">
          Running for {number(entry.clients)} client{entry.clients === 1 ? '' : 's'}.
        </p>
      )}
    </Card>
  );
}
