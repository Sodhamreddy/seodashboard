import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ChartFrame, SimpleTable } from '@/components/charts/ChartShell';
import { TrendLine } from '@/components/charts/Charts';
import { StatTile } from '@/components/ui/data';
import { Badge, Card, Note, cx } from '@/components/ui/primitives';
import { SERIES } from '@/lib/chart-palette';
import { getActiveDomain } from '@/lib/domain';
import { number, relativeTime } from '@/lib/format';
import { loadSerp } from '@/lib/providers/serp';
import { compareSnapshots, serpTrend } from '@/lib/serp';

export const metadata: Metadata = { title: 'SERP Agent' };
export const dynamic = 'force-dynamic';

/**
 * Where the SERP Agent's results are read.
 *
 * The agent runs elsewhere and pushes what it found. That makes this page
 * exact where Keyword Monitoring is averaged: Search Console reports a mean
 * position across every impression over days, while the agent reports the
 * rank it actually saw, on one device, from one location, at one moment. Both
 * are useful and they answer different questions — so this is its own page
 * rather than a column bolted onto the other.
 */
export default async function SerpPage() {
  const domain = getActiveDomain();
  const store = await loadSerp(domain);
  const snapshots = store.snapshots;
  const latest = snapshots[snapshots.length - 1];

  // Compare like with like: the previous run from the same engine and device.
  const previous = latest
    ? [...snapshots]
        .reverse()
        .find(
          (snapshot) =>
            snapshot !== latest &&
            snapshot.engine === latest.engine &&
            snapshot.device === latest.device,
        )
    : undefined;

  const { rows, summary } = compareSnapshots(latest, previous);
  const trend = serpTrend(
    snapshots.filter(
      (snapshot) => snapshot.engine === latest?.engine && snapshot.device === latest?.device,
    ),
  ).filter((point) => point.averagePosition !== null);

  const requestHeaders = headers();
  const proto = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
  const host =
    requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    requestHeaders.get('host')?.trim();
  const origin =
    process.env.APP_ORIGIN?.trim() || (host ? `${proto}://${host}` : 'https://your-dashboard');
  const tokenSet = Boolean(process.env.AUTOMATION_INGEST_TOKEN?.trim());

  // Best first, unranked last — the order someone scans a rank report in.
  const sorted = [...rows].sort(
    (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="space-y-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight text-ink">SERP Agent</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-secondary">
          Exact Google positions for <span className="font-medium text-ink">{domain}</span>, as
          reported by the SERP Agent. Where Keyword Monitoring shows Search Console&rsquo;s averaged
          position, this is the rank the agent actually saw on one device, from one place, at one
          moment.
        </p>
      </header>

      {!latest ? (
        <Card>
          <h2 className="text-sm font-semibold text-ink">Waiting for the first report</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-secondary">
            The SERP Agent has not reported for this client yet. At the end of each run, have it
            post its results here — one call per client:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-hairline bg-surface-sunken p-3 text-2xs leading-relaxed text-ink">
            {`curl -X POST ${origin}/api/serp/runs \\
  -H "authorization: Bearer $AUTOMATION_INGEST_TOKEN" \\
  -H 'content-type: application/json' \\
  -d '{
    "domain": "${domain}",
    "engine": "google",
    "device": "desktop",
    "location": "Detroit, MI",
    "results": [
      { "keyword": "24 hour home care", "position": 4, "url": "https://${domain}/care" },
      { "keyword": "senior care near me", "position": null }
    ]
  }'`}
          </pre>
          <ul className="mt-3 space-y-1 text-2xs leading-relaxed text-ink-muted">
            <li>
              <span className="font-medium text-ink-secondary">position: null</span> means the agent
              searched and the site was not in the results — that is recorded, not skipped.
            </li>
            <li>
              <span className="font-medium text-ink-secondary">previousPosition</span> is optional;
              send it if the agent tracks its own history and it will win over the stored diff.
            </li>
            <li>
              <span className="font-medium text-ink-secondary">domain</span> must match a client on
              the roster exactly.
            </li>
          </ul>
          <div className="mt-3">
            <Badge tone={tokenSet ? 'good' : 'warning'} icon={tokenSet ? 'check' : 'alert'}>
              {tokenSet
                ? 'Ingest token set — endpoint is accepting reports'
                : 'AUTOMATION_INGEST_TOKEN not set — endpoint answers 503 until it is'}
            </Badge>
          </div>
        </Card>
      ) : (
        <>
          <Note tone="good" icon="check">
            <span className="font-semibold">Last report {relativeTime(latest.at)}</span> ·{' '}
            {latest.engine} · {latest.device}
            {latest.location ? ` · ${latest.location}` : ''} · {number(summary.tracked)} keywords
            {previous ? `, compared with ${new Date(previous.at).toLocaleDateString()}` : ' — first report, so no movement yet'}
            .
          </Note>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Average position"
              value={summary.averagePosition?.toString() ?? '—'}
              footnote={`Across ${summary.ranking} ranking keyword${summary.ranking === 1 ? '' : 's'}`}
              icon="target"
              spark={trend.length > 1 ? trend.map((point) => -(point.averagePosition ?? 0)) : undefined}
            />
            <StatTile
              label="Top 3"
              value={number(summary.top3)}
              footnote={`${summary.top10} in the top 10`}
              icon="arrowUp"
            />
            <StatTile
              label="Moved"
              value={previous ? `${summary.improved} ↑ / ${summary.declined} ↓` : '—'}
              footnote={previous ? 'Improved / declined since the last report' : 'Needs a second report'}
              icon="refresh"
            />
            <StatTile
              label="Not found"
              value={number(summary.tracked - summary.ranking)}
              footnote={
                summary.lost > 0
                  ? `${summary.lost} dropped out since the last report`
                  : 'Searched and absent from the results'
              }
              icon="alert"
            />
          </div>

          {trend.length > 1 && (
            <ChartFrame
              title="Average position over time"
              subtitle={`${latest.engine} · ${latest.device} — lower is better`}
              series={[{ key: 'averagePosition', label: 'Average position', color: SERIES[0] }]}
              table={
                <SimpleTable
                  headers={['Date', 'Average position', 'In top 10']}
                  rows={trend.map((point) => [point.date, point.averagePosition ?? '—', point.top10])}
                />
              }
            >
              <TrendLine
                data={trend}
                xKey="date"
                xFormat="date"
                yFormat="decimal1"
                height={200}
                series={[
                  {
                    key: 'averagePosition',
                    label: 'Average position',
                    color: SERIES[0],
                    format: 'decimal1',
                  },
                ]}
              />
            </ChartFrame>
          )}

          <Card padded={false}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-5 py-3.5">
              <h2 className="text-[0.95rem] font-bold text-ink">Keyword positions</h2>
              <p className="text-2xs text-ink-muted">Best rank first · not found last</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead className="bg-surface-sunken">
                  <tr className="text-2xs uppercase tracking-[0.06em] text-ink-secondary">
                    <th scope="col" className="px-5 py-2 font-semibold">Keyword</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Position</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Change</th>
                    <th scope="col" className="px-5 py-2 font-semibold">Ranking URL</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.keyword} className="border-t border-hairline">
                      <td className="px-5 py-2.5">
                        <span className="font-medium text-ink">{row.keyword}</span>
                        {row.features && row.features.length > 0 && (
                          <span className="ml-2 inline-flex flex-wrap gap-1">
                            {row.features.map((feature) => (
                              <span
                                key={feature}
                                className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.62rem] text-ink-muted"
                              >
                                {feature}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">
                        {row.position === null ? (
                          <span className="text-ink-muted">not found</span>
                        ) : (
                          <span
                            className={cx(
                              'font-semibold',
                              row.position <= 3 ? 'text-status-good' : 'text-ink',
                            )}
                          >
                            {row.position}
                          </span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">
                        {row.isNew ? (
                          <Badge tone="good" icon={null}>new</Badge>
                        ) : row.lost ? (
                          <Badge tone="critical" icon={null}>lost</Badge>
                        ) : row.change === null || row.change === 0 ? (
                          <span className="text-ink-muted">—</span>
                        ) : (
                          // Negative is better in rank terms: 8 → 3 reads as ↑5.
                          <span
                            className={cx(
                              'font-medium',
                              row.change < 0 ? 'text-status-good' : 'text-status-critical',
                            )}
                          >
                            {row.change < 0 ? '↑' : '↓'} {Math.abs(row.change)}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[320px] truncate px-5 py-2.5 text-2xs text-ink-secondary">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-accent hover:underline"
                            title={row.url}
                          >
                            {row.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </a>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
