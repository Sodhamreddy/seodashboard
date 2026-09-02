import type { Metadata } from 'next';
import { ChartFrame, DistributionStrip, MagnitudeBars, SimpleTable, TrendLine } from '@/components/charts/Charts';
import { SERIES } from '@/lib/chart-palette';
import { KeywordTable } from '@/components/panels/KeywordTable';
import { Badge, Card, CardHeader, Note, SectionHeading } from '@/components/ui/primitives';
import { Delta, StatTile } from '@/components/ui/data';
import { getActiveDomain } from '@/lib/domain';
import { number, percent, shortDate } from '@/lib/format';
import { getKeywordReport } from '@/lib/providers/keywords';

export const metadata: Metadata = { title: 'Keyword Monitoring' };
export const dynamic = 'force-dynamic';

export default async function KeywordsPage() {
  const domain = getActiveDomain();
  const report = await getKeywordReport(domain);

  return (
    <div className="space-y-6">
      {report.provider.mode === 'seed' ? (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Seeded rank data for {domain}.</span> {report.provider.note}
        </Note>
      ) : (
        <Note tone="good" icon="check">
          <span className="font-semibold">Live Search Console data for {report.propertyUrl}.</span>{' '}
          Positions, clicks, impressions and CTR are measured over the last 28 days (Search Console
          lags ~2 days). Search volume, difficulty and CPC need a paid rank tracker and are shown as
          “—”.
        </Note>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Search visibility"
          value={percent(report.summary.visibility)}
          delta={report.summary.visibilityDelta}
          deltaSuffix="pt"
          deltaLabel="wk/wk"
          icon="search"
          spark={report.visibilityTrend.map((point) => point.visibility)}
        />
        <StatTile
          label="Top 3 / Top 10"
          value={`${report.summary.top3} / ${report.summary.top10}`}
          footnote={`${report.summary.tracked} keywords tracked`}
          icon="target"
        />
        <StatTile
          label="Average position"
          value={report.summary.averagePosition}
          footnote={`${report.summary.top100} of ${report.summary.tracked} rank in the top 100`}
          icon="bars"
        />
        {report.source === 'gsc' ? (
          <StatTile
            label="Clicks (28d)"
            value={number(report.summary.clicks ?? 0)}
            delta={report.summary.clicksDelta}
            deltaLabel="vs prior 28d"
            footnote={`${number(report.summary.impressions ?? 0)} impressions · ${percent(report.summary.ctr ?? 0, 2)} CTR`}
            icon="target"
          />
        ) : (
          <StatTile
            label="Movement this week"
            value={`${report.summary.improved} up`}
            footnote={`${report.summary.declined} down · ${report.summary.unchanged} flat · ${report.summary.lostRankings} dropped out`}
            icon="refresh"
          />
        )}
      </div>

      <Card>
        <CardHeader
          icon="sparkles"
          title={report.source === 'gsc' ? 'Striking-distance opportunities' : 'Keyword suggestions'}
          subtitle={
            report.source === 'gsc'
              ? 'Real queries already ranking 11–30 — the shortest path to page-one traffic, ordered by impressions'
              : 'Untracked terms worth adding — not the tracked set below, the opportunity list'
          }
        />
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {report.keywordSuggestions.map((suggestion) => (
            <li
              key={suggestion.keyword}
              className="rounded-lg border border-hairline p-3 transition-colors hover:bg-surface-sunken"
            >
              <p className="truncate text-xs font-medium text-ink" title={suggestion.keyword}>
                {suggestion.keyword}
              </p>
              <p className="mt-0.5 truncate text-2xs text-ink-muted" title={suggestion.reason}>
                {suggestion.reason}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-2xs tnum text-ink-secondary">
                  {report.source === 'gsc'
                    ? `${number(suggestion.volume)} impressions`
                    : `${number(suggestion.volume)}/mo · $${suggestion.cpc.toFixed(2)} CPC`}
                </span>
                <Badge tone={suggestion.intent === 'transactional' ? 'accent' : 'neutral'} icon={null}>
                  {suggestion.intent}
                </Badge>
              </div>
              {/* Difficulty is a rank-tracker metric; Search Console has none. */}
              {report.source !== 'gsc' && (
                <div className="mt-2 flex items-center gap-1.5" title={`Difficulty ${suggestion.difficulty}`}>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${suggestion.difficulty}%`,
                        background:
                          suggestion.difficulty >= 70
                            ? 'var(--seq-700)'
                            : suggestion.difficulty >= 50
                              ? 'var(--seq-550)'
                              : suggestion.difficulty >= 30
                                ? 'var(--seq-400)'
                                : 'var(--seq-250)',
                      }}
                    />
                  </span>
                  <span className="shrink-0 text-2xs tnum text-ink-muted">{suggestion.difficulty} KD</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <section className="grid items-start gap-4 xl:grid-cols-[1.3fr_1fr]">
        <ChartFrame
          title="Search visibility trend"
          subtitle="Share of the available top-10 clicks across every tracked keyword, weighted by volume"
          table={
            <SimpleTable
              headers={['Week of', 'Visibility %']}
              rows={report.visibilityTrend.map((point) => [shortDate(point.date), point.visibility])}
            />
          }
        >
          <TrendLine
            data={report.visibilityTrend}
            xKey="date"
            xFormat="date"
            yFormat="percent0"
            area
            series={[
              {
                key: 'visibility',
                label: 'Visibility',
                color: SERIES[0],
                format: 'percent',
              },
            ]}
          />
        </ChartFrame>

        <Card>
          <CardHeader
            icon="layers"
            title="Position distribution"
            subtitle="Where the tracked set currently sits"
          />
          <DistributionStrip
            buckets={report.distribution.map((bucket) => ({
              label: bucket.bucket,
              count: bucket.count,
            }))}
            total={report.summary.tracked}
          />
        </Card>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon="refresh"
            title="Biggest movers"
            subtitle="Largest absolute position change since last week"
          />
          <ul className="space-y-2">
            {report.movers.map((mover) => (
              <li
                key={mover.keyword}
                className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0"
              >
                <span className="min-w-0 truncate text-xs text-ink" title={mover.keyword}>
                  {mover.keyword}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-2xs tnum text-ink-muted">
                    now {mover.position ?? '100+'}
                  </span>
                  <Delta value={mover.change} suffix="" />
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <ChartFrame
          title={report.source === 'gsc' ? 'Impressions by search intent' : 'Volume by search intent'}
          subtitle="Where the demand actually sits"
          table={
            <SimpleTable
              headers={[
                'Intent',
                report.source === 'gsc' ? 'Queries' : 'Keywords',
                report.source === 'gsc' ? 'Impressions' : 'Monthly volume',
              ]}
              rows={report.intentMix.map((entry) => [entry.intent, entry.count, entry.volume])}
            />
          }
        >
          <MagnitudeBars
            data={report.intentMix.map((entry) => ({ label: entry.intent, value: entry.volume }))}
            valueFormat="number"
          />
        </ChartFrame>
      </section>

      <section>
        <SectionHeading
          title="Keyword detail"
          subtitle={`Updated ${new Date(report.generatedAt).toLocaleString()}`}
        />
        <KeywordTable keywords={report.keywords} source={report.source} />
      </section>
    </div>
  );
}
