import { ALERT_RULES_PATH, readJson, writeJson } from '../store';
import { daysElapsedInMonth, daysInCurrentMonth, daysLeftInMonth, type AdsReport } from './ads';

export type AlertScope = 'account' | 'campaign';
export type AlertSeverity = 'ok' | 'warning' | 'serious' | 'critical';

export type AlertRule = {
  id: string;
  scope: AlertScope;
  /** Required when scope is 'campaign'. */
  campaignId?: string;
  label: string;
  monthlyBudget: number;
  /** Percent-of-budget trip points, ascending. */
  thresholds: number[];
  enabled: boolean;
  notify: { webhook: boolean; email: boolean };
};

export type AlertRuleStore = {
  domain: string;
  updatedAt: string;
  rules: AlertRule[];
};

export type AlertEvaluation = {
  rule: AlertRule;
  spendMtd: number;
  monthlyBudget: number;
  /** Percent of the monthly budget already spent. */
  consumedPct: number;
  /** Percent of the month elapsed — the pacing baseline. */
  elapsedPct: number;
  /** Straight-line projection to month end. */
  projectedSpend: number;
  projectedOverspend: number;
  highestThresholdHit: number | null;
  severity: AlertSeverity;
  headline: string;
  detail: string;
  daysLeft: number;
};

const DEFAULT_THRESHOLDS = [50, 75, 90, 100];

/** Budget alerts are only meaningful against real thresholds, so seed sane ones. */
export function defaultRules(report: AdsReport): AlertRule[] {
  return [
    {
      id: 'account',
      scope: 'account',
      label: 'Account total',
      monthlyBudget: Math.round(report.summary.monthlyBudget),
      thresholds: DEFAULT_THRESHOLDS,
      enabled: true,
      notify: { webhook: !!process.env.ALERT_WEBHOOK_URL, email: !!process.env.ALERT_EMAIL_TO },
    },
    ...report.campaigns.map((campaign) => ({
      id: campaign.id,
      scope: 'campaign' as const,
      campaignId: campaign.id,
      label: campaign.name,
      monthlyBudget: Math.round(campaign.budgetMonthly),
      thresholds: DEFAULT_THRESHOLDS,
      enabled: campaign.status !== 'paused',
      notify: { webhook: !!process.env.ALERT_WEBHOOK_URL, email: false },
    })),
  ];
}

export async function loadAlertRules(report: AdsReport): Promise<AlertRule[]> {
  const stored = await readJson<AlertRuleStore | null>(ALERT_RULES_PATH, null);
  const defaults = defaultRules(report);

  if (!stored || stored.domain !== report.domain) return defaults;

  // Merge so newly discovered campaigns still appear, and stored edits win.
  const byId = new Map(stored.rules.map((rule) => [rule.id, rule]));
  return defaults.map((rule) => {
    const override = byId.get(rule.id);
    return override ? { ...rule, ...override, label: rule.label } : rule;
  });
}

export async function saveAlertRules(domain: string, rules: AlertRule[]) {
  const store: AlertRuleStore = { domain, updatedAt: new Date().toISOString(), rules };
  await writeJson(ALERT_RULES_PATH, store);
  return store;
}

function severityFor(consumedPct: number, elapsedPct: number, thresholdHit: number | null): AlertSeverity {
  if (consumedPct >= 100) return 'critical';
  if (thresholdHit !== null && thresholdHit >= 90) return 'serious';
  // Pacing more than 15 points ahead of the month is itself a warning.
  if (consumedPct - elapsedPct > 15 || (thresholdHit !== null && thresholdHit >= 50)) {
    return 'warning';
  }
  return 'ok';
}

export function evaluateAlerts(report: AdsReport, rules: AlertRule[]): AlertEvaluation[] {
  const elapsedDays = daysElapsedInMonth();
  const totalDays = daysInCurrentMonth();
  const elapsedPct = Number(((elapsedDays / totalDays) * 100).toFixed(1));
  const daysLeft = daysLeftInMonth();

  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const spendMtd =
        rule.scope === 'account'
          ? report.summary.spendMtd
          : (report.campaigns.find((campaign) => campaign.id === rule.campaignId)?.spendMtd ?? 0);

      const monthlyBudget = Math.max(1, rule.monthlyBudget);
      const consumedPct = Number(((spendMtd / monthlyBudget) * 100).toFixed(1));
      const projectedSpend = Number(((spendMtd / Math.max(1, elapsedDays)) * totalDays).toFixed(2));

      const sortedThresholds = [...rule.thresholds].sort((a, b) => a - b);
      const hits = sortedThresholds.filter((threshold) => consumedPct >= threshold);
      const highestThresholdHit = hits.length ? hits[hits.length - 1] : null;
      const severity = severityFor(consumedPct, elapsedPct, highestThresholdHit);

      const headline =
        severity === 'critical'
          ? `Budget exhausted — ${consumedPct.toFixed(0)}% of ${rule.label} spent`
          : severity === 'serious'
            ? `${consumedPct.toFixed(0)}% of ${rule.label} budget spent with ${daysLeft} day(s) left`
            : severity === 'warning'
              ? `${rule.label} is pacing ahead of plan`
              : `${rule.label} is on pace`;

      const detail =
        `${consumedPct.toFixed(1)}% of budget consumed against ${elapsedPct.toFixed(1)}% of the month elapsed. ` +
        `Straight-line projection: ${projectedSpend.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })} by month end.`;

      return {
        rule,
        spendMtd: Number(spendMtd.toFixed(2)),
        monthlyBudget,
        consumedPct,
        elapsedPct,
        projectedSpend,
        projectedOverspend: Number(Math.max(0, projectedSpend - monthlyBudget).toFixed(2)),
        highestThresholdHit,
        severity,
        headline,
        detail,
        daysLeft,
      };
    })
    .sort((a, b) => {
      const order: Record<AlertSeverity, number> = { critical: 0, serious: 1, warning: 2, ok: 3 };
      return order[a.severity] - order[b.severity] || b.consumedPct - a.consumedPct;
    });
}

export type DispatchResult = { channel: string; ok: boolean; message: string };

/** Fires configured channels for every non-ok evaluation. */
export async function dispatchAlerts(
  evaluations: AlertEvaluation[],
): Promise<DispatchResult[]> {
  const firing = evaluations.filter((evaluation) => evaluation.severity !== 'ok');
  if (firing.length === 0) {
    return [{ channel: 'none', ok: true, message: 'Nothing is over threshold — no alerts sent.' }];
  }

  const results: DispatchResult[] = [];
  const webhook = process.env.ALERT_WEBHOOK_URL?.trim();

  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          source: 'seo-premium-dashboard',
          firedAt: new Date().toISOString(),
          alerts: firing.map((evaluation) => ({
            label: evaluation.rule.label,
            severity: evaluation.severity,
            headline: evaluation.headline,
            detail: evaluation.detail,
            spendMtd: evaluation.spendMtd,
            monthlyBudget: evaluation.monthlyBudget,
            consumedPct: evaluation.consumedPct,
          })),
        }),
      });
      results.push({
        channel: 'webhook',
        ok: response.ok,
        message: response.ok
          ? `Posted ${firing.length} alert(s) to the configured webhook.`
          : `Webhook returned ${response.status}.`,
      });
    } catch (error) {
      results.push({
        channel: 'webhook',
        ok: false,
        message: `Webhook failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  } else {
    results.push({
      channel: 'webhook',
      ok: false,
      message: 'No ALERT_WEBHOOK_URL configured — set one to deliver alerts to Slack, n8n, or email relay.',
    });
  }

  const email = process.env.ALERT_EMAIL_TO?.trim();
  results.push({
    channel: 'email',
    ok: false,
    message: email
      ? `Email delivery to ${email} needs an SMTP or transactional-email provider — not wired yet.`
      : 'No ALERT_EMAIL_TO configured.',
  });

  return results;
}
