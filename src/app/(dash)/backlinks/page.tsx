import type { Metadata } from 'next';
import { ChartFrame, DivergingColumns, MagnitudeBars, SimpleTable, TrendLine } from '@/components/charts/Charts';
import { SERIES } from '@/lib/chart-palette';
import { BacklinkTable } from '@/components/panels/BacklinkTable';
import { ReferringDomainsTable } from '@/components/panels/ReferringDomainsTable';
import { StatTile } from '@/components/ui/data';
import { Card, CardHeader, Note, SectionHeading } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { monthLabel, number, percent, shortDate } from '@/lib/format';
import { getBacklinkReport } from '@/lib/providers/backlinks';

export const metadata: Metadata = { title: 'Backlink Tracker' };
export const dynamic = 'force-dynamic';

export default async function BacklinksPage() {
  const domain = getActiveDomain();
  const report = await getBacklinkReport(domain, 90);
  const live = report.source === 'crawly';

  return (
    <div className="space-y-6">
      {report.provider.mode === 'seed' ? (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Seeded backlink data for {domain}.</span> {report.provider.note}{' '}
          The shape below matches what the live adapter returns, so wiring a provider changes no UI.
        </Note>
      ) : (
        <Note tone="good" icon="check">
          <span className="font-semibold">Live Crawly index data for {domain}.</span> Referring
          domains, total links, authority and spam score are measured. Crawly is a snapshot index, so
          it carries no link history, anchor text or dofollow split — those panels are omitted rather
          than estimated. “Authority” is Crawly’s own 0–100 metric, not Moz DA.
        </Note>
      )}

      {/* ── Summary ─────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Referring domains"
          value={number(report.summary.referringDomains)}
          delta={live ? undefined : report.summary.referringDomainsDelta}
          deltaSuffix=""
          deltaLabel="90d"
          icon="link"
          spark={live ? undefined : report.trend.map((point) => point.referringDomains)}
        />
        <StatTile
          label="Total backlinks"
          value={number(report.summary.totalBacklinks)}
          delta={live ? undefined : report.summary.totalBacklinksDelta}
          deltaSuffix=""
          deltaLabel="90d"
          icon="layers"
          spark={live ? undefined : report.trend.map((point) => point.backlinks)}
        />
        {live ? (
          <StatTile
            label="Spam score"
            value={report.summary.spamScore ?? 0}
            footnote={`${report.summary.risk ?? 'Unknown'} risk · ${report.summary.toxicCandidates} flagged domains`}
            icon="shield"
          />
        ) : (
          <StatTile
            label="New / lost links"
            value={`${report.summary.newLinks} / ${report.summary.lostLinks}`}
            footnote={`${report.summary.uniqueDomains} unique domains in the sample`}
            icon="refresh"
          />
        )}
        <StatTile
          label={live ? 'Crawly authority' : 'Average DA'}
          value={report.summary.averageDomainAuthority}
          footnote={
            live
              ? `${number(report.summary.uniqueDomains)} referring domains sampled`
              : `${percent(report.summary.dofollowShare)} dofollow · ${report.summary.toxicCandidates} toxic candidates`
          }
          icon="shield"
        />
      </div>

      {/* ── Growth ──────────────────────────────────────────────────────
          Both panels are time series, and the live index has no history, so
          they are omitted in live mode instead of drawing a flat or invented
          line. Snapshotting these over time is the way to earn them back. */}
      {!live && (
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Referring domain growth"
          subtitle="Weekly points across the last 90 days"
          series={[
            { key: 'referringDomains', label: 'Referring domains', color: SERIES[0] },
            { key: 'backlinks', label: 'Total backlinks', color: SERIES[1] },
          ]}
          table={
            <SimpleTable
              headers={['Week of', 'Referring domains', 'Backlinks']}
              rows={report.trend.map((point) => [
                shortDate(point.date),
                point.referringDomains,
                point.backlinks,
              ])}
            />
          }
        >
          <TrendLine
            data={report.trend}
            xKey="date"
            xFormat="date"
            series={[
              {
                key: 'referringDomains',
                label: 'Referring domains',
                color: SERIES[0],
                format: 'number',
              },
              {
                key: 'backlinks',
                label: 'Total backlinks',
                color: SERIES[1],
                format: 'number',
              },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title="Links gained and lost"
          subtitle="Gained above the baseline, lost below it — net movement is the difference"
          series={[
            { key: 'gained', label: 'Gained', color: 'var(--div-pos)' },
            { key: 'lostNegative', label: 'Lost', color: 'var(--div-neg)' },
          ]}
          table={
            <SimpleTable
              headers={['Month', 'Gained', 'Lost', 'Net']}
              rows={report.flow.map((row) => [monthLabel(row.month), row.gained, row.lost, row.net])}
            />
          }
        >
          <DivergingColumns
            data={report.flow.map((row) => ({
              month: row.month,
              gained: row.gained,
              lostNegative: -row.lost,
            }))}
            xKey="month"
            xFormat="month"
            positive={{ key: 'gained', label: 'Gained', color: 'var(--div-pos)' }}
            negative={{ key: 'lostNegative', label: 'Lost', color: 'var(--div-neg)' }}
          />
        </ChartFrame>
      </section>
      )}

      {/* ── Authority + anchors ─────────────────────────────────────── */}
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <ChartFrame
          title={live ? 'Quality distribution' : 'Authority distribution'}
          subtitle={
            live
              ? 'Referring domains by the index’s own quality band'
              : 'Referring pages by Domain Authority band'
          }
          table={
            <SimpleTable
              headers={['Band', live ? 'Domains' : 'Links']}
              rows={report.authorityBuckets.map((bucket) => [bucket.bucket, bucket.count])}
            />
          }
        >
          <MagnitudeBars
            data={report.authorityBuckets.map((bucket) => ({
              label: bucket.bucket,
              value: bucket.count,
            }))}
            valueFormat="number"
          />
        </ChartFrame>

        {live ? (
          /*
           * Anchor text is not in this index, so this slot shows what the index
           * does measure: the strongest referring domains. Ranked by quality
           * band, then by harmonic rank (smaller is stronger, 0 = unranked).
           *
           * Deliberately NOT "most links": most profiles have one link per
           * domain, which made every bar render full-width and read as a bug.
           * The bar encodes the quality band, which actually varies.
           */
          <Card>
            <CardHeader
              icon="link"
              title="Strongest referring domains"
              subtitle="Ranked by the index’s quality band, then by harmonic rank"
            />
            <ul className="space-y-2.5">
              {[...report.referringDomainRows]
                .sort((a, b) => {
                  const strength = (rating: string) =>
                    ({ High: 3, Medium: 2, Low: 1 })[rating] ?? 0;
                  if (strength(b.rating) !== strength(a.rating)) {
                    return strength(b.rating) - strength(a.rating);
                  }
                  const rank = (value: number) => (value > 0 ? value : Number.MAX_SAFE_INTEGER);
                  return rank(a.harmonicRank) - rank(b.harmonicRank);
                })
                .slice(0, 8)
                .map((row) => {
                  const bandWidth = { High: 100, Medium: 60, Low: 28 }[row.rating] ?? 12;
                  return (
                    <li key={row.sourceDomain}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate text-ink" title={row.sourceDomain}>
                          {row.sourceDomain}
                        </span>
                        <span className="shrink-0 tnum text-ink-secondary">
                          {row.rating}
                          {row.links > 1 ? ` · ${row.links} links` : ''}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-seq-400"
                          style={{ width: `${bandWidth}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardHeader
              icon="tag"
              title="Anchor text distribution"
              subtitle="A profile dominated by exact-match or generic anchors is a risk signal"
            />
            <ul className="space-y-2.5">
              {report.topAnchors.map((anchor) => (
                <li key={anchor.anchor}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-ink" title={anchor.anchor}>
                      {anchor.anchor}
                    </span>
                    <span className="shrink-0 tnum text-ink-secondary">
                      {anchor.count} · {anchor.share}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-seq-400"
                      style={{ width: `${Math.min(100, anchor.share * 4)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        {live ? (
          <>
            <SectionHeading
              title="Referring domains"
              subtitle={`${report.referringDomainRows.length} of ${number(report.summary.referringDomains)} sampled · generated ${new Date(report.generatedAt).toLocaleString()}`}
            />
            <ReferringDomainsTable rows={report.referringDomainRows} />
          </>
        ) : (
          <>
            <SectionHeading
              title="Every tracked link"
              subtitle={`${report.backlinks.length} rows · generated ${new Date(report.generatedAt).toLocaleString()}`}
            />
            <BacklinkTable backlinks={report.backlinks} />
          </>
        )}
      </section>
    </div>
  );
}
