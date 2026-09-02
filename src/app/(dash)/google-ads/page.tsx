import type { Metadata } from 'next';
import Link from 'next/link';
import { ChartFrame, MagnitudeBars, SimpleTable, TrendLine } from '@/components/charts/Charts';
import { SERIES } from '@/lib/chart-palette';
import { CampaignTable } from '@/components/panels/CampaignTable';
import { SearchTermsTable } from '@/components/panels/SearchTermsTable';
import { Meter, StatTile } from '@/components/ui/data';
import { Button, Card, CardHeader, EmptyState, Note, SectionHeading } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { compactNumber, currency, number, percent, shortDate } from '@/lib/format';
import { getAdsReport } from '@/lib/providers/ads';

export const metadata: Metadata = { title: 'Google Ads Performance' };
export const dynamic = 'force-dynamic';

export default async function GoogleAdsPage() {
  const domain = getActiveDomain();
  const report = await getAdsReport(domain, 30);

  // Seeding is suppressed for a client with no Ads account, so there is
  // nothing to render here — see AdsReport.available.
  if (!report.available) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="bars"
          title="No Google Ads account for this client"
          description={report.provider.note}
          action={
            <Link href="/settings">
              <Button size="sm" icon="settings">
                Open Settings
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {report.provider.mode === 'seed' && (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Seeded Google Ads data for {domain}.</span>{' '}
          {report.provider.note}
        </Note>
      )}

      {/* ── Account KPIs ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Spend (30d)"
          value={currency(report.summary.spend)}
          delta={report.summary.spendDelta}
          deltaLabel="vs prior 30d"
          icon="bars"
          spark={report.daily.map((day) => day.spend)}
        />
        <StatTile
          label="Conversions"
          value={number(report.summary.conversions, 1)}
          delta={report.summary.conversionsDelta}
          deltaLabel="vs prior 30d"
          icon="target"
          spark={report.daily.map((day) => day.conversions)}
        />
        <StatTile
          label="CTR"
          value={percent(report.summary.ctr, 2)}
          footnote={`${number(report.summary.clicks)} clicks from ${compactNumber(report.summary.impressions)} impressions`}
          icon="search"
        />
        <StatTile
          label="ROAS"
          value={`${report.summary.roas.toFixed(2)}×`}
          footnote={`${currency(report.summary.conversionValue)} value · ${currency(report.summary.cpa)} CPA`}
          icon="shield"
        />
      </div>

      {/* ── Trends ──────────────────────────────────────────────────── */}
      <section className="grid items-start gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ChartFrame
          title="Daily spend and conversions"
          subtitle="Two measures on separate charts rather than a second y-axis — see the toggle for exact values"
          series={[{ key: 'spend', label: 'Spend', color: SERIES[0] }]}
          table={
            <SimpleTable
              headers={['Date', 'Spend', 'Clicks', 'Conversions']}
              rows={report.daily.map((day) => [
                shortDate(day.date),
                currency(day.spend, 2),
                day.clicks,
                day.conversions,
              ])}
            />
          }
        >
          <div className="space-y-4">
            <TrendLine
              data={report.daily}
              xKey="date"
              xFormat="date"
              yFormat="compact"
              height={168}
              area
              series={[
                {
                  key: 'spend',
                  label: 'Spend',
                  color: SERIES[0],
                  format: 'currency2',
                },
              ]}
            />
            <div className="border-t border-hairline pt-3">
              <p className="mb-1 text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
                Conversions
              </p>
              <TrendLine
                data={report.daily}
                xKey="date"
                xFormat="date"
                height={132}
                area
                series={[
                  {
                    key: 'conversions',
                    label: 'Conversions',
                    color: SERIES[2],
                    format: 'decimal1',
                  },
                ]}
              />
            </div>
          </div>
        </ChartFrame>

        <Card>
          <CardHeader
            icon="bell"
            title="Month-to-date pacing"
            subtitle="Spend against the summed monthly budget"
            action={
              <Link href="/budget-alerts" className="text-2xs text-accent underline underline-offset-2">
                Alert rules
              </Link>
            }
          />
          <div className="space-y-4">
            <Meter
              value={report.summary.spendMtd}
              max={report.summary.monthlyBudget}
              label="Account total"
              valueLabel={`${currency(report.summary.spendMtd)} / ${currency(report.summary.monthlyBudget)}`}
              tone="accent"
            />
            <dl className="grid grid-cols-2 gap-4 border-t border-hairline pt-4">
              <div>
                <dt className="text-2xs uppercase tracking-[0.06em] text-ink-muted">Customer ID</dt>
                <dd className="mt-0.5 text-sm font-medium tnum text-ink">{report.customerId}</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-[0.06em] text-ink-muted">Avg CPC</dt>
                <dd className="mt-0.5 text-sm font-medium tnum text-ink">
                  {currency(report.summary.cpc, 2)}
                </dd>
              </div>
            </dl>

            <div className="border-t border-hairline pt-4">
              <p className="mb-2 text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
                Spend by device
              </p>
              <ul className="space-y-2">
                {report.devices.map((device) => (
                  <li key={device.device}>
                    <Meter
                      value={device.spend}
                      max={report.summary.spend}
                      label={device.device}
                      valueLabel={currency(device.spend)}
                      tone="accent"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Campaign + search term detail ───────────────────────────── */}
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Conversions by campaign"
          subtitle={`Top 10 of ${report.conversionsByCampaign.length} by conversions, last 30 days`}
          table={
            <SimpleTable
              headers={['Campaign', 'Conversions', 'Spend']}
              rows={report.conversionsByCampaign
                .slice(0, 10)
                .map((row) => [row.name, row.conversions, currency(row.spend)])}
            />
          }
        >
          <MagnitudeBars
            data={report.conversionsByCampaign.slice(0, 10).map((row) => ({
              label: row.name.replace(/ — /g, ' · '),
              value: row.conversions,
            }))}
            valueFormat="decimal1"
          />
        </ChartFrame>

        <Card padded={false}>
          <div className="p-5 pb-2">
            <CardHeader
              icon="search"
              title="Top search terms by cost"
              subtitle="What people actually typed — the negative-keyword shortlist starts here"
            />
          </div>
          <SearchTermsTable searchTerms={report.searchTerms} />
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Campaigns"
          subtitle={`Account ${report.customerId} · last ${report.rangeDays} days`}
        />
        <CampaignTable campaigns={report.campaigns} />
      </section>
    </div>
  );
}
