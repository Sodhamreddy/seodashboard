import type { ReactNode } from 'react';
import { Delta, ScoreGauge, Sparkline } from '@/components/ui/data';
import { Badge, cx } from '@/components/ui/primitives';
import { compactNumber, currency, number, percent } from '@/lib/format';
import type { AdsReport } from '@/lib/providers/ads';
import type { AlertEvaluation } from '@/lib/providers/alerts';
import type { BacklinkReport } from '@/lib/providers/backlinks';
import type { KeywordReport } from '@/lib/providers/keywords';
import { halfOverHalfDelta, type TrafficReport } from '@/lib/providers/traffic';
import { scoreBand } from '@/lib/score-band';
import type { HealthReport } from '@/lib/seo/health';

/**
 * The state of the account, before any of the tools.
 *
 * The Overview used to open on a row of tool shortcuts, which made the
 * dashboard read as a launcher: you arrived and were offered somewhere else to
 * go before being told anything. The first screen of a client console should
 * answer "how is this account doing" — composite health, the four numbers that
 * move, and which of them are real — and only then offer the tools.
 *
 * Every figure here is already fetched by the page; nothing new is requested.
 * A provider that is not connected prints a dash and says why, because a zero
 * in this position would be read as a measurement.
 */

function Kpi({
  label,
  value,
  delta,
  deltaInverted,
  footnote,
  spark,
  sparkVar,
  muted,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaInverted?: boolean;
  footnote: string;
  spark?: number[];
  sparkVar?: string;
  /** True when there is no measurement behind the value. */
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
        {label}
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span
          className={cx(
            'tnum text-[1.65rem] font-semibold leading-none tracking-[-0.02em]',
            muted ? 'text-ink-muted' : 'text-ink',
          )}
        >
          {value}
        </span>
        {delta !== undefined && <Delta value={delta} inverted={deltaInverted} />}
      </p>
      {/* The sparkline carries shape, the number carries level — together they
          say "how much" and "which way" without a second panel. */}
      {spark && spark.length > 1 ? (
        <div className="mt-2 h-[26px]">
          <Sparkline values={spark} width={132} height={26} strokeVar={sparkVar} />
        </div>
      ) : (
        <div className="mt-2 h-[26px]" aria-hidden="true" />
      )}
      <p className="mt-1 truncate text-2xs text-ink-muted" title={footnote}>
        {footnote}
      </p>
    </div>
  );
}

export function OverviewHero({
  health,
  traffic,
  keywords,
  backlinks,
  ads,
  accountAlert,
  windowLabel,
}: {
  health: HealthReport;
  traffic: TrafficReport;
  keywords: KeywordReport;
  backlinks: BacklinkReport;
  ads: AdsReport;
  accountAlert?: AlertEvaluation;
  windowLabel: string;
}) {
  const band = health.overall === null ? null : scoreBand(health.overall);

  const sessions = traffic.data?.totals.sessions;
  const sessionSeries = traffic.data?.daily.map((day) => day.sessions) ?? [];

  /*
   * Which sources are live is part of the headline, not a footnote buried
   * three panels down: a composite built on two live pillars and one seeded
   * one means something different from the same number built on three.
   */
  const sources = [
    { label: 'GA4', live: Boolean(traffic.data) },
    { label: 'Rankings', live: keywords.provider.mode === 'live' },
    { label: 'Backlinks', live: backlinks.provider.mode === 'live' },
    { label: 'Ads', live: ads.available && ads.provider.mode === 'live' },
  ];

  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
      <div className="grid gap-px bg-hairline lg:grid-cols-[minmax(0,19rem)_1fr]">
        {/* ── Composite health ──────────────────────────────────────── */}
        <div
          className="flex items-center gap-4 bg-surface p-5"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--accent-soft) 0%, transparent 78%)',
          }}
        >
          {health.overall === null ? (
            <div className="min-w-0">
              <p className="text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
                Account health
              </p>
              <p className="mt-1 text-xl font-semibold text-ink-muted">Not scored</p>
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-secondary">{health.note}</p>
            </div>
          ) : (
            <>
              <ScoreGauge score={health.overall} size={104} />
              <div className="min-w-0">
                <p className="text-2xs font-medium uppercase tracking-[0.07em] text-ink-muted">
                  Account health
                </p>
                <p className="mt-1 flex items-center gap-2">
                  <span className="text-lg font-semibold leading-tight text-ink">
                    {band?.label}
                  </span>
                  <Badge tone="neutral" icon={null}>
                    {health.livePillars.length} of {health.pillars.length} live
                  </Badge>
                </p>
                <p className="mt-1.5 text-2xs leading-relaxed text-ink-secondary line-clamp-3">
                  {health.note}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── The four numbers that move ────────────────────────────── */}
        <div className="grid gap-5 bg-surface p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label="Sessions"
            value={sessions === undefined ? '—' : compactNumber(sessions)}
            muted={sessions === undefined}
            delta={sessionSeries.length > 3 ? halfOverHalfDelta(sessionSeries) : undefined}
            spark={sessionSeries}
            sparkVar="var(--series-1)"
            footnote={
              sessions === undefined
                ? 'Google Analytics not connected'
                : `${number(traffic.data?.totals.users ?? 0)} users · ${windowLabel}`
            }
          />

          <Kpi
            label="Search visibility"
            value={percent(keywords.summary.visibility)}
            delta={keywords.summary.visibilityDelta}
            footnote={`${keywords.summary.top10} of ${keywords.summary.tracked} keywords in the top 10`}
          />

          <Kpi
            label="Referring domains"
            value={number(backlinks.summary.referringDomains)}
            delta={
              backlinks.trend.length > 1 ? backlinks.summary.referringDomainsDelta : undefined
            }
            spark={backlinks.trend.map((point) => point.referringDomains)}
            sparkVar="var(--series-3)"
            footnote={
              backlinks.summary.toxicCandidates > 0
                ? `${backlinks.summary.toxicCandidates} flagged toxic or suspicious`
                : 'No domains flagged toxic'
            }
          />

          <Kpi
            label="Ad spend"
            value={ads.available ? currency(ads.summary.spend) : '—'}
            muted={!ads.available}
            delta={ads.available ? ads.summary.spendDelta : undefined}
            // More spend is not better on its own, so the arrow stays neutral
            // in meaning: it is the pacing footnote that carries the verdict.
            spark={ads.daily.map((day) => day.spend)}
            sparkVar="var(--series-2)"
            footnote={
              !ads.available
                ? 'No Google Ads account for this client'
                : accountAlert
                  ? `${percent(accountAlert.consumedPct, 0)} of budget · ${accountAlert.daysLeft} days left`
                  : `${currency(ads.summary.spendMtd)} month to date`
            }
          />
        </div>
      </div>

      {/* ── What is measured ──────────────────────────────────────────
          A strip rather than a sentence: four states read at a glance, and
          it sits under the numbers it qualifies. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline bg-surface-sunken px-5 py-2.5">
        {sources.map((source) => (
          <span key={source.label} className="flex items-center gap-1.5 text-2xs text-ink-secondary">
            <span
              aria-hidden="true"
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                source.live ? 'bg-status-good' : 'bg-status-warning',
              )}
            />
            {source.label}
            <span className="text-ink-muted">{source.live ? 'live' : 'seeded'}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-2xs text-ink-muted">{windowLabel}</span>
      </div>
    </section>
  );
}
