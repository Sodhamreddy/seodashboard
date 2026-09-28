import type { SerpSnapshot, SerpStore } from '../serp';
import { readJson, serpSnapshotPath, writeJson } from '../store';

/**
 * Storage for SERP Agent snapshots.
 *
 * Sixty per domain: two months of a daily agent, enough for the trend and the
 * movement column, small enough to stay a JSON file. A run on the same day
 * *for the same engine and device* replaces that day's entry, so an agent
 * retrying after a failure cannot inflate the series.
 */

const MAX_SNAPSHOTS = 60;

export async function loadSerp(domain: string): Promise<SerpStore> {
  return readJson<SerpStore>(serpSnapshotPath(domain), { domain, snapshots: [] });
}

export async function recordSerp(snapshot: SerpSnapshot): Promise<SerpStore> {
  const store = await loadSerp(snapshot.domain);
  const key = (entry: SerpSnapshot) => `${entry.at.slice(0, 10)}|${entry.engine}|${entry.device}`;

  const next: SerpStore = {
    domain: snapshot.domain,
    snapshots: [...store.snapshots.filter((entry) => key(entry) !== key(snapshot)), snapshot]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-MAX_SNAPSHOTS),
  };

  await writeJson(serpSnapshotPath(snapshot.domain), next);
  return next;
}
