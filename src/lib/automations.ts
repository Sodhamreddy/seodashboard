/**
 * The automation registry's shape, with no filesystem in sight.
 *
 * Split from `providers/automations.ts` deliberately: the registry editor is a
 * client component, and importing a *value* — even a string array of category
 * names — from the provider module would pull `store.ts`, and therefore
 * `node:fs/promises`, into the browser bundle. Types and constants live here;
 * anything that reads or writes `.data/` lives there.
 */

export type AutomationStatus = 'live' | 'building' | 'planned' | 'paused';

export const AUTOMATION_CATEGORIES = ['Agents', 'Workflows', 'Dashboard tools'] as const;
export type AutomationCategory = (typeof AUTOMATION_CATEGORIES)[number];

/** Ascending by how much attention the state deserves. */
export const AUTOMATION_STATUSES: AutomationStatus[] = ['live', 'building', 'planned', 'paused'];

export const AUTOMATION_STATUS_LABEL: Record<AutomationStatus, string> = {
  live: 'Live',
  building: 'Building',
  planned: 'Planned',
  paused: 'Paused',
};

export type Automation = {
  /** Stable slug — the id a runner reports against, so it must not churn. */
  id: string;
  name: string;
  category: AutomationCategory;
  description: string;
  status: AutomationStatus;
  /** Clients this is implemented for. */
  clients: number;
  /** Human-readable cadence: "Daily 09:30", "On demand", "Monthly". */
  schedule: string;
  /** The page in this dashboard, when the tool is one of them. */
  href?: string;
  /** Where it runs when it is not this app. */
  externalUrl?: string;
  notes?: string;
};

export type AutomationRun = {
  at: string;
  ok: boolean;
  durationMs?: number;
  note?: string;
};

export type AutomationRegistry = {
  updatedAt: string;
  automations: Automation[];
};

/** id → most recent runs, newest first. */
export type AutomationRunLog = Record<string, AutomationRun[]>;

export type AutomationSummary = {
  total: number;
  live: number;
  inProgress: number;
  paused: number;
  /** Total client implementations across every automation. */
  implementations: number;
  /** Automations whose most recent reported run failed. */
  failing: number;
  /** Automations with any reported run at all. */
  reporting: number;
};

/** Pure, so both the page and the API can call it without touching the store. */
export function summarise(
  automations: Automation[],
  runs: AutomationRunLog,
): AutomationSummary {
  const latest = (id: string) => runs[id]?.[0];

  return {
    total: automations.length,
    live: automations.filter((entry) => entry.status === 'live').length,
    inProgress: automations.filter(
      (entry) => entry.status === 'building' || entry.status === 'planned',
    ).length,
    paused: automations.filter((entry) => entry.status === 'paused').length,
    implementations: automations.reduce((sum, entry) => sum + (entry.clients || 0), 0),
    failing: automations.filter((entry) => latest(entry.id)?.ok === false).length,
    reporting: automations.filter((entry) => !!latest(entry.id)).length,
  };
}
