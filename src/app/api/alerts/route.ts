import { NextResponse } from 'next/server';
import { getAdsReport } from '@/lib/providers/ads';
import {
  dispatchAlerts,
  evaluateAlerts,
  loadAlertRules,
  saveAlertRules,
  type AlertRule,
} from '@/lib/providers/alerts';
import { normalizeDomain } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: 'save' | 'test';
    domain?: string;
    rules?: AlertRule[];
  };

  const domain = normalizeDomain(String(body.domain ?? ''));
  if (!domain) {
    return NextResponse.json({ error: 'A domain is required.' }, { status: 400 });
  }

  const report = await getAdsReport(domain, 30);

  if (body.action === 'save') {
    if (!Array.isArray(body.rules)) {
      return NextResponse.json({ error: 'No rules supplied.' }, { status: 400 });
    }

    // Normalise before persisting: budgets positive, thresholds sorted 1–200.
    const rules: AlertRule[] = body.rules.map((rule) => ({
      ...rule,
      monthlyBudget: Math.max(1, Math.round(Number(rule.monthlyBudget) || 0)),
      thresholds: Array.from(
        new Set(
          (rule.thresholds ?? [])
            .map((threshold) => Math.round(Number(threshold)))
            .filter((threshold) => Number.isFinite(threshold) && threshold > 0 && threshold <= 200),
        ),
      ).sort((a, b) => a - b),
      enabled: !!rule.enabled,
    }));

    await saveAlertRules(domain, rules);
    return NextResponse.json({ ok: true, evaluations: evaluateAlerts(report, rules) });
  }

  if (body.action === 'test') {
    const rules = await loadAlertRules(report);
    const evaluations = evaluateAlerts(report, rules);
    return NextResponse.json({ ok: true, dispatch: await dispatchAlerts(evaluations), evaluations });
  }

  const rules = await loadAlertRules(report);
  return NextResponse.json({ ok: true, rules, evaluations: evaluateAlerts(report, rules) });
}
