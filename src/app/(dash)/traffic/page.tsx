import type { Metadata } from 'next';
import Link from 'next/link';
import { BarList, ChartFrame, SimpleTable } from '@/components/charts/ChartShell';
import { TrendLine } from '@/components/charts/Charts';
import { SERIES } from '@/lib/chart-palette';
import { RangeFilter } from '@/components/shell/RangeFilter';
import { StatTile } from '@/components/ui/data';
import { Button, EmptyState, Note } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { clockDuration, compactNumber, number, percent } from '@/lib/format';
import { formatWindow, resolveRange } from '@/lib/range';
import { getTrafficReport, halfOverHalfDelta } from '@/lib/providers/traffic';

export const metadata: Metadata = { title: 'Website Traffic' };
export const dynamic = 'force-dynamic';

export default async function TrafficPage({
  searchParams,
}: {
  searchParams?: { range?: string | string[]; from?: string | string[]; to?: string | string[] };
}) {
  const domain = getActiveDomain();
  const range = resolveRange(searchParams?.range, searchParams?.from, searchParams?.to);
  const report = await getTrafficReport(domain, range.days, range.custom);

  const windowLabel =
    report.data && report.data.daily.length > 0
      ? formatWindow(
          report.data.daily[0].date,
          report.data.daily[report.data.daily.length - 1].date,
        )
      : range.label;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight text-ink">Website Traffic</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Google Analytics 4 for <span className="font-medium text-ink">{domain}</span> — sessions,
            audience, channel mix and landing pages.
          </p>
        </div>
        <RangeFilter
          active={range.key}
          windowLabel={windowLabel}
          activeLabel={range.label}
          customWindow={range.custom}
        />
      </header>

      {/*
       * No seeded fallback here on purpose: an empty state that names the fix is
       * more useful than invented sessions, and these figures reach a
       * client-facing PDF.
       */}
      {!report.data ? (
        <EmptyState
          icon="cloud"
          title="Google Analytics 4 is not connected yet"
          description={report.provider.note}
          action={
            <Link href="/settings">
              <Button size="sm" icon="settings">
                Open Settings
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/*
            * A green "live" banner over zeroes is worse than no banner: it was
            * technically true (the API answered) and completely misleading (the
            * property was the wrong one). Zero sessions now reads as a problem
            * to investigate, with the other candidate properties named.
            */}
          {report.data.totals.sessions === 0 ? (
            <Note tone="warning" icon="alert">
              <span className="font-semibold">
                Connected to {report.data.propertyName}, but it reported no sessions.
              </span>{' '}
              {report.data.alternatives.length > 0 ? (
                <>
                  This account has other properties that could match this domain:{' '}
                  {report.data.alternatives
                    .map((alt) => `${alt.displayName} (${alt.id})`)
                    .join(', ')}
                  . Set <code className="font-mono">GA4_PROPERTY_ID</code> to the right one and
                  restart.
                </>
              ) : (
                <>
                  Either tracking is not installed on {domain}, or{' '}
                  <code className="font-mono">GA4_PROPERTY_ID</code> points at the wrong property.
                </>
              )}
            </Note>
          ) : (
            <Note tone="good" icon="check">
              <span className="font-semibold">
                Live from GA4 · {report.data.propertyName}.
              </span>{' '}
              {number(report.data.totals.sessions)} sessions over {report.data.daily.length} days,{' '}
              {windowLabel}.
              {report.data.resolvedBy === 'has-data' && report.data.alternatives.length > 0 && (
                <>
                  {' '}
                  Chosen over {report.data.alternatives.length} similarly-named{' '}
                  {report.data.alternatives.length === 1 ? 'property' : 'properties'} because it is
                  the one with data.
                </>
              )}
            </Note>
          )}

          {/* ── Audience KPIs ───────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Sessions"
              value={number(report.data.totals.sessions)}
              delta={halfOverHalfDelta(report.data.daily.map((day) => day.sessions))}
              deltaLabel="2nd half vs 1st"
              icon="bars"
              spark={report.data.daily.map((day) => day.sessions)}
            />
            <StatTile
              label="Total users"
              value={number(report.data.totals.users)}
              footnote={`${number(report.data.totals.newUsers)} new users`}
              icon="search"
              spark={report.data.daily.map((day) => day.users)}
            />
            <StatTile
              label="Pageviews"
              value={compactNumber(report.data.totals.pageviews)}
              footnote={`${(
                report.data.totals.pageviews / Math.max(1, report.data.totals.sessions)
              ).toFixed(1)} per session`}
              icon="doc"
              spark={report.data.daily.map((day) => day.pageviews)}
            />
            <StatTile
              label="Avg. session"
              value={clockDuration(report.data.totals.avgSessionSeconds * 1000)}
              footnote={`${percent(report.data.totals.bounceRate)} bounce rate`}
              icon="clock"
            />
          </div>

          {/* ── Sessions over time ──────────────────────────────────── */}
          <ChartFrame
            title="Sessions and users"
            subtitle={`Daily, ${windowLabel}`}
            series={[
              { key: 'sessions', label: 'Sessions', color: SERIES[0] },
              { key: 'users', label: 'Users', color: SERIES[1] },
            ]}
          >
            <TrendLine
              data={report.data.daily}
              xKey="date"
              xFormat="date"
              yFormat="number"
              height={230}
              series={[
                { key: 'sessions', label: 'Sessions', color: SERIES[0] },
                { key: 'users', label: 'Users', color: SERIES[1] },
              ]}
            />
          </ChartFrame>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            {/* ── Channel mix ───────────────────────────────────────── */}
            <ChartFrame
              title="Sessions by channel"
              subtitle="Default channel grouping"
            >
              <BarList
                data={report.data.channels.map((channel) => ({
                  label: channel.channel,
                  value: channel.sessions,
                }))}
                valueFormat="number"
              />
            </ChartFrame>

            {/* ── Bounce rate ───────────────────────────────────────── */}
            <ChartFrame
              title="Bounce rate"
              subtitle="Daily, lower is better"
              series={[{ key: 'bounceRate', label: 'Bounce rate', color: SERIES[2] }]}
            >
              <TrendLine
                data={report.data.daily}
                xKey="date"
                xFormat="date"
                yFormat="percent"
                height={200}
                area
                series={[{ key: 'bounceRate', label: 'Bounce rate', color: SERIES[2] }]}
              />
            </ChartFrame>
          </div>

          {/* ── Landing pages ───────────────────────────────────────── */}
          <ChartFrame title="Top landing pages" subtitle="By sessions over the window">
            <SimpleTable
              headers={['Landing page', 'Sessions', 'Bounce rate']}
              rows={report.data.pages.map((page) => [
                page.path,
                number(page.sessions),
                percent(page.bounceRate),
              ])}
            />
          </ChartFrame>
        </>
      )}
    </div>
  );
}
