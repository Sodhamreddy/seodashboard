import type { AdsReport } from '@/lib/providers/ads';
import type { BacklinkReport } from '@/lib/providers/backlinks';
import type { KeywordReport } from '@/lib/providers/keywords';
import { percent } from '@/lib/format';

/**
 * Composite SEO health.
 *
 * Rewritten 2026-09-01 because the previous version was wrong in two ways that
 * mattered, and it lived duplicated in two files.
 *
 * 1. **It averaged seeded data into a client-facing score.** A client with no
 *    Google Ads account configured still got a "Paid efficiency" pillar, scored
 *    off deterministic demo numbers, contributing a quarter of the headline.
 *    That is not a low-confidence estimate, it is fiction with a number on it.
 *    Pillars whose provider is seeded are now **excluded from the composite**
 *    and shown as excluded.
 *
 * 2. **The scales were invented.** `visibility * 2.2`, `share * 320`,
 *    `DA * 1.35 + dofollow * 0.25`, `roas * 26` — none of those had a
 *    justification, and the old comment claimed there were "no invented
 *    constants", which was simply false. Every scale below is now a named
 *    benchmark: the value that counts as 100, stated once, in one place.
 *
 * The benchmarks are opinions, not physics. They are collected here so they can
 * be argued with and changed in one edit, rather than being spread through a
 * page as bare multipliers.
 */

/** Share of available top-10 clicks that counts as full marks. */
const VISIBILITY_TARGET = 40;
/** Share of tracked keywords inside the top 10 that counts as full marks. */
const TOP10_SHARE_TARGET = 0.4;
/** Average referring-domain authority that counts as full marks. */
const DOMAIN_AUTHORITY_TARGET = 50;
/** Toxic-link share is subtracted, up to this many points. */
const TOXIC_PENALTY_CAP = 30;
/** ROAS that counts as full marks. */
const ROAS_TARGET = 3;
/** CTR (0–100 scale) that counts as full marks. */
const CTR_TARGET = 3;
/** How ROAS and CTR split the paid pillar. */
const PAID_WEIGHT = { roas: 0.7, ctr: 0.3 };

/** Fewer live pillars than this and no composite is reported at all. */
const MIN_LIVE_PILLARS = 2;

export type HealthPillar = {
  label: string;
  score: number;
  /** The figures behind the score, shown beneath the bar. */
  basis: string;
  /** How the score was scaled, so the number can be argued with. */
  scale: string;
  /** False when the pillar's provider returned seeded data. */
  live: boolean;
  /** Which provider answered, for the excluded-pillar note. */
  provider: string;
};

export type HealthReport = {
  /** Null when too few pillars are live to average honestly. */
  overall: number | null;
  pillars: HealthPillar[];
  livePillars: HealthPillar[];
  excludedPillars: HealthPillar[];
  /** One line explaining what the composite does and does not include. */
  note: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** Scores a value against the benchmark that counts as 100. */
const against = (value: number, target: number) => clamp((value / target) * 100);

export function buildHealth(
  ads: AdsReport,
  backlinks: BacklinkReport,
  keywords: KeywordReport,
): HealthReport {
  const rankingsLive = keywords.provider.mode === 'live';
  const backlinksLive = backlinks.provider.mode === 'live';
  const adsLive = ads.provider.mode === 'live';

  const top10Share = keywords.summary.top10 / Math.max(1, keywords.summary.tracked);

  const linkPool = Math.max(
    1,
    backlinks.backlinks.length || backlinks.summary.referringDomains,
  );
  const toxicShare = backlinks.summary.toxicCandidates / linkPool;

  const pillars: HealthPillar[] = [
    {
      label: 'Search visibility',
      score: against(keywords.summary.visibility, VISIBILITY_TARGET),
      basis: `${percent(keywords.summary.visibility)} of available top-10 clicks captured`,
      scale: `${VISIBILITY_TARGET}% of available clicks scores 100`,
      live: rankingsLive,
      provider: keywords.provider.provider,
    },
    {
      label: 'Rankings',
      score: against(top10Share, TOP10_SHARE_TARGET),
      basis: `${keywords.summary.top10} of ${keywords.summary.tracked} tracked keywords in the top 10`,
      scale: `${Math.round(TOP10_SHARE_TARGET * 100)}% of tracked keywords in the top 10 scores 100`,
      live: rankingsLive,
      provider: keywords.provider.provider,
    },
    {
      label: 'Backlinks',
      score: clamp(
        against(backlinks.summary.averageDomainAuthority, DOMAIN_AUTHORITY_TARGET) -
          Math.min(TOXIC_PENALTY_CAP, toxicShare * 100),
      ),
      basis: `Average DA ${backlinks.summary.averageDomainAuthority} across ${backlinks.summary.referringDomains} referring domains${
        backlinks.summary.toxicCandidates > 0
          ? `, ${percent(toxicShare * 100)} flagged toxic`
          : ''
      }`,
      scale: `Average DA ${DOMAIN_AUTHORITY_TARGET} scores 100, minus up to ${TOXIC_PENALTY_CAP} for toxic links`,
      live: backlinksLive,
      provider: backlinks.provider.provider,
    },
    {
      label: 'Paid efficiency',
      score: clamp(
        against(ads.summary.roas, ROAS_TARGET) * PAID_WEIGHT.roas +
          against(ads.summary.ctr, CTR_TARGET) * PAID_WEIGHT.ctr,
      ),
      basis: `${ads.summary.roas.toFixed(2)}x ROAS at ${percent(ads.summary.ctr, 2)} CTR`,
      scale: `${ROAS_TARGET}x ROAS and ${CTR_TARGET}% CTR score 100, weighted ${PAID_WEIGHT.roas * 100}/${PAID_WEIGHT.ctr * 100}`,
      live: adsLive,
      provider: ads.provider.provider,
    },
  ];

  const livePillars = pillars.filter((pillar) => pillar.live);
  const excludedPillars = pillars.filter((pillar) => !pillar.live);

  const overall =
    livePillars.length >= MIN_LIVE_PILLARS
      ? clamp(livePillars.reduce((sum, pillar) => sum + pillar.score, 0) / livePillars.length)
      : null;

  const note =
    overall === null
      ? `Only ${livePillars.length} of ${pillars.length} pillars have live data, which is too few to average into a single score. Connect the remaining providers in Settings.`
      : excludedPillars.length > 0
        ? `Mean of the ${livePillars.length} pillars with live data. ${excludedPillars
            .map((pillar) => pillar.label)
            .join(' and ')} ${
            excludedPillars.length === 1 ? 'is' : 'are'
          } excluded — that provider is returning demonstration data, and averaging it in would put a made-up number in the headline.`
        : `Mean of all ${pillars.length} pillars, every one from live data.`;

  return { overall, pillars, livePillars, excludedPillars, note };
}

/** Band label for a score, used for the badge beside the gauge. */
export function healthBand(score: number) {
  if (score >= 80) return { label: 'Strong', tone: 'good' as const };
  if (score >= 60) return { label: 'Fair', tone: 'warning' as const };
  if (score >= 40) return { label: 'Needs work', tone: 'serious' as const };
  return { label: 'Critical', tone: 'critical' as const };
}
