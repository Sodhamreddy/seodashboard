import { backlinkSnapshotPath, readJson, writeJson } from '../store';

/**
 * Backlink history, earned by snapshotting rather than bought from an index.
 *
 * Crawly returns a profile as it stands today: referring domains, link counts,
 * quality band, toxic flags. It has no history at all, so the page had nothing
 * to say about new, lost or live links and hid those panels — which left the
 * two questions an operator actually asks ("what did we win, what did we
 * lose") permanently unanswered.
 *
 * Nothing new is fetched to fix that. The profile is already pulled on every
 * uncached render; this keeps one snapshot per day and diffs consecutive ones.
 * The first run can only say "today"; the second earns a real delta, and from
 * there the series grows. That is slower than buying a vendor with history,
 * and it is measured rather than modelled.
 *
 * What this still cannot produce, because the index does not carry it: anchor
 * text, dofollow/nofollow, per-link page authority, first-seen dates. Those
 * need a second source, and are left empty rather than estimated.
 */

/** One referring domain as it stood in a snapshot. */
export type SnapshotDomain = {
  /** Source domain. */
  d: string;
  /** Quality band at the time — kept so a lost domain can still be described. */
  r: string;
  /** Toxic or suspicious at the time. */
  t: boolean;
};

export type BacklinkSnapshot = {
  /** ISO timestamp of the capture. */
  at: string;
  referringDomains: number;
  totalLinks: number;
  domains: SnapshotDomain[];
};

export type BacklinkHistory = {
  domain: string;
  snapshots: BacklinkSnapshot[];
};

export type LostDomain = SnapshotDomain & { lastSeen: string };

export type HistoryDiff = {
  /** How many snapshots exist — 0 or 1 means no delta can be shown yet. */
  points: number;
  /** When the comparison baseline was captured. */
  comparedWith?: string;
  /** Domains present now that were absent in the previous snapshot. */
  newDomains: Set<string>;
  /** Domains present in the previous snapshot and gone now. */
  lostDomains: LostDomain[];
  referringDomainsDelta: number;
  totalLinksDelta: number;
  trend: { date: string; referringDomains: number; backlinks: number }[];
  flow: { month: string; gained: number; lost: number; net: number }[];
};

/*
 * Three months of daily points. Enough for the trend panel and the monthly
 * flow chart, and small enough that the file stays a file — a few hundred
 * referring domains per snapshot is tens of KB, not megabytes.
 */
const MAX_SNAPSHOTS = 90;

const EMPTY_DIFF: HistoryDiff = {
  points: 0,
  newDomains: new Set(),
  lostDomains: [],
  referringDomainsDelta: 0,
  totalLinksDelta: 0,
  trend: [],
  flow: [],
};

export async function loadBacklinkHistory(domain: string): Promise<BacklinkHistory> {
  return readJson<BacklinkHistory>(backlinkSnapshotPath(domain), { domain, snapshots: [] });
}

/**
 * Stores today's profile and returns the history including it.
 *
 * One snapshot per calendar day: a re-render an hour later replaces the day's
 * entry rather than adding a second point, so the trend is a daily series and
 * a busy afternoon of page views cannot inflate it.
 */
export async function recordBacklinkSnapshot(
  domain: string,
  snapshot: BacklinkSnapshot,
): Promise<BacklinkHistory> {
  const history = await loadBacklinkHistory(domain);
  const day = snapshot.at.slice(0, 10);

  const kept = history.snapshots.filter((entry) => entry.at.slice(0, 10) !== day);
  const next: BacklinkHistory = {
    domain,
    snapshots: [...kept, snapshot]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-MAX_SNAPSHOTS),
  };

  await writeJson(backlinkSnapshotPath(domain), next);
  return next;
}

/** Diffs the newest snapshot against the one before it, plus the full series. */
export function diffBacklinkHistory(history: BacklinkHistory): HistoryDiff {
  const snapshots = history.snapshots;
  if (snapshots.length === 0) return EMPTY_DIFF;

  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  const trend = snapshots.map((snapshot) => ({
    date: snapshot.at.slice(0, 10),
    referringDomains: snapshot.referringDomains,
    backlinks: snapshot.totalLinks,
  }));

  /*
   * Gained and lost per consecutive pair, then grouped by month. Grouping the
   * pairs rather than comparing month-end to month-end means a domain that
   * arrived and left inside one month still shows in both directions, which is
   * the churn the chart exists to reveal.
   */
  const byMonth = new Map<string, { gained: number; lost: number }>();
  for (let index = 1; index < snapshots.length; index += 1) {
    const before = new Set(snapshots[index - 1].domains.map((entry) => entry.d));
    const after = new Set(snapshots[index].domains.map((entry) => entry.d));
    const month = snapshots[index].at.slice(0, 7);
    const bucket = byMonth.get(month) ?? { gained: 0, lost: 0 };

    for (const name of after) if (!before.has(name)) bucket.gained += 1;
    for (const name of before) if (!after.has(name)) bucket.lost += 1;
    byMonth.set(month, bucket);
  }

  const flow = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, counts]) => ({
      month: `${month}-01`,
      gained: counts.gained,
      lost: counts.lost,
      net: counts.gained - counts.lost,
    }));

  if (!previous) {
    return { ...EMPTY_DIFF, points: 1, trend, flow };
  }

  const before = new Map(previous.domains.map((entry) => [entry.d, entry]));
  const after = new Set(latest.domains.map((entry) => entry.d));

  const newDomains = new Set(
    latest.domains.map((entry) => entry.d).filter((name) => !before.has(name)),
  );
  const lostDomains: LostDomain[] = previous.domains
    .filter((entry) => !after.has(entry.d))
    .map((entry) => ({ ...entry, lastSeen: previous.at }));

  return {
    points: snapshots.length,
    comparedWith: previous.at,
    newDomains,
    lostDomains,
    referringDomainsDelta: latest.referringDomains - previous.referringDomains,
    totalLinksDelta: latest.totalLinks - previous.totalLinks,
    trend,
    flow,
  };
}
