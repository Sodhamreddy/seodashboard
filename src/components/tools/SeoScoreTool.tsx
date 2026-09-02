'use client';

import { useState } from 'react';
import { BarList } from '@/components/charts/ChartShell';
import { Icon, type IconName } from '@/components/ui/Icon';
import { InlineSnippet } from '@/components/ui/InlineSnippet';
import { Instructions } from '@/components/ui/Instructions';
import { ScoreGauge, StatTile } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Note,
  SectionHeading,
  Select,
  cx,
  type Tone,
} from '@/components/ui/primitives';
import { ToolAction, ToolField, ToolForm } from './ToolForm';
import { bytes, duration, number } from '@/lib/format';
import type { CategoryScore, Check, CheckStatus, SeoScoreResult } from '@/lib/seo/score';

const STATUS_TONE: Record<CheckStatus, Tone> = {
  pass: 'good',
  warn: 'warning',
  fail: 'critical',
  info: 'neutral',
};

const STATUS_ICON: Record<CheckStatus, IconName> = {
  pass: 'check',
  warn: 'alert',
  fail: 'close',
  info: 'info',
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Warning',
  fail: 'Fail',
  info: 'Info',
};

function CheckRow({ check }: { check: Check }) {
  return (
    <li className="flex items-start gap-3 border-b border-hairline py-2.5 last:border-0">
      <span
        className={cx(
          'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md',
          check.status === 'pass' && 'bg-tint-good text-status-good',
          check.status === 'warn' && 'bg-tint-warning text-ink',
          check.status === 'fail' && 'bg-tint-critical text-status-critical',
          check.status === 'info' && 'bg-surface-sunken text-ink-muted',
        )}
        title={STATUS_LABEL[check.status]}
      >
        <Icon name={STATUS_ICON[check.status]} size={12} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-medium text-ink">{check.label}</p>
          <span className="shrink-0 text-2xs uppercase tracking-[0.06em] text-ink-muted">
            {STATUS_LABEL[check.status]}
          </span>
        </div>
        <p className="mt-0.5 break-words text-2xs leading-relaxed text-ink-secondary">{check.detail}</p>
        {check.status !== 'pass' && check.status !== 'info' && check.fix && (
          <p className="mt-1 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
            <Icon name="chevronRight" size={11} className="mt-0.5 shrink-0" />
            {check.fix}
          </p>
        )}
        {check.suggestion && (
          <InlineSnippet
            className="mt-2"
            label={check.suggestion.label}
            code={check.suggestion.code}
          />
        )}
      </div>
    </li>
  );
}

function CategoryCard({ category }: { category: CategoryScore }) {
  return (
    <Card>
      <CardHeader
        title={category.name}
        subtitle={category.blurb}
        action={
          <div className="text-right">
            <p className="text-xl font-semibold leading-none tnum text-ink">{category.score}</p>
            <p className="mt-1 text-2xs text-ink-muted">weight {category.weight}</p>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {category.counts.pass > 0 && <Badge tone="good">{category.counts.pass} pass</Badge>}
        {category.counts.warn > 0 && <Badge tone="warning">{category.counts.warn} warning</Badge>}
        {category.counts.fail > 0 && <Badge tone="critical">{category.counts.fail} fail</Badge>}
      </div>
      <ul>
        {category.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
    </Card>
  );
}

export function SeoScoreTool({ defaultUrl }: { defaultUrl: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [result, setResult] = useState<SeoScoreResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/tools/seo-score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, strategy }),
      });
      const data = (await response.json()) as SeoScoreResult & { error?: string };

      if (!response.ok) {
        setError(data.error ?? 'Analysis failed.');
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error — could not reach the analyzer.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use the SEO Score Checker"
        icon="gauge"
        steps={[
          <>
            Enter any page URL and press <strong className="text-ink">Run audit</strong>. The page
            is fetched live and checked against 30 weighted on-page signals.
          </>,
          <>
            Work the <strong className="text-ink">Priority fixes</strong> list top-down — it is
            sorted by severity, then by how much each check moves the score.
          </>,
          <>
            The five <strong className="text-ink">category scores</strong> show where the weakness
            is; expand a category to see every check with its evidence and the fix.
          </>,
          <>
            <strong className="text-ink">Core Web Vitals</strong> come from Google PageSpeed
            Insights and reflect real Chrome users — they usually take 30–90 seconds to arrive.
          </>,
        ]}
      />

      <Card>
        <ToolForm
          onSubmit={run}
          hint="Fetched live, parsed, and checked against 30 weighted on-page signals."
        >
          <ToolField label="Page URL" htmlFor="score-url">
            <Input
              id="score-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/services"
              required
            />
          </ToolField>
          <ToolField label="PageSpeed strategy" htmlFor="score-strategy" width={170}>
            <Select
              id="score-strategy"
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as 'mobile' | 'desktop')}
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </Select>
          </ToolField>
          <ToolAction>
            <Button type="submit" loading={pending} icon="play">
              {pending ? 'Analyzing…' : 'Run audit'}
            </Button>
          </ToolAction>
        </ToolForm>

        {error && (
          <div className="mt-4">
            <Note tone="critical" icon="alert">
              {error}
            </Note>
          </div>
        )}
      </Card>

      {!result && !pending && !error && (
        <EmptyState
          icon="gauge"
          title="No audit yet"
          description="Enter a URL and run the audit. Every check reports what it found, why it matters, and the fix — no black-box score."
        />
      )}

      {result && (
        <>
          {/* ── Hero score ─────────────────────────────────────────── */}
          <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
            <Card className="flex flex-col items-center justify-center gap-4">
              <ScoreGauge score={result.score} grade={result.grade} />
              <p className="max-w-[240px] text-center text-xs leading-relaxed text-ink-secondary">
                {result.verdict}
              </p>
            </Card>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label="Content depth"
                  value={number(result.page.wordCount)}
                  unit="words"
                  icon="doc"
                />
                <StatTile
                  label="HTML payload"
                  value={bytes(result.page.sizeBytes)}
                  icon="layers"
                />
                <StatTile label="TTFB" value={duration(result.page.ttfbMs)} icon="clock" />
                <StatTile
                  label="HTTP status"
                  value={result.page.status}
                  icon="shield"
                  footnote={result.crawl.sitemap.found ? 'Sitemap found' : 'No sitemap found'}
                />
              </div>

              <Card>
                <CardHeader
                  icon="target"
                  title="Priority fixes"
                  subtitle="Ordered by severity, then by how much the check weighs on the score"
                />
                {result.priorityFixes.length === 0 ? (
                  <Note tone="good" icon="check">
                    Nothing is failing or warning — every check passed.
                  </Note>
                ) : (
                  <ol className="space-y-2.5">
                    {result.priorityFixes.map((check, index) => (
                      <li key={check.id} className="flex items-start gap-3">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-surface-sunken text-2xs font-semibold tnum text-ink-secondary">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-medium text-ink">{check.label}</p>
                            <Badge tone={STATUS_TONE[check.status]}>{STATUS_LABEL[check.status]}</Badge>
                          </div>
                          <p className="mt-0.5 text-2xs leading-relaxed text-ink-secondary">
                            {check.fix ?? check.detail}
                          </p>
                          {check.suggestion && (
                            <InlineSnippet
                              className="mt-2"
                              label={check.suggestion.label}
                              code={check.suggestion.code}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>

          {/* ── Category scores ────────────────────────────────────── */}
          <section>
            <SectionHeading
              title="Category scores"
              subtitle="Each category rolls up its own weighted checks; the overall score weights the categories"
            />
            <Card className="mb-4">
              <BarList
                data={result.categories.map((category) => ({
                  label: category.name,
                  value: category.score,
                }))}
                valueFormat="raw"
              />
            </Card>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {result.categories.map((category) => (
                <CategoryCard key={category.key} category={category} />
              ))}
            </div>
          </section>

          {/* ── Core Web Vitals ────────────────────────────────────── */}
          <section>
            <SectionHeading title="Core Web Vitals" subtitle={result.vitals?.source ?? 'PageSpeed Insights'} />
            {result.vitals ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label={`Performance (${result.vitals.strategy})`}
                  value={result.vitals.performance ?? '—'}
                  icon="gauge"
                />
                <StatTile
                  label="LCP"
                  value={result.vitals.lcpMs ? duration(result.vitals.lcpMs) : '—'}
                  footnote="Good ≤ 2.5 s"
                  icon="clock"
                />
                <StatTile
                  label="CLS"
                  value={result.vitals.clsScore ?? '—'}
                  footnote="Good ≤ 0.1"
                  icon="layers"
                />
                <StatTile
                  label="Total blocking time"
                  value={result.vitals.tbtMs ? duration(result.vitals.tbtMs) : '—'}
                  footnote="Good ≤ 200 ms"
                  icon="clock"
                />
              </div>
            ) : (
              <Note tone="neutral" icon="info">
                {result.vitalsNote}
              </Note>
            )}
          </section>

          {/* ── Crawl context ──────────────────────────────────────── */}
          <Card>
            <CardHeader
              icon="sitemap"
              title="Crawl context"
              subtitle="Site-level signals fetched alongside the page"
            />
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-2xs uppercase tracking-[0.06em] text-ink-muted">robots.txt</dt>
                <dd className="mt-1 text-xs text-ink">
                  {result.crawl.robotsTxt.found ? (
                    <>
                      Found at{' '}
                      <a
                        href={result.crawl.robotsTxt.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        {result.crawl.robotsTxt.url}
                      </a>
                      {result.crawl.robotsTxt.blocksEverything && (
                        <span className="ml-1.5">
                          <Badge tone="critical">Blocks all crawling</Badge>
                        </span>
                      )}
                    </>
                  ) : (
                    'Not found'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-[0.06em] text-ink-muted">XML sitemap</dt>
                <dd className="mt-1 break-all text-xs text-ink">
                  {result.crawl.sitemap.found
                    ? `${result.crawl.sitemap.url} · ${result.crawl.sitemap.urlCount} entries`
                    : 'Not found'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-hairline pt-3 text-2xs text-ink-muted">
              Audited {new Date(result.page.checkedAt).toLocaleString()} · {result.page.url}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
