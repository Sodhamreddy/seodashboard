import type { Metadata } from 'next';
import { AutomationRegistry } from '@/components/panels/AutomationRegistry';
import { StatTile } from '@/components/ui/data';
import { number } from '@/lib/format';
import { summarise } from '@/lib/automations';
import { loadAutomations, loadRunLog } from '@/lib/providers/automations';
import { headers } from 'next/headers';

export const metadata: Metadata = { title: 'Automations' };
export const dynamic = 'force-dynamic';

/**
 * The automation registry — every agent, workflow and dashboard tool in one
 * place, with the state each is actually in.
 *
 * Half of these run inside this app and half in a separate automation
 * framework, which is exactly why the list has to live somewhere both are
 * visible: a spreadsheet nobody opens is how a workflow ends up silently dead
 * for three clients.
 */
export default async function AutomationsPage() {
  const [automations, runs] = await Promise.all([loadAutomations(), loadRunLog()]);
  const summary = summarise(automations, runs);

  /*
   * The ingest URL gets pasted into a runner, so it has to be the public
   * origin, not the internal address this process is bound to. Derived from the
   * forwarded headers the same way Settings derives the OAuth redirect URI,
   * with APP_ORIGIN winning when set — behind a proxy that rewrites Host there
   * is nothing in the request to recover the real hostname from.
   */
  const requestHeaders = headers();
  const forwardedProto =
    requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
  const forwardedHost =
    requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    requestHeaders.get('host')?.trim();
  const origin =
    process.env.APP_ORIGIN?.trim() ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'https://your-dashboard');

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight text-ink">Automations</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-secondary">
          Every agent, workflow and dashboard tool the team runs, with its status, cadence and how
          many clients it covers. Edit a row and press Save; the catalogue persists to{' '}
          <code className="font-mono text-xs">.data/automations/registry.json</code>.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Automations"
          value={number(summary.total)}
          footnote={`${summary.live} live · ${summary.inProgress} in progress${
            summary.paused > 0 ? ` · ${summary.paused} paused` : ''
          }`}
          icon="layers"
        />
        <StatTile
          label="Client implementations"
          value={number(summary.implementations)}
          footnote="Summed across every automation"
          icon="grid"
        />
        <StatTile
          label="Reporting runs"
          value={`${summary.reporting} / ${summary.total}`}
          footnote={
            summary.reporting === 0
              ? 'No runner has reported yet'
              : 'Automations that have called the ingest endpoint'
          }
          icon="history"
        />
        <StatTile
          label="Failing last run"
          value={number(summary.failing)}
          footnote={
            summary.failing === 0
              ? 'Nothing reported a failure'
              : 'Most recent reported run did not succeed'
          }
          icon="alert"
        />
      </div>

      <AutomationRegistry
        automations={automations}
        runs={runs}
        ingestConfigured={!!process.env.AUTOMATION_INGEST_TOKEN?.trim()}
        ingestPath={`${origin}/api/automations/runs`}
      />
    </div>
  );
}
