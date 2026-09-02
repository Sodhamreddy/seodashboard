'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DataTable, Meter, type Column } from '@/components/ui/data';
import { Badge, Button, Card, CardHeader, Note, cx, type Tone } from '@/components/ui/primitives';
import { currency, percent } from '@/lib/format';
import type { AlertEvaluation, AlertRule, AlertSeverity, DispatchResult } from '@/lib/providers/alerts';

const SEVERITY_TONE: Record<AlertSeverity, Tone> = {
  ok: 'good',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  ok: 'On pace',
  warning: 'Pacing ahead',
  serious: 'Near cap',
  critical: 'Over budget',
};

const METER_TONE: Record<AlertSeverity, 'accent' | 'warning' | 'serious' | 'critical'> = {
  ok: 'accent',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
};

export function AlertRulesEditor({
  domain,
  rules: initialRules,
  evaluations: initialEvaluations,
}: {
  domain: string;
  rules: AlertRule[];
  evaluations: AlertEvaluation[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [evaluations, setEvaluations] = useState(initialEvaluations);
  const [dispatch, setDispatch] = useState<DispatchResult[] | null>(null);
  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  function updateRule(id: string, patch: Partial<AlertRule>) {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
    setDirty(true);
    setMessage('');
  }

  async function call(action: 'save' | 'test') {
    setPending(action);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, domain, rules }),
      });
      const data = (await response.json()) as {
        error?: string;
        evaluations?: AlertEvaluation[];
        dispatch?: DispatchResult[];
      };

      if (!response.ok) {
        setError(data.error ?? 'Request failed.');
        return;
      }

      if (data.evaluations) setEvaluations(data.evaluations);
      if (action === 'save') {
        setDirty(false);
        setMessage('Rules saved. Thresholds re-evaluated against month-to-date spend.');
        router.refresh();
      } else {
        setDispatch(data.dispatch ?? []);
      }
    } catch {
      setError('Network error — could not reach the alert service.');
    } finally {
      setPending(null);
    }
  }

  const firing = evaluations.filter((evaluation) => evaluation.severity !== 'ok');
  const evaluationByRuleId = new Map(evaluations.map((evaluation) => [evaluation.rule.id, evaluation]));

  const ruleColumns: Column<AlertRule>[] = [
    {
      key: 'scope',
      header: 'Scope',
      render: (rule) => (
        <>
          <span className="block font-medium text-ink">{rule.label}</span>
          <span className="block text-2xs text-ink-muted">{rule.scope}</span>
        </>
      ),
      sortValue: (rule) => rule.label,
    },
    {
      key: 'enabled',
      header: 'Enabled',
      render: (rule) => (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
            className="h-3.5 w-3.5 accent-[color:var(--accent)]"
          />
          <span className="text-2xs text-ink-secondary">{rule.enabled ? 'on' : 'off'}</span>
        </label>
      ),
    },
    {
      key: 'monthlyBudget',
      header: 'Monthly budget',
      render: (rule) => (
        <div className="flex items-center gap-1">
          <span className="text-ink-muted">$</span>
          <input
            type="number"
            min={1}
            value={rule.monthlyBudget}
            onChange={(event) => updateRule(rule.id, { monthlyBudget: Number(event.target.value) })}
            className="h-8 w-24 rounded-md border border-hairline bg-surface-raised px-2 text-xs tnum text-ink focus:border-accent focus:outline-none"
          />
        </div>
      ),
      sortValue: (rule) => rule.monthlyBudget,
    },
    {
      key: 'thresholds',
      header: 'Thresholds (%)',
      render: (rule) => (
        <input
          value={rule.thresholds.join(', ')}
          onChange={(event) =>
            updateRule(rule.id, {
              thresholds: event.target.value
                .split(',')
                .map((part) => Number(part.trim()))
                .filter((value) => Number.isFinite(value)),
            })
          }
          placeholder="50, 75, 90, 100"
          className="h-8 w-36 rounded-md border border-hairline bg-surface-raised px-2 text-xs tnum text-ink focus:border-accent focus:outline-none"
        />
      ),
    },
    {
      key: 'spendMtd',
      header: 'MTD spend',
      align: 'right',
      render: (rule) => {
        const evaluation = evaluationByRuleId.get(rule.id);
        return evaluation ? (
          <>
            {currency(evaluation.spendMtd)}
            <span className="ml-1.5 text-2xs text-ink-muted">{percent(evaluation.consumedPct, 0)}</span>
          </>
        ) : (
          <span className="text-ink-muted">disabled</span>
        );
      },
      sortValue: (rule) => evaluationByRuleId.get(rule.id)?.spendMtd ?? -1,
    },
    {
      key: 'state',
      header: 'State',
      align: 'right',
      render: (rule) => {
        const evaluation = evaluationByRuleId.get(rule.id);
        return evaluation ? (
          <Badge tone={SEVERITY_TONE[evaluation.severity]}>
            {evaluation.highestThresholdHit ? `${evaluation.highestThresholdHit}% hit` : SEVERITY_LABEL[evaluation.severity]}
          </Badge>
        ) : (
          <Badge tone="neutral" icon={null}>
            not evaluated
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Current state ───────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon="bell"
            title="Alerts firing now"
            subtitle="Evaluated against month-to-date spend and straight-line projection"
            action={
              firing.length > 0 ? (
                <Badge tone={SEVERITY_TONE[firing[0].severity]}>{firing.length} firing</Badge>
              ) : (
                <Badge tone="good">all clear</Badge>
              )
            }
          />
          {firing.length === 0 ? (
            <Note tone="good" icon="check">
              Nothing is over threshold. Every enabled rule is pacing at or below plan.
            </Note>
          ) : (
            <ul className="space-y-3">
              {firing.map((evaluation) => (
                <li
                  key={evaluation.rule.id}
                  className="rounded-lg border border-hairline bg-surface-sunken p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[evaluation.severity]}>
                      {SEVERITY_LABEL[evaluation.severity]}
                    </Badge>
                    <p className="text-xs font-medium text-ink">{evaluation.headline}</p>
                  </div>
                  <Meter
                    value={evaluation.spendMtd}
                    max={evaluation.monthlyBudget}
                    valueLabel={`${currency(evaluation.spendMtd)} / ${currency(evaluation.monthlyBudget)}`}
                    markerPct={evaluation.elapsedPct}
                    markerLabel={`${evaluation.elapsedPct.toFixed(0)}% of the month elapsed`}
                    tone={METER_TONE[evaluation.severity]}
                  />
                  <p className="mt-2 text-2xs leading-relaxed text-ink-secondary">{evaluation.detail}</p>
                  {evaluation.projectedOverspend > 0 && (
                    <p className="mt-1 text-2xs font-medium text-status-critical">
                      Projected overspend {currency(evaluation.projectedOverspend)} with{' '}
                      {evaluation.daysLeft} day(s) left.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            icon="send"
            title="Delivery"
            subtitle="A test run evaluates every rule and fires the configured channels"
            action={
              <Button
                variant="secondary"
                size="sm"
                icon="play"
                loading={pending === 'test'}
                onClick={() => void call('test')}
              >
                Run test
              </Button>
            }
          />

          {dispatch ? (
            <ul className="space-y-2">
              {dispatch.map((result, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2.5 rounded-lg border border-hairline p-2.5"
                >
                  <Icon
                    name={result.ok ? 'check' : 'alert'}
                    size={14}
                    className={cx(
                      'mt-0.5 shrink-0',
                      result.ok ? 'text-status-good' : 'text-status-warning',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium capitalize text-ink">{result.channel}</p>
                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-secondary">
                      {result.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Note tone="neutral" icon="info">
              Alerts post a JSON payload to <code className="font-mono">ALERT_WEBHOOK_URL</code> — point it
              at Slack, an n8n webhook, or an email relay. Email needs a transactional provider and is
              reported as unwired until you add one.
            </Note>
          )}
        </Card>
      </section>

      {/* ── Rule editor ─────────────────────────────────────────────── */}
      <Card padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-[0.95rem] font-semibold text-ink">Threshold rules</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              Budgets and thresholds persist to <code className="font-mono">.data/alerts/rules.json</code>.
              A rule fires when month-to-date spend crosses a threshold percentage of its monthly budget.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge tone="warning">unsaved changes</Badge>}
            <Button icon="download" loading={pending === 'save'} onClick={() => void call('save')}>
              Save rules
            </Button>
          </div>
        </div>

        {(message || error) && (
          <div className="px-5 pb-3">
            {message && (
              <Note tone="good" icon="check">
                {message}
              </Note>
            )}
            {error && (
              <Note tone="critical" icon="alert">
                {error}
              </Note>
            )}
          </div>
        )}

        <DataTable
          columns={ruleColumns}
          rows={rules}
          rowKey={(rule) => rule.id}
          caption="Budget alert threshold rules with enabled state, budget, thresholds, MTD spend and state"
        />
      </Card>
    </div>
  );
}
