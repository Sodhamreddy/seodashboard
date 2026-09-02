import type { Tone } from '@/components/ui/primitives';
import type { AdsReport } from '@/lib/providers/ads';
import type { BacklinkReport } from '@/lib/providers/backlinks';
import type { KeywordReport } from '@/lib/providers/keywords';
import type { TrafficReport } from '@/lib/providers/traffic';
import { halfOverHalfDelta } from '@/lib/stats';
import { currency, number, percent, signed } from '@/lib/format';

/**
 * Derived insights — CURRENTLY UNUSED.
 *
 * The Insights section was removed from the Overview and from the printable
 * report on 2026-08-31 at the operator's request. This module is left in place
 * because it is pure and nothing imports it, so it costs nothing at build time
 * and is never bundled. To bring the section back: render `buildInsights(ads,
 * backlinks, keywords, rangeDays, traffic)` and re-add a panel component. Delete
 * this file outright if the feature is not wanted again.
 *
 * Original intent, for whoever revisits it:
 *
 * Every insight is computed from numbers already fetched for the page — nothing
 * here calls a provider, and nothing invents a figure. The `evidence` string is
 * the arithmetic behind the claim, so a client asking "why does it say that"
 * gets an answer from the card itself rather than from a spreadsheet.
 *
 * Rules that do not fire produce no card. A quiet week should show a short
 * list, not four cards padded with "nothing to report" — the absence of a
 * warning is itself the signal.
 */

export type InsightTone = Extract<Tone, 'good' | 'warning' | 'serious' | 'critical' | 'neutral'>;

export type Insight = {
  id: string;
  /** Drives the card accent and the sort order. */
  tone: InsightTone;
  area: 'Paid media' | 'Rankings' | 'Backlinks' | 'Traffic' | 'Coverage';
  title: string;
  /** The arithmetic behind the title. */
  evidence: string;
  /** What to do about it. Omitted when the insight is purely informational. */
  action?: string;
  href?: string;
  /** Sorting weight within a tone — bigger swings surface first. */
  magnitude: number;
};

/**
 * `format.percent` appends a % sign without scaling, because every provider
 * field it is used on (ctr, visibility, dofollowShare) is already stored on a
 * 0–100 scale. Ratios computed *here* are true fractions, so they have to be
 * converted before they are formatted — that is what this does, and it exists
 * so the conversion is never done by eye.
 */
function fractionAsPercent(fraction: number, digits = 0) {
  return percent(fraction * 100, digits);
}

/** The CTR floor below which the paid rule fires, on the provider's 0–100 scale. */
const CTR_FLOOR = 1.5;

const TONE_RANK: Record<InsightTone, number> = {
  critical: 0,
  serious: 1,
  warning: 2,
  good: 3,
  neutral: 4,
};

export function buildInsights(
  ads: AdsReport,
  backlinks: BacklinkReport,
  keywords: KeywordReport,
  rangeDays: number,
  /** Optional: omitted by callers that do not fetch GA4. */
  traffic?: TrafficReport,
): Insight[] {
  const out: Insight[] = [];

  /* ── Paid media ──────────────────────────────────────────────────── */

  // ROAS below break-even is the most expensive thing on this page, so it is
  // graded harder than anything else here.
  if (ads.summary.spend > 0) {
    if (ads.summary.roas < 1) {
      out.push({
        id: 'roas-below-breakeven',
        tone: ads.summary.roas < 0.5 ? 'critical' : 'serious',
        area: 'Paid media',
        title: `Paid spend is not returning its cost at ${ads.summary.roas.toFixed(2)}x ROAS`,
        evidence: `${currency(ads.summary.spend)} spent produced ${currency(
          ads.summary.conversionValue,
        )} of tracked conversion value over ${rangeDays} days.`,
        action:
          'Check conversion-value tracking first — a 0x ROAS usually means values are not being sent, not that the account is failing.',
        href: '/google-ads',
        magnitude: (1 - ads.summary.roas) * 100,
      });
    } else if (ads.summary.roas >= 3) {
      out.push({
        id: 'roas-strong',
        tone: 'good',
        area: 'Paid media',
        title: `Paid media is returning ${ads.summary.roas.toFixed(2)}x on spend`,
        evidence: `${currency(ads.summary.conversionValue)} of conversion value on ${currency(
          ads.summary.spend,
        )} spent.`,
        action: 'There is headroom to raise budget on the campaigns carrying this.',
        href: '/google-ads',
        magnitude: ads.summary.roas * 10,
      });
    }
  }

  // Spend climbing while conversions fall is the classic silent bleed.
  if (ads.summary.spendDelta > 5 && ads.summary.conversionsDelta < -5) {
    out.push({
      id: 'spend-up-conv-down',
      tone: 'serious',
      area: 'Paid media',
      title: 'Spend is climbing while conversions fall',
      evidence: `Spend ${signed(ads.summary.spendDelta, 1)}% and conversions ${signed(
        ads.summary.conversionsDelta,
        1,
      )}% versus the previous ${rangeDays} days.`,
      action: 'Pull the search-terms report — this pattern is usually broad-match drift.',
      href: '/google-ads',
      magnitude: Math.abs(ads.summary.spendDelta) + Math.abs(ads.summary.conversionsDelta),
    });
  }

  // Budget pacing, only meaningful when a monthly budget is actually set.
  if (ads.summary.monthlyBudget > 0) {
    const pacing = ads.summary.spendMtd / ads.summary.monthlyBudget;
    if (pacing > 1) {
      out.push({
        id: 'budget-overspent',
        tone: 'critical',
        area: 'Paid media',
        title: `Month-to-date spend is ${fractionAsPercent(pacing)} of the monthly budget`,
        evidence: `${currency(ads.summary.spendMtd)} spent against a ${currency(
          ads.summary.monthlyBudget,
        )} budget.`,
        action: 'Cap or pause the highest-spend campaign until the next cycle.',
        href: '/budget-alerts',
        magnitude: (pacing - 1) * 200,
      });
    } else if (pacing < 0.6) {
      out.push({
        id: 'budget-underspent',
        tone: 'warning',
        area: 'Paid media',
        title: `Only ${fractionAsPercent(pacing)} of the monthly budget is spent`,
        evidence: `${currency(ads.summary.spendMtd)} of ${currency(
          ads.summary.monthlyBudget,
        )} used month to date.`,
        action:
          'Underspend usually means limited impression share — check for budget-capped campaigns.',
        href: '/google-ads',
        magnitude: (0.6 - pacing) * 100,
      });
    }
  }

  // CTR floor. Below 1.5% on search is normally creative or match type.
  if (ads.summary.impressions > 500 && ads.summary.ctr < CTR_FLOOR) {
    out.push({
      id: 'ctr-low',
      tone: 'warning',
      area: 'Paid media',
      title: `Click-through rate is ${percent(ads.summary.ctr, 2)}`,
      evidence: `${number(ads.summary.clicks)} clicks from ${number(
        ads.summary.impressions,
      )} impressions.`,
      action: 'Tighten match types and refresh the weakest ad group headlines.',
      href: '/google-ads',
      magnitude: (CTR_FLOOR - ads.summary.ctr) * 20,
    });
  }

  /* ── Rankings ────────────────────────────────────────────────────── */

  if (keywords.summary.lostRankings > 0) {
    out.push({
      id: 'lost-rankings',
      tone: keywords.summary.lostRankings > 5 ? 'serious' : 'warning',
      area: 'Rankings',
      title: `${keywords.summary.lostRankings} keyword${
        keywords.summary.lostRankings > 1 ? 's' : ''
      } dropped out of the tracked index`,
      evidence: `${keywords.summary.declined} declined and ${keywords.summary.improved} improved across ${keywords.summary.tracked} tracked keywords.`,
      action:
        'Check those URLs for indexation or content changes before assuming an algorithm shift.',
      href: '/keywords',
      magnitude: keywords.summary.lostRankings * 12,
    });
  }

  if (Math.abs(keywords.summary.visibilityDelta) >= 1) {
    const gaining = keywords.summary.visibilityDelta > 0;
    out.push({
      id: 'visibility-move',
      tone: gaining ? 'good' : 'warning',
      area: 'Rankings',
      title: `Search visibility ${gaining ? 'gained' : 'lost'} ${Math.abs(
        keywords.summary.visibilityDelta,
      ).toFixed(1)} points`,
      evidence: `Now ${percent(keywords.summary.visibility)} of available top-10 clicks, with ${
        keywords.summary.top3
      } keywords in the top 3.`,
      action: gaining
        ? undefined
        : 'Compare the biggest decliners against competitor SERP changes for those terms.',
      href: '/keywords',
      magnitude: Math.abs(keywords.summary.visibilityDelta) * 8,
    });
  }

  if (keywords.summary.tracked > 0) {
    const top10Share = keywords.summary.top10 / keywords.summary.tracked;
    if (top10Share < 0.2) {
      out.push({
        id: 'top10-thin',
        tone: 'warning',
        area: 'Rankings',
        title: `Only ${fractionAsPercent(top10Share)} of tracked keywords reach the top 10`,
        evidence: `${keywords.summary.top10} of ${
          keywords.summary.tracked
        } tracked, average position ${keywords.summary.averagePosition.toFixed(1)}.`,
        action: 'Prioritise the page-2 cluster — those are the cheapest wins in the set.',
        href: '/keywords',
        magnitude: (0.2 - top10Share) * 150,
      });
    } else if (top10Share > 0.6) {
      out.push({
        id: 'top10-strong',
        tone: 'good',
        area: 'Rankings',
        title: `${fractionAsPercent(top10Share)} of tracked keywords sit in the top 10`,
        evidence: `${keywords.summary.top10} of ${keywords.summary.tracked} tracked, ${keywords.summary.top3} in the top 3.`,
        action: 'Expand the tracked set — this list may be understating the opportunity.',
        href: '/keywords',
        magnitude: top10Share * 40,
      });
    }
  }

  /* ── Backlinks ───────────────────────────────────────────────────── */

  if (backlinks.summary.lostLinks > backlinks.summary.newLinks && backlinks.summary.lostLinks > 0) {
    out.push({
      id: 'link-attrition',
      tone: 'warning',
      area: 'Backlinks',
      title: 'Losing links faster than gaining them',
      evidence: `${backlinks.summary.lostLinks} lost against ${backlinks.summary.newLinks} new over ${backlinks.rangeDays} days.`,
      action: 'Recover the highest-authority lost links first — reclamation beats new outreach.',
      href: '/backlinks',
      magnitude: (backlinks.summary.lostLinks - backlinks.summary.newLinks) * 10,
    });
  }

  if (backlinks.summary.referringDomainsDelta > 0) {
    out.push({
      id: 'referring-growth',
      tone: 'good',
      area: 'Backlinks',
      title: `Referring domains grew by ${number(backlinks.summary.referringDomainsDelta)}`,
      evidence: `${number(backlinks.summary.referringDomains)} referring domains at average DA ${
        backlinks.summary.averageDomainAuthority
      }.`,
      href: '/backlinks',
      magnitude: backlinks.summary.referringDomainsDelta * 6,
    });
  }

  const linkPool = Math.max(1, backlinks.backlinks.length || backlinks.summary.referringDomains);
  const toxicShare = backlinks.summary.toxicCandidates / linkPool;
  if (backlinks.summary.toxicCandidates > 0 && toxicShare > 0.05) {
    out.push({
      id: 'toxic-links',
      tone: toxicShare > 0.15 ? 'serious' : 'warning',
      area: 'Backlinks',
      title: `${backlinks.summary.toxicCandidates} referring domains flagged as toxic candidates`,
      evidence: `${fractionAsPercent(toxicShare, 1)} of the profile${
        backlinks.summary.spamScore !== undefined
          ? `, domain spam score ${backlinks.summary.spamScore}`
          : ''
      }.`,
      action: 'Review before disavowing — flagged is not the same as harmful.',
      href: '/backlinks',
      magnitude: toxicShare * 200,
    });
  }

  if (
    backlinks.summary.averageDomainAuthority > 0 &&
    backlinks.summary.averageDomainAuthority < 25
  ) {
    out.push({
      id: 'low-authority',
      tone: 'warning',
      area: 'Backlinks',
      title: `Average referring-domain authority is ${backlinks.summary.averageDomainAuthority}`,
      evidence: `${percent(backlinks.summary.dofollowShare)} of links are dofollow across ${number(
        backlinks.summary.referringDomains,
      )} domains.`,
      action: 'Target fewer, stronger domains rather than volume.',
      href: '/backlinks',
      magnitude: (25 - backlinks.summary.averageDomainAuthority) * 3,
    });
  }

  /* ── Traffic (GA4) ───────────────────────────────────────────────── */

  if (traffic?.data) {
    const ga4 = traffic.data;

    // Half-over-half rather than period-over-period: GA4 is queried for one
    // window, so this is the honest comparison available. Labelled as such.
    const sessionTrend = halfOverHalfDelta(ga4.daily.map((day) => day.sessions));
    if (sessionTrend !== undefined && Math.abs(sessionTrend) >= 10) {
      const growing = sessionTrend > 0;
      out.push({
        id: 'sessions-trend',
        tone: growing ? 'good' : 'warning',
        area: 'Traffic',
        title: `Sessions ${growing ? 'up' : 'down'} ${Math.abs(sessionTrend).toFixed(1)}% within the window`,
        evidence: `${number(ga4.totals.sessions)} sessions from ${number(
          ga4.totals.users,
        )} users; second half of the ${rangeDays} days versus the first.`,
        action: growing
          ? undefined
          : 'Check the channel mix below — a single channel usually accounts for a drop this size.',
        href: '/traffic',
        magnitude: Math.abs(sessionTrend) * 2,
      });
    }

    if (ga4.totals.bounceRate >= 70) {
      out.push({
        id: 'bounce-high',
        tone: ga4.totals.bounceRate >= 85 ? 'serious' : 'warning',
        area: 'Traffic',
        title: `Bounce rate is ${percent(ga4.totals.bounceRate)}`,
        evidence: `Average session ${Math.round(ga4.totals.avgSessionSeconds)}s across ${number(
          ga4.totals.sessions,
        )} sessions.`,
        action: 'Start with the highest-traffic landing page — intent mismatch beats page speed here.',
        href: '/traffic',
        magnitude: ga4.totals.bounceRate,
      });
    }

    // Concentration risk: one channel carrying nearly everything.
    const totalChannelSessions = ga4.channels.reduce(
      (sum, channel) => sum + channel.sessions,
      0,
    );
    const top = ga4.channels[0];
    if (top && totalChannelSessions > 0) {
      const share = top.sessions / totalChannelSessions;
      if (share > 0.7 && ga4.channels.length > 1) {
        out.push({
          id: 'channel-concentration',
          tone: 'warning',
          area: 'Traffic',
          title: `${fractionAsPercent(share)} of sessions come from ${top.channel} alone`,
          evidence: `${number(top.sessions)} of ${number(
            totalChannelSessions,
          )} sessions across ${ga4.channels.length} channels.`,
          action: 'A single-channel profile is fragile — an algorithm or budget change hits everything at once.',
          href: '/traffic',
          magnitude: share * 60,
        });
      }
    }
  }

  /* ── Coverage ────────────────────────────────────────────────────── */

  // Seeded panels are stated as an insight, not only as a footnote: a list
  // built partly on generated data has to say so where it is being read.
  const seeded = [
    backlinks.provider.mode === 'seed' && 'Backlinks',
    keywords.provider.mode === 'seed' && 'rank tracking',
    ads.provider.mode === 'seed' && 'Google Ads',
  ].filter(Boolean) as string[];

  // GA4 is reported separately from the seeded panels: it shows nothing at all
  // rather than demonstration data, so "sample set" would be the wrong wording.
  if (traffic && !traffic.data) {
    out.push({
      id: 'ga4-unavailable',
      tone: 'neutral',
      area: 'Coverage',
      title: 'Website traffic is not being measured yet',
      evidence: traffic.provider.note,
      action: 'Connect Google Analytics 4 in Settings to add sessions, channels and landing pages.',
      href: '/settings',
      magnitude: 0.5,
    });
  }

  if (seeded.length > 0) {
    out.push({
      id: 'seeded-coverage',
      tone: 'neutral',
      area: 'Coverage',
      title: `${seeded.join(', ')} ${seeded.length > 1 ? 'are' : 'is'} showing demonstration data`,
      evidence:
        'Insights drawing on those panels describe the sample set, not this domain.',
      action: 'Connect the provider in Settings to make these figures real.',
      href: '/settings',
      magnitude: seeded.length,
    });
  }

  return out.sort((a, b) => {
    const byTone = TONE_RANK[a.tone] - TONE_RANK[b.tone];
    return byTone !== 0 ? byTone : b.magnitude - a.magnitude;
  });
}

/** Counts by tone, for the summary line above the insight grid. */
export function insightTally(insights: Insight[]) {
  return {
    total: insights.length,
    urgent: insights.filter((i) => i.tone === 'critical' || i.tone === 'serious').length,
    warnings: insights.filter((i) => i.tone === 'warning').length,
    wins: insights.filter((i) => i.tone === 'good').length,
  };
}
