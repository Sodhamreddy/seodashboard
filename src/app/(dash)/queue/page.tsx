import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { StatTile } from '@/components/ui/data';
import { Badge, Card, Note, cx, type Tone } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { number, relativeTime } from '@/lib/format';
import {
  buildWorkQueue,
  type WorkItemKind,
  type WorkItemSeverity,
} from '@/lib/providers/workQueue';

export const metadata: Metadata = { title: 'Work queue' };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<WorkItemKind, string> = {
  budget: 'budget',
  failed: 'failed',
  reporting: 'wiring',
  setup: 'setup',
};

const SEVERITY_TONE: Record<WorkItemSeverity, Tone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'neutral',
};

/** The chip colour carries severity, so the kind chip stays neutral in weight. */
const KIND_CLASS: Record<WorkItemSeverity, string> = {
  critical: 'bg-tint-critical text-status-critical',
  warning: 'bg-tint-warning text-status-warning',
  info: 'bg-surface-sunken text-ink-secondary',
};

const STRIPE: Record<WorkItemSeverity, string> = {
  critical: 'before:bg-status-critical',
  warning: 'before:bg-status-warning',
  info: 'before:bg-hairline',
};

/**
 * One list of everything waiting on a person.
 *
 * Deliberately not another analytics page: each row names a thing to do and
 * links to where it gets done. Rows come from state the app already holds —
 * budgets past a threshold, automations that failed or never reported, clients
 * missing a provider account — so this is useful on the day it ships rather
 * than after the content and social modules land.
 */
export default async function QueuePage() {
  const domain = getActiveDomain();
  const queue = await buildWorkQueue(domain);

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight text-ink">Work queue</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-secondary">
          Everything across the account that is waiting on a person, newest and most serious first.
          Scoped to <span className="font-medium text-ink">{domain}</span> for spend; automations and
          client setup are account-wide.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Needs attention"
          value={number(queue.counts.total)}
          footnote={
            queue.counts.total === 0 ? 'Nothing waiting' : `${queue.counts.critical} critical`
          }
          icon="target"
        />
        <StatTile
          label="Failing now"
          value={number(queue.counts.critical)}
          footnote={
            queue.counts.critical === 0
              ? 'No failures or exhausted budgets'
              : 'Budgets over cap or runs that failed'
          }
          icon="alert"
        />
        <StatTile
          label="Pacing ahead"
          value={number(queue.counts.warning)}
          footnote="Spend running hot against plan"
          icon="bars"
        />
        <StatTile
          label="Clients involved"
          value={number(queue.clientsAffected)}
          footnote="Named by at least one item"
          icon="grid"
        />
      </div>

      {queue.items.length === 0 ? (
        <Note tone="good" icon="check">
          <span className="font-semibold">Nothing is waiting.</span> No budget is past a threshold, no
          automation reported a failure, and every client has its provider accounts set.
        </Note>
      ) : (
        <Card padded={false}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-5 py-3.5">
            <h2 className="text-[0.95rem] font-semibold text-ink">Open items</h2>
            <p className="text-2xs text-ink-muted">
              {queue.counts.total} item{queue.counts.total === 1 ? '' : 's'} · most serious first
            </p>
          </div>

          <ul>
            {queue.items.map((item) => (
              <li
                key={item.id}
                className={cx(
                  // The severity stripe sits in the row's own left edge rather
                  // than turning each row into a card of its own.
                  'relative border-b border-hairline px-5 py-3.5 pl-6 last:border-0',
                  'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
                  STRIPE[item.severity],
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'rounded px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.05em]',
                          KIND_CLASS[item.severity],
                        )}
                      >
                        {KIND_LABEL[item.kind]}
                      </span>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      {item.client && (
                        <Badge tone="neutral" icon={null}>
                          {item.client}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-secondary">
                      {item.detail}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {item.at && (
                      <span className="tnum text-2xs text-ink-muted">{relativeTime(item.at)}</span>
                    )}
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2.5 py-1.5 text-2xs font-medium text-ink transition-colors hover:bg-surface-sunken"
                    >
                      {item.action}
                      <Icon name="chevronRight" size={12} />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/*
       * Naming the sources that do not exist yet is the honest version of an
       * empty queue: it says "not built" rather than letting a short list read
       * as "all clear".
       */}
      <Card>
        <h2 className="text-sm font-semibold text-ink">Not feeding this queue yet</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
          These arrive with the modules that produce them. Until then the queue covers spend,
          automation runs and client setup only — so treat it as complete for those three, not for
          the agency&rsquo;s whole day.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {queue.pendingSources.map((source) => (
            <li
              key={source}
              className="flex items-start gap-2 rounded-lg border border-dashed border-hairline px-3 py-2 text-2xs leading-relaxed text-ink-muted"
            >
              <Icon name="clock" size={12} className="mt-0.5 shrink-0" />
              {source}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
