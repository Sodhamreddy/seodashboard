import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertRulesEditor } from '@/components/panels/AlertRulesEditor';
import { StatTile } from '@/components/ui/data';
import { Button, EmptyState, Note } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { currency, percent } from '@/lib/format';
import { daysLeftInMonth, getAdsReport } from '@/lib/providers/ads';
import { evaluateAlerts, loadAlertRules } from '@/lib/providers/alerts';

export const metadata: Metadata = { title: 'Budget Alert System' };
export const dynamic = 'force-dynamic';

export default async function BudgetAlertsPage() {
  const domain = getActiveDomain();
  const report = await getAdsReport(domain, 30);
  const rules = await loadAlertRules(report);
  const evaluations = evaluateAlerts(report, rules);

  const firing = evaluations.filter((evaluation) => evaluation.severity !== 'ok');
  const account = evaluations.find((evaluation) => evaluation.rule.scope === 'account');
  const projectedOverspend = evaluations.reduce(
    (sum, evaluation) =>
      evaluation.rule.scope === 'campaign' ? sum + evaluation.projectedOverspend : sum,
    0,
  );

  // Seeding is suppressed for a client with no Ads account, so there is
  // nothing to render here — see AdsReport.available.
  if (!report.available) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon="bars"
          title="No Google Ads account to monitor"
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
          <span className="font-semibold">Spend figures are seeded for {domain}.</span>{' '}
          {report.provider.note} The threshold engine, persistence and webhook delivery are real — they
          simply evaluate against seeded spend until the Ads adapter is wired.
        </Note>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Alerts firing"
          value={firing.length}
          footnote={`${evaluations.length} enabled rule(s) evaluated`}
          icon="bell"
        />
        <StatTile
          label="Account MTD spend"
          value={currency(report.summary.spendMtd)}
          footnote={
            account
              ? `${percent(account.consumedPct, 0)} of ${currency(account.monthlyBudget)} budget`
              : undefined
          }
          icon="bars"
        />
        <StatTile
          label="Projected month end"
          value={account ? currency(account.projectedSpend) : '—'}
          footnote={
            account && account.projectedOverspend > 0
              ? `Over by ${currency(account.projectedOverspend)}`
              : 'Within budget at current pace'
          }
          icon="target"
        />
        <StatTile
          label="Days left in month"
          value={daysLeftInMonth()}
          footnote={
            projectedOverspend > 0
              ? `${currency(projectedOverspend)} campaign overspend projected`
              : 'No campaign overspend projected'
          }
          icon="clock"
        />
      </div>

      <AlertRulesEditor domain={domain} rules={rules} evaluations={evaluations} />
    </div>
  );
}
