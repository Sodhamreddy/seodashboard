/**
 * SERP Agent results — types only.
 *
 * The agent itself runs outside this app: it queries Google, finds the site
 * and reports back. The dashboard is where those results are *read*, which is
 * the half that was missing — a rank tracker whose output lives in a log file
 * nobody opens is a rank tracker nobody uses.
 *
 * Pushed, not polled, for the same reason the automation registry is: the
 * runner is not this process, has its own schedule, and knows things this app
 * cannot see (device, location, which SERP feature the result sat in).
 *
 * Split from the provider so the client components can import these without
 * dragging `node:fs/promises` into the browser bundle.
 */

export type SerpDevice = 'desktop' | 'mobile';

export type SerpResult = {
  keyword: string;
  /** 1-based rank. Null means the agent looked and did not find the site. */
  position: number | null;
  /** The ranking URL, when the agent reports one. */
  url?: string;
  /** Where the agent saw it last time, so movement survives a gap in history. */
  previousPosition?: number | null;
  /** SERP features the result sat in: 'local-pack', 'ai-overview', 'featured'. */
  features?: string[];
};

export type SerpSnapshot = {
  domain: string;
  at: string;
  /** Free text from the agent: 'google', 'google-uk', 'bing'. */
  engine: string;
  device: SerpDevice;
  /** Where the agent searched from, when it localises. */
  location?: string;
  results: SerpResult[];
};

export type SerpStore = {
  domain: string;
  /** Oldest first, capped — the series behind the movement column. */
  snapshots: SerpSnapshot[];
};

export type SerpRow = SerpResult & {
  /** Position in the previous snapshot; null when it was absent or is new. */
  before: number | null;
  /** Negative is an improvement: rank 8 → 3 is −5. Null when incomparable. */
  change: number | null;
  isNew: boolean;
  lost: boolean;
};

export type SerpSummary = {
  tracked: number;
  ranking: number;
  top3: number;
  top10: number;
  /** Mean of the ranking keywords only; null when none rank. */
  averagePosition: number | null;
  improved: number;
  declined: number;
  lost: number;
  gained: number;
};

/** Ranks the latest snapshot against the one before it. */
export function compareSnapshots(
  latest: SerpSnapshot | undefined,
  previous: SerpSnapshot | undefined,
): { rows: SerpRow[]; summary: SerpSummary } {
  const rows: SerpRow[] = [];
  if (!latest) {
    return {
      rows,
      summary: {
        tracked: 0,
        ranking: 0,
        top3: 0,
        top10: 0,
        averagePosition: null,
        improved: 0,
        declined: 0,
        lost: 0,
        gained: 0,
      },
    };
  }

  const before = new Map(
    (previous?.results ?? []).map((result) => [result.keyword.toLowerCase(), result]),
  );

  for (const result of latest.results) {
    const prior = before.get(result.keyword.toLowerCase());
    /*
     * The agent's own `previousPosition` wins when it sends one: it may have
     * run more often than the dashboard was pushed to, and it knows its own
     * history better than a diff of two stored snapshots does.
     */
    const priorPosition =
      result.previousPosition !== undefined ? result.previousPosition : (prior?.position ?? null);

    const change =
      result.position !== null && priorPosition !== null ? result.position - priorPosition : null;

    rows.push({
      ...result,
      before: priorPosition,
      change,
      isNew: result.position !== null && priorPosition === null,
      lost: result.position === null && priorPosition !== null,
    });
  }

  const ranking = rows.filter((row) => row.position !== null);

  return {
    rows,
    summary: {
      tracked: rows.length,
      ranking: ranking.length,
      top3: ranking.filter((row) => (row.position ?? 99) <= 3).length,
      top10: ranking.filter((row) => (row.position ?? 99) <= 10).length,
      averagePosition: ranking.length
        ? Number(
            (
              ranking.reduce((sum, row) => sum + (row.position ?? 0), 0) / ranking.length
            ).toFixed(1),
          )
        : null,
      improved: rows.filter((row) => row.change !== null && row.change < 0).length,
      declined: rows.filter((row) => row.change !== null && row.change > 0).length,
      lost: rows.filter((row) => row.lost).length,
      gained: rows.filter((row) => row.isNew).length,
    },
  };
}

/** Average position per snapshot, for the trend line. */
export function serpTrend(snapshots: SerpSnapshot[]) {
  return snapshots.map((snapshot) => {
    const ranking = snapshot.results.filter((result) => result.position !== null);
    return {
      date: snapshot.at.slice(0, 10),
      averagePosition: ranking.length
        ? Number(
            (
              ranking.reduce((sum, result) => sum + (result.position ?? 0), 0) / ranking.length
            ).toFixed(1),
          )
        : null,
      top10: ranking.filter((result) => (result.position ?? 99) <= 10).length,
    };
  });
}
