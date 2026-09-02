import type { Metadata } from 'next';
import Link from 'next/link';
import { BarList } from '@/components/charts/ChartShell';
import { TrendLine } from '@/components/charts/Charts';
import { ExportReportButton } from '@/components/panels/ExportReportButton';
import { Panel } from '@/components/panels/Panel';
import { ToolLauncher } from '@/components/panels/ToolLauncher';
import { RangeFilter } from '@/components/shell/RangeFilter';
import { Delta, Meter, MetricCell, MiniGauge, ScoreGauge, Sparkline } from '@/components/ui/data';
import { Badge, Button, EmptyState, Note, SectionHeading, cx } from '@/components/ui/primitives';
import { SERIES } from '@/lib/chart-palette';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { NAV_ITEMS } from '@/lib/nav';
import { clockDuration, compactNumber, currency, number, percent, truncate } from '@/lib/format';
import { getAdsReport } from '@/lib/providers/ads';
import { evaluateAlerts, loadAlertRules } from '@/lib/providers/alerts';
import { getBacklinkReport } from '@/lib/providers/backlinks';
import { getKeywordReport } from '@/lib/providers/keywords';
import { getTrafficReport, halfOverHalfDelta } from '@/lib/providers/traffic';
import { formatWindow, resolveRange } from '@/lib/range';
import { buildHealth, healthBand } from '@/lib/seo/health';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

const SEVERITY_METER = {
  ok: 'accent',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
} as const;

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: { range?: string | string[]; from?: string | string[]; to?: string | string[] };
}) {
  const domain = getActiveDomain();
  // The window comes off the URL so a shared link carries it; `resolveRange`
  // falls back to 30 days rather than throwing on a hand-edited value.
  const range = resolveRange(searchParams?.range, searchParams?.from, searchParams?.to);

  const [ads, backlinks, keywords, traffic] = await Promise.all([
    getAdsReport(domain, range.days, range.custom),
    getBacklinkReport(domain, range.days),
    getKeywordReport(domain),
    getTrafficReport(domain, range.days, range.custom),
  ]);

  /*
   * No Ads account means no budget to alert on. Evaluating the zeroed report
   * would compare 0 spend against a 0 budget and surface arithmetic, not
   * information.
   */
  const rules = ads.available ? await loadAlertRules(ads) : [];
  const alerts = ads.available ? evaluateAlerts(ads, rules) : [];
  const firing = alerts.filter((alert) => alert.severity !== 'ok');
  const accountAlert = alerts.find((alert) => alert.rule.scope === 'account');

  /*
   * Composite health now lives in `lib/seo/health.ts`, shared with the printed
   * report. It excludes any pillar whose provider is seeded, so the headline
   * can never be part fiction.
   */
  const health = buildHealth(ads, backlinks, keywords);

  // The roster name is what the operator calls this account; the domain alone
  // reads as configuration. Both are shown, name first.
  const activeClient = (await loadClients()).find((entry) => entry.domain === domain);

  // Reporting window straight off the daily series, so the chip never drifts
  // from the data underneath it.
  const reportWindow =
    ads.daily.length > 0
      ? formatWindow(ads.daily[0].date, ads.daily[ads.daily.length - 1].date)
      : range.label;

  const seededPanels = [
    backlinks.provider.mode === 'seed' && 'backlinks',
    keywords.provider.mode === 'seed' && 'keyword rankings',
    ads.provider.mode === 'seed' && 'Google Ads',
  ].filter(Boolean) as string[];

  // Counted, not hardcoded — adding a tool should not leave the copy stale.
  const toolCount = NAV_ITEMS.filter((item) => item.href !== '/dashboard').length;

  const topKeywords = keywords.keywords
    .filter((row) => row.position !== null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* ── Page title block ────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {/* The client is named above the page title, not buried in the
              subtitle: which account these numbers belong to is the first
              thing a reader needs to be certain of. */}
          <p className="mb-1 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.1em] text-accent">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {activeClient?.name ?? domain}
          </p>
          <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[1.75rem]">
            SEO &amp; Marketing Automation
          </h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            {toolCount} tools for <span className="font-medium text-ink">{domain}</span> — ranking,
            links, paid media and on-page health in one place.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <RangeFilter
            active={range.key}
            windowLabel={reportWindow}
            activeLabel={range.label}
            customWindow={range.custom}
          />
          <ExportReportButton
            domain={domain}
            range={range.key}
            customWindow={range.custom}
          />
        </div>
      </header>

      {firing.length > 0 && (
        <Note tone={firing[0].severity === 'critical' ? 'critical' : 'warning'} icon="bell">
          <span className="font-semibold">
            {firing.length} budget alert{firing.length > 1 ? 's' : ''} firing.
          </span>{' '}
          {firing[0].headline}.{' '}
          <Link href="/budget-alerts" className="underline underline-offset-2">
            Review thresholds
          </Link>
        </Note>
      )}

      {/* ── On-page tools lead: each is a live action ────────────────── */}
      <section>
        <SectionHeading
          title="On-page tools"
          subtitle="Run against any URL you supply, live — no provider keys needed"
        />
        <ToolLauncher groups={['On-page tools']} variant="compact" />
      </section>

      {/* ── Website traffic (GA4) ───────────────────────────────────── */}
      <section>
        <Panel
          title="Website Traffic"
          subtitle="Sessions, audience and channel mix from Google Analytics 4"
          icon="bars"
          tone="blue"
          href="/traffic"
        >
          {!traffic.data ? (
            /* Deliberately not seeded — see src/lib/providers/traffic.ts. */
            <EmptyState
              icon="cloud"
              title="Google Analytics 4 is not connected yet"
              description={traffic.provider.note}
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <MetricCell
                  label="Sessions"
                  value={number(traffic.data.totals.sessions)}
                  delta={halfOverHalfDelta(traffic.data.daily.map((day) => day.sessions))}
                />
                <MetricCell label="Users" value={number(traffic.data.totals.users)} />
                <MetricCell
                  label="Pageviews"
                  value={compactNumber(traffic.data.totals.pageviews)}
                />
                <MetricCell
                  label="Bounce rate"
                  value={percent(traffic.data.totals.bounceRate)}
                  deltaInverted
                  /* Emphasis only where it means something: a bounce rate past
                     70% is the one figure in this row worth acting on. */
                  tone={traffic.data.totals.bounceRate >= 70 ? 'warning' : undefined}
                />
              </div>

              <div className="mt-5 grid gap-5 border-t border-hairline pt-5 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-muted">
                    Sessions · {traffic.data.daily.length} days
                  </p>
                  <TrendLine
                    data={traffic.data.daily}
                    xKey="date"
                    xFormat="date"
                    yFormat="number"
                    height={132}
                    area
                    series={[{ key: 'sessions', label: 'Sessions', color: SERIES[0] }]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-muted">
                    Top channels
                  </p>
                  <BarList
                    data={traffic.data.channels.slice(0, 5).map((channel) => ({
                      label: channel.channel,
                      value: channel.sessions,
                    }))}
                    valueFormat="number"
                    maxLabelWidth={112}
                  />
                </div>
              </div>

              <p className="mt-4 border-t border-hairline pt-3 text-2xs text-ink-muted">
                {clockDuration(traffic.data.totals.avgSessionSeconds * 1000)} average session ·{' '}
                {number(traffic.data.totals.newUsers)} new users · live from{' '}
                {traffic.provider.provider}
              </p>
            </>
          )}
        </Panel>
      </section>

      {/* ── Off-page + paid, as grouped metric panels ───────────────── */}
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <Panel
          title="Backlink Tracker"
          subtitle="Referring domains, authority and link velocity"
          icon="link"
          tone="blue"
          href="/backlinks"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCell
              label="Total backlinks"
              value={compactNumber(backlinks.summary.totalBacklinks)}
              delta={backlinks.summary.totalBacklinksDelta}
            />
            <MetricCell label="New" value={backlinks.summary.newLinks} />
            <MetricCell label="Lost" value={backlinks.summary.lostLinks} deltaInverted />
            <MetricCell
              label="Referring domains"
              value={number(backlinks.summary.referringDomains)}
              delta={backlinks.summary.referringDomainsDelta}
            />
          </div>

          <div className="mt-5 grid gap-5 border-t border-hairline pt-5 sm:grid-cols-[auto_auto_1fr] sm:items-center">
            <MiniGauge
              value={Math.round(backlinks.summary.averageDomainAuthority)}
              caption="Domain authority"
              scale="authority"
            />
            <MiniGauge
              value={Math.round(backlinks.summary.averagePageAuthority)}
              caption="Page authority"
              scale="authority"
            />
            <div className="min-w-0">
              <p className="mb-1 text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
                Referring domain growth · 90 days
              </p>
              <TrendLine
                data={backlinks.trend}
                xKey="date"
                xFormat="date"
                height={132}
                area
                series={[
                  {
                    key: 'referringDomains',
                    label: 'Referring domains',
                    color: SERIES[0],
                    format: 'number',
                  },
                ]}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Google Ads Performance"
          subtitle={
            ads.available
              ? `Account ${ads.customerId} · last ${ads.rangeDays} days`
              : 'No account configured for this client'
          }
          icon="bars"
          tone="yellow"
          href="/google-ads"
        >
          {!ads.available ? (
            /* Not seeded on purpose — see AdsReport.available. */
            <EmptyState
              icon="bars"
              title="No Google Ads account for this client"
              description={ads.provider.note}
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCell
              label="Clicks"
              value={compactNumber(ads.summary.clicks)}
              footnote={`${compactNumber(ads.summary.impressions)} impressions`}
            />
            <MetricCell label="Conversions" value={number(ads.summary.conversions, 0)} delta={ads.summary.conversionsDelta} />
            <MetricCell label="Cost" value={currency(ads.summary.spend)} delta={ads.summary.spendDelta} deltaInverted />
            <MetricCell label="CPA" value={currency(ads.summary.cpa)} deltaInverted />
          </div>

          <div className="mt-5 grid gap-5 border-t border-hairline pt-5 sm:grid-cols-3">
            {[
              { label: 'CTR', value: percent(ads.summary.ctr, 2), series: ads.daily.map((d) => d.clicks), color: 'var(--series-1)' },
              { label: 'Conversions', value: number(ads.summary.conversions, 0), series: ads.daily.map((d) => d.conversions), color: 'var(--series-3)' },
              { label: 'ROAS', value: `${ads.summary.roas.toFixed(2)}×`, series: ads.daily.map((d) => d.spend), color: 'var(--series-2)' },
            ].map((entry) => (
              <div key={entry.label}>
                <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">{entry.label}</p>
                <p className="mt-1 text-xl font-semibold leading-none tnum text-ink">{entry.value}</p>
                <div className="mt-2">
                  <Sparkline values={entry.series} width={168} height={40} strokeVar={entry.color} />
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </Panel>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-3">
        <Panel
          title="Budget Alert System"
          subtitle="Month-to-date pacing against the monthly cap"
          icon="bell"
          tone="rose"
          href="/budget-alerts"
          hrefLabel="View alerts"
        >
          {accountAlert ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <MetricCell
                  label="Current spend"
                  value={currency(accountAlert.spendMtd)}
                  footnote={`of ${currency(accountAlert.monthlyBudget)}`}
                />
                <div>
                  <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">Status</p>
                  <div className="mt-1.5">
                    <Badge
                      tone={
                        accountAlert.severity === 'ok'
                          ? 'good'
                          : accountAlert.severity === 'critical'
                            ? 'critical'
                            : accountAlert.severity === 'serious'
                              ? 'serious'
                              : 'warning'
                      }
                    >
                      {accountAlert.severity === 'ok' ? 'On track' : accountAlert.headline.split(' —')[0]}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-hairline pt-4">
                <Meter
                  value={accountAlert.spendMtd}
                  max={accountAlert.monthlyBudget}
                  label="Spend percentage"
                  valueLabel={percent(accountAlert.consumedPct, 1)}
                  markerPct={accountAlert.elapsedPct}
                  markerLabel={`${accountAlert.elapsedPct.toFixed(0)}% of the month elapsed`}
                  tone={SEVERITY_METER[accountAlert.severity]}
                />
                <p className="mt-3 text-2xs text-ink-muted">
                  Next threshold at{' '}
                  <span className="font-medium text-ink-secondary">
                    {accountAlert.rule.thresholds.find((t) => t > accountAlert.consumedPct) ?? '—'}%
                  </span>{' '}
                  · projected {currency(accountAlert.projectedSpend)} by month end
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-ink-muted">No account-level rule is enabled.</p>
          )}
        </Panel>

        <Panel
          title="Keyword Monitoring"
          subtitle={`${keywords.summary.tracked} keywords tracked`}
          icon="search"
          tone="aqua"
          href="/keywords"
        >
          <div className="grid grid-cols-3 gap-4">
            <MetricCell label="Top 3" value={keywords.summary.top3} />
            <MetricCell label="Top 10" value={keywords.summary.top10} />
            <MetricCell
              label="Visibility"
              value={percent(keywords.summary.visibility)}
              delta={keywords.summary.visibilityDelta}
            />
          </div>

          <ul className="mt-4 border-t border-hairline pt-3">
            {topKeywords.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 border-b border-hairline py-1.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-ink" title={row.keyword}>
                  {row.keyword}
                </span>
                <span className="shrink-0 text-2xs tnum text-ink-secondary">#{row.position}</span>
                <span className="w-12 shrink-0 text-right">
                  <Delta value={row.change} suffix="" />
                </span>
                <span className="shrink-0">
                  <Sparkline
                    values={row.history.map((rank) => 101 - (rank ?? 100))}
                    width={56}
                    height={22}
                    strokeVar="var(--series-3)"
                  />
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Overall SEO Health"
          subtitle={
            health.overall === null
              ? 'Not enough live data to score'
              : `Mean of ${health.livePillars.length} live pillar${health.livePillars.length === 1 ? '' : 's'}`
          }
          icon="shield"
          tone="violet"
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {health.overall === null ? (
              <div className="grid h-[132px] w-[132px] shrink-0 place-items-center rounded-full border-4 border-dashed border-hairline text-center">
                <span className="px-3 text-2xs leading-snug text-ink-muted">
                  No score — too few live providers
                </span>
              </div>
            ) : (
              <div className="shrink-0 text-center">
                <ScoreGauge score={health.overall} size={132} />
                <div className="mt-2 flex justify-center">
                  <Badge tone={healthBand(health.overall).tone}>
                    {healthBand(health.overall).label}
                  </Badge>
                </div>
              </div>
            )}

            <ul className="w-full min-w-0 space-y-3">
              {health.pillars.map((pillar) => (
                <li key={pillar.label}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cx(
                        'min-w-0 flex-1 truncate text-2xs',
                        pillar.live ? 'text-ink-secondary' : 'text-ink-muted line-through',
                      )}
                      title={pillar.scale}
                    >
                      {pillar.label}
                    </span>
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${pillar.score}%`,
                          /* A pillar excluded from the composite is drawn grey:
                             it still shows its own figure, but it must not read
                             as contributing to the headline. */
                          background: !pillar.live
                            ? 'var(--text-muted)'
                            : pillar.score >= 80
                              ? 'var(--status-good)'
                              : pillar.score >= 60
                                ? 'var(--seq-400)'
                                : pillar.score >= 40
                                  ? 'var(--status-serious)'
                                  : 'var(--status-critical)',
                        }}
                      />
                    </span>
                    <span
                      className={cx(
                        'tnum w-12 shrink-0 text-right text-2xs font-medium',
                        pillar.live ? 'text-ink' : 'text-ink-muted',
                      )}
                    >
                      {pillar.score}/100
                    </span>
                  </div>
                  <p className="mt-0.5 pr-[7rem] text-2xs leading-snug text-ink-muted">
                    {pillar.basis}
                    {!pillar.live && (
                      <span className="font-medium text-status-warning"> · excluded, seeded data</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 border-t border-hairline pt-3 text-2xs leading-relaxed text-ink-muted">
            {health.note} Each pillar is scored against a stated benchmark — hover a pillar name to
            see which.
          </p>
        </Panel>
      </section>

      {seededPanels.length > 0 && (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Seeded data in use for {seededPanels.join(', ')}.</span>{' '}
          Numbers are deterministic fixtures for {domain}, not live measurements. Each provider module
          in <code className="font-mono">src/lib/providers/</code> has a marked hook where the real
          API response gets mapped in — see <code className="font-mono">.env.example</code> for the
          credentials each one needs.
        </Note>
      )}
    </div>
  );
}
