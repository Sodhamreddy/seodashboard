import { loadClients } from '../clients';
import { getAdsReport } from './ads';
import { evaluateAlerts, loadAlertRules } from './alerts';
import { loadAutomations, loadRunLog } from './automations';

/**
 * The work queue — everything waiting on a person, in one list.
 *
 * The dashboard grew as a set of places to *look at* data: seventeen pages,
 * each answering its own question. Nothing answered "what needs me today",
 * so the answer was a tour of the sidebar plus a spreadsheet — and a budget
 * crossing its threshold looked exactly like a budget that had not.
 *
 * Every item here is derived from state the app already holds. Nothing is
 * invented: no drafts to approve, no review replies, no scheduled posts,
 * because those modules do not exist yet. When they do, they add sources here
 * rather than another page to remember to visit.
 *
 * Two aggregation rules keep the list a queue rather than a log:
 *
 *  - **One row per thing a person would do.** Fourteen automations that have
 *    never reported a run is one wiring problem, not fourteen items.
 *  - **Only what is actionable.** An automation nobody enabled is not work.
 */

export type WorkItemKind = 'budget' | 'failed' | 'reporting' | 'setup';
export type WorkItemSeverity = 'critical' | 'warning' | 'info';

export type WorkItem = {
  id: string;
  kind: WorkItemKind;
  severity: WorkItemSeverity;
  title: string;
  detail: string;
  /** Where the person goes to deal with it. */
  href: string;
  action: string;
  /** When it happened, when that is known. */
  at?: string;
  /** The client it belongs to; absent when it is account-wide. */
  client?: string;
};

export type WorkQueue = {
  items: WorkItem[];
  counts: { total: number; critical: number; warning: number; info: number };
  /** Clients named by at least one item. */
  clientsAffected: number;
  /**
   * Sources that will feed this queue once their modules exist, so an empty
   * queue reads as "nothing waiting" rather than "nothing wired".
   */
  pendingSources: string[];
};

const SEVERITY_RANK: Record<WorkItemSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export async function buildWorkQueue(domain: string): Promise<WorkQueue> {
  const [report, automations, runs, clients] = await Promise.all([
    getAdsReport(domain, 30),
    loadAutomations(),
    loadRunLog(),
    loadClients(),
  ]);

  const items: WorkItem[] = [];

  /* ── Budgets pacing past a threshold ──────────────────────────────── */
  if (report.available) {
    const rules = await loadAlertRules(report);
    for (const evaluation of evaluateAlerts(report, rules)) {
      if (evaluation.severity === 'ok') continue;
      items.push({
        id: `budget:${evaluation.rule.id}`,
        kind: 'budget',
        severity:
          evaluation.severity === 'critical'
            ? 'critical'
            : evaluation.severity === 'serious'
              ? 'warning'
              : 'warning',
        title: evaluation.headline,
        detail: evaluation.detail,
        href: '/budget-alerts',
        action: 'Review alerts',
        at: report.generatedAt,
        client: domain,
      });
    }
  }

  /* ── Automations whose last reported run failed ───────────────────── */
  for (const automation of automations) {
    const latest = runs[automation.id]?.[0];
    if (!latest || latest.ok) continue;
    items.push({
      id: `failed:${automation.id}`,
      kind: 'failed',
      severity: 'critical',
      title: `${automation.name} failed its last run`,
      detail: latest.note ?? 'The runner reported a failure with no detail.',
      href: '/automations',
      action: 'Open registry',
      at: latest.at,
    });
  }

  /*
   * Live automations that have never reported. One row, not one per
   * automation — it is a single piece of wiring, and listing each would bury
   * everything else on the day the queue is first opened.
   */
  const silent = automations.filter(
    (automation) => automation.status === 'live' && !runs[automation.id]?.length,
  );
  if (silent.length > 0) {
    items.push({
      id: 'reporting:silent',
      kind: 'reporting',
      severity: 'info',
      title: `${silent.length} live automation${silent.length === 1 ? '' : 's'} never reported a run`,
      detail:
        `${silent
          .slice(0, 3)
          .map((automation) => automation.name)
          .join(', ')}${silent.length > 3 ? ` and ${silent.length - 3} more` : ''}. ` +
        'Until each posts to the run endpoint, this page cannot tell a healthy automation from a dead one.',
      href: '/automations',
      action: 'See how to report',
      });
  }

  /*
   * Clients with a provider account missing.
   *
   * Only meaningful with more than one client on the roster: a single client
   * still inherits the environment ids, so a blank field there is not a gap.
   */
  if (clients.length > 1) {
    for (const client of clients) {
      const missing = [
        !client.ga4PropertyId && 'GA4 property',
        !client.adsCustomerId && 'Google Ads customer ID',
      ].filter(Boolean) as string[];
      if (missing.length === 0) continue;

      items.push({
        id: `setup:${client.id}`,
        kind: 'setup',
        severity: 'info',
        title: `${client.name} has no ${missing[0]}`,
        detail:
          missing.length > 1
            ? `Missing ${missing.join(' and ')}. Those panels stay empty for this client until the ids are saved.`
            : `That panel stays empty for this client until the id is saved in Client integrations.`,
        href: '/settings',
        action: 'Open settings',
        client: client.domain,
      });
    }
  }

  items.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    // Newest first within a severity; undated items sort last.
    return (b.at ?? '').localeCompare(a.at ?? '');
  });

  return {
    items,
    counts: {
      total: items.length,
      critical: items.filter((item) => item.severity === 'critical').length,
      warning: items.filter((item) => item.severity === 'warning').length,
      info: items.filter((item) => item.severity === 'info').length,
    },
    clientsAffected: new Set(items.map((item) => item.client).filter(Boolean)).size,
    pendingSources: [
      'Article drafts awaiting approval',
      'Review replies awaiting sign-off',
      'Social posts scheduled to publish',
    ],
  };
}
