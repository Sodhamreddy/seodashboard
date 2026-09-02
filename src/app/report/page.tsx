import type { Metadata } from 'next';
import Link from 'next/link';
import { AutoPrint } from './AutoPrint';
import { TrendLine } from '@/components/charts/Charts';
import { Icon } from '@/components/ui/Icon';
import { SERIES } from '@/lib/chart-palette';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { clockDuration, compactNumber, currency, number, percent } from '@/lib/format';
import { getAdsReport } from '@/lib/providers/ads';
import { evaluateAlerts, loadAlertRules } from '@/lib/providers/alerts';
import { getBacklinkReport } from '@/lib/providers/backlinks';
import { getKeywordReport } from '@/lib/providers/keywords';
import { getTrafficReport } from '@/lib/providers/traffic';
import { formatWindow, resolveRange } from '@/lib/range';
import { buildHealth } from '@/lib/seo/health';

export const metadata: Metadata = { title: 'Client report' };
export const dynamic = 'force-dynamic';

/**
 * The printable client report.
 *
 * Deliberately a separate route from the Overview rather than a print
 * stylesheet over it: a report that a client reads has a different information
 * order from a console an operator scans. It leads with the verdict, states the
 * window and the data sources on the first page, and keeps every section to a
 * page break that falls in a sensible place.
 *
 * Export is the browser's own "Save as PDF", which is why there is no PDF
 * library in package.json — it keeps vector text, real links and selectable
 * tables, and it costs nothing at deploy time.
 */

const TONE_TEXT = {
  critical: '#b3261e',
  serious: '#b26a00',
  warning: '#8a6d00',
  good: '#0f7a52',
  neutral: '#5a6474',
} as const;

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="report-stat">
      <p className="report-stat-label">{label}</p>
      <p className="report-stat-value tnum">{value}</p>
      {detail && <p className="report-stat-detail">{detail}</p>}
    </div>
  );
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams?: {
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
    print?: string | string[];
  };
}) {
  const range = resolveRange(searchParams?.range, searchParams?.from, searchParams?.to);
  const autoPrint = searchParams?.print === '1';

  const domain = getActiveDomain();
  const clients = await loadClients();
  const client = clients.find((entry) => entry.domain === domain);

  const [ads, backlinks, keywords, traffic] = await Promise.all([
    getAdsReport(domain, range.days, range.custom),
    getBacklinkReport(domain, range.days),
    getKeywordReport(domain),
    getTrafficReport(domain, range.days, range.custom),
  ]);

  const rules = await loadAlertRules(ads);
  const firing = evaluateAlerts(ads, rules).filter((alert) => alert.severity !== 'ok');

  // Shared with the Overview, and it excludes any pillar whose provider is
  // seeded — a client report must never average demo data into a headline.
  const health = buildHealth(ads, backlinks, keywords);

  const windowLabel =
    ads.daily.length > 0
      ? formatWindow(ads.daily[0].date, ads.daily[ads.daily.length - 1].date)
      : range.label;

  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  /*
   * Three states, not two. "Demonstration data" and "not measured" are
   * different claims: the seeded providers DO render figures that describe a
   * sample set, whereas GA4 renders nothing at all. Labelling the second as
   * demonstration data would imply numbers above came from somewhere.
   */
  const sources: { label: string; state: 'live' | 'seed' | 'absent'; detail: string }[] = [
    {
      label: 'Rank tracking',
      state: keywords.provider.mode === 'live' ? 'live' : 'seed',
      detail: keywords.provider.provider,
    },
    {
      label: 'Backlinks',
      state: backlinks.provider.mode === 'live' ? 'live' : 'seed',
      detail: backlinks.provider.provider,
    },
    {
      label: 'Google Ads',
      state: ads.provider.mode === 'live' ? 'live' : 'seed',
      detail: ads.provider.provider,
    },
    {
      label: 'Traffic (GA4)',
      state: traffic.data ? 'live' : 'absent',
      detail: traffic.data ? traffic.provider.provider : 'Not connected — no traffic in this report',
    },
  ];

  const SOURCE_LABEL = {
    live: 'Live',
    seed: 'Demonstration data',
    absent: 'Not measured',
  } as const;

  const SOURCE_COLOR = {
    live: TONE_TEXT.good,
    seed: TONE_TEXT.warning,
    absent: TONE_TEXT.neutral,
  } as const;

  const topKeywords = keywords.keywords
    .filter((row) => row.position !== null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 10);

  const topCampaigns = [...ads.campaigns].sort((a, b) => b.spend - a.spend).slice(0, 8);

  return (
    <div className="report-doc">
      {/* ── Screen-only toolbar. Never printed. ───────────────────────── */}
      <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-hairline bg-surface-raised px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-ink-secondary">
          <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-ink">
            <Icon name="chevronLeft" size={14} />
            Back to Overview
          </Link>
          <span className="text-ink-muted">·</span>
          <span>
            {range.label} · {windowLabel}
          </span>
        </div>
        <AutoPrint auto={autoPrint} />
      </div>

      <article className="report-sheet">
        {/* ── Cover band ─────────────────────────────────────────────── */}
        <header className="report-cover">
          <div className="report-cover-row">
            <div>
              <p className="report-eyebrow">SEO &amp; paid media performance</p>
              <h1 className="report-title">{client?.name ?? domain}</h1>
              <p className="report-subtitle">{domain}</p>
            </div>
            <div className="report-cover-meta">
              <p>
                <span>Reporting window</span>
                {range.label}
              </p>
              <p>
                <span>Dates covered</span>
                <span className="tnum">{windowLabel}</span>
              </p>
              <p>
                <span>Prepared</span>
                {generated}
              </p>
            </div>
          </div>
        </header>

        {/* ── Verdict ────────────────────────────────────────────────── */}
        <section className="report-section">
          <h2 className="report-h2">Overall health</h2>
          <div className="report-verdict">
            <div className="report-score">
              <p className="report-score-value tnum">
                {health.overall === null ? '—' : health.overall}
              </p>
              <p className="report-score-label">
                {health.overall === null ? 'not scored' : 'out of 100'}
              </p>
            </div>
            <div className="report-pillars">
              {/*
                Only live pillars are printed. A client report listing a pillar
                as "excluded, demo data" invites the obvious question and
                answers it badly; the data-sources footer already states which
                providers are live.
              */}
              {health.livePillars.map((pillar) => (
                <div key={pillar.label} className="report-pillar">
                  <div className="report-pillar-head">
                    <span>{pillar.label}</span>
                    <span className="tnum">{pillar.score}</span>
                  </div>
                  <div className="report-bar">
                    <span style={{ width: `${pillar.score}%` }} />
                  </div>
                  <p className="report-pillar-basis">{pillar.basis}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="report-note">{health.note}</p>
        </section>

        {/* ── Headline numbers ───────────────────────────────────────── */}
        <section className="report-section">
          <h2 className="report-h2">Headline numbers</h2>
          <div className="report-stat-grid">
            <Stat
              label="Keywords tracked"
              value={number(keywords.summary.tracked)}
              detail={`${keywords.summary.top10} in top 10 · ${keywords.summary.top3} in top 3`}
            />
            <Stat
              label="Search visibility"
              value={percent(keywords.summary.visibility)}
              detail={`${keywords.summary.visibilityDelta >= 0 ? '+' : ''}${keywords.summary.visibilityDelta.toFixed(
                1,
              )} pts this period`}
            />
            <Stat
              label="Referring domains"
              value={number(backlinks.summary.referringDomains)}
              detail={`Average DA ${backlinks.summary.averageDomainAuthority}`}
            />
            <Stat
              label="Total backlinks"
              value={compactNumber(backlinks.summary.totalBacklinks)}
              detail={`${backlinks.summary.newLinks} new · ${backlinks.summary.lostLinks} lost`}
            />
            <Stat
              label="Paid spend"
              value={currency(ads.summary.spend)}
              detail={`${number(ads.summary.clicks)} clicks · ${percent(ads.summary.ctr, 2)} CTR`}
            />
            <Stat
              label="Conversions"
              value={number(ads.summary.conversions)}
              detail={`${currency(ads.summary.cpa)} CPA · ${ads.summary.roas.toFixed(2)}x ROAS`}
            />
          </div>
        </section>

        {/* ── Traffic. Omitted entirely when GA4 is unavailable: a client
             report should not carry a section explaining a missing
             integration. The sources footer records it instead. ─────── */}
        {traffic.data && (
          <section className="report-section">
            <h2 className="report-h2">Website traffic</h2>
            <div className="report-stat-grid">
              <Stat
                label="Sessions"
                value={number(traffic.data.totals.sessions)}
                detail={`${number(traffic.data.totals.users)} users · ${number(
                  traffic.data.totals.newUsers,
                )} new`}
              />
              <Stat
                label="Pageviews"
                value={compactNumber(traffic.data.totals.pageviews)}
                detail={`${(
                  traffic.data.totals.pageviews / Math.max(1, traffic.data.totals.sessions)
                ).toFixed(1)} per session`}
              />
              <Stat
                label="Engagement"
                value={clockDuration(traffic.data.totals.avgSessionSeconds * 1000)}
                detail={`${percent(traffic.data.totals.bounceRate)} bounce rate`}
              />
            </div>

            {traffic.data.daily.length > 1 && (
              <div className="report-chart">
                <TrendLine
                  data={traffic.data.daily}
                  xKey="date"
                  xFormat="date"
                  yFormat="number"
                  height={170}
                  area
                  series={[{ key: 'sessions', label: 'Sessions', color: SERIES[0] }]}
                />
              </div>
            )}

            {traffic.data.channels.length > 0 && (
              <>
                <h3 className="report-h3">Sessions by channel</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th className="num">Sessions</th>
                      <th className="num">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const total = traffic.data.channels.reduce(
                        (sum, channel) => sum + channel.sessions,
                        0,
                      );
                      return traffic.data.channels.map((channel) => (
                        <tr key={channel.channel}>
                          <td>{channel.channel}</td>
                          <td className="num tnum">{number(channel.sessions)}</td>
                          <td className="num tnum">
                            {total > 0 ? percent((channel.sessions / total) * 100) : '—'}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {/* ── Paid media trend ───────────────────────────────────────── */}
        {ads.daily.length > 1 && (
          <section className="report-section report-break">
            <h2 className="report-h2">Paid spend over the period</h2>
            <div className="report-chart">
              <TrendLine
                data={ads.daily}
                xKey="date"
                xFormat="date"
                yFormat="currency"
                height={190}
                area
                series={[{ key: 'spend', label: 'Daily spend', color: SERIES[0] }]}
              />
            </div>
            {topCampaigns.length > 0 && (
              <>
                <h3 className="report-h3">Campaigns by spend</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th className="num">Cost</th>
                      <th className="num">Clicks</th>
                      <th className="num">Conv.</th>
                      <th className="num">CPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.map((campaign) => (
                      <tr key={campaign.name}>
                        <td>{campaign.name}</td>
                        <td className="num tnum">{currency(campaign.spend)}</td>
                        <td className="num tnum">{number(campaign.clicks)}</td>
                        <td className="num tnum">{number(campaign.conversions)}</td>
                        <td className="num tnum">
                          {campaign.conversions > 0
                            ? currency(campaign.spend / campaign.conversions)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {/* ── Rankings ───────────────────────────────────────────────── */}
        {topKeywords.length > 0 && (
          <section className="report-section report-break">
            <h2 className="report-h2">Best-ranking keywords</h2>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th className="num">Position</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {topKeywords.map((row) => (
                  <tr key={row.keyword}>
                    <td>{row.keyword}</td>
                    <td className="num tnum">{row.position ?? '—'}</td>
                    <td className="num tnum">
                      {row.change === 0 ? '±0' : row.change > 0 ? `+${row.change}` : row.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── Alerts ─────────────────────────────────────────────────── */}
        {firing.length > 0 && (
          <section className="report-section">
            <h2 className="report-h2">Active budget alerts</h2>
            <ul className="report-alerts">
              {firing.map((alert, index) => (
                <li key={`${alert.rule.scope}-${index}`}>
                  <strong>{alert.severity}</strong> — {alert.headline}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Provenance. Every report says where its numbers came from. ── */}
        <footer className="report-footer">
          <h2 className="report-h2">Data sources</h2>
          <ul className="report-sources">
            {sources.map((source) => (
              <li key={source.label}>
                <span className="report-source-label">{source.label}</span>
                <span
                  className="report-source-mode"
                  style={{ color: SOURCE_COLOR[source.state] }}
                >
                  {source.state === 'live'
                    ? `Live · ${source.detail}`
                    : SOURCE_LABEL[source.state]}
                </span>
                {source.state === 'absent' && (
                  <span className="report-stat-detail">{source.detail}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="report-note">
            {sources.some((source) => source.state === 'seed')
              ? 'Sections marked as demonstration data describe a sample set, not this domain. Connect the provider to make those figures real.'
              : 'All figures in this report are pulled live from the connected providers.'}
            {sources.some((source) => source.state === 'absent') &&
              ' Anything marked not measured is absent from this report entirely rather than estimated.'}
          </p>
          <p className="report-imprint">
            {client?.name ?? domain} · {range.label} · Generated {generated} · SitePilot
          </p>
        </footer>
      </article>
    </div>
  );
}
