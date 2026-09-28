'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Sparkline } from '@/components/ui/data';
import { Badge, Button, Card, CardHeader, Note, cx } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import {
  sourceLeaderboard,
  type AiKeywordResult,
  type AiQuestionSet,
  type AiRunPoint,
  type AiVisibilityRun,
} from '@/lib/ai-visibility';

/**
 * Buyer questions: what the assistants say when someone shops the category.
 *
 * Three things on one panel, in the order they are needed:
 *
 *  1. What the model understood the business to be. Everything downstream is
 *     built on that reading, so it is shown first and a wrong one is one click
 *     from being redone.
 *  2. The questions, grouped by service, each carrying what the last run found.
 *  3. Who the answers cited instead — the competitor set that matters in this
 *     channel, which is rarely the same as the one on Google.
 *
 * "Named" and "cited" are kept apart on purpose. An assistant can recommend a
 * business by name with no link, or link a page without ever naming the
 * business in its prose. Both matter; they are different wins.
 */
export function AiQuestionsPanel({
  initialSet,
  initialRun,
  history,
  domain,
  configured,
}: {
  initialSet: AiQuestionSet | null;
  initialRun?: AiVisibilityRun;
  history: AiRunPoint[];
  domain: string;
  configured: boolean;
}) {
  const [set, setSet] = useState(initialSet);
  const [run, setRun] = useState(initialRun);
  const [points, setPoints] = useState(history);
  const [pending, setPending] = useState<'generate' | 'check' | null>(null);
  const [error, setError] = useState('');

  async function generate() {
    if (set && !window.confirm('Regenerating replaces the current questions. Continue?')) return;
    setPending('generate');
    setError('');
    try {
      const response = await fetch('/api/ai-questions', { method: 'POST' });
      const data = (await response.json()) as { error?: string; set?: AiQuestionSet };
      if (!response.ok || !data.set) {
        setError(data.error ?? 'Could not generate questions.');
        return;
      }
      setSet(data.set);
    } catch {
      setError('Network error — nothing was generated.');
    } finally {
      setPending(null);
    }
  }

  async function check() {
    setPending('check');
    setError('');
    try {
      const response = await fetch('/api/ai-visibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine: 'gemini', mode: 'questions' }),
      });
      const data = (await response.json()) as { error?: string; run?: AiVisibilityRun };
      if (!response.ok || !data.run) {
        setError(data.error ?? 'The check could not be run.');
        return;
      }
      const next = data.run;
      setRun(next);
      setPoints((current) => [
        ...current,
        {
          at: next.at,
          engine: next.engine,
          mode: 'questions',
          checked: next.summary.checked,
          cited: next.summary.cited,
          mentioned: next.summary.mentioned,
          averagePosition: next.summary.averagePosition,
        },
      ]);
    } catch {
      setError('Network error — the check did not run.');
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    const response = await fetch('/api/ai-questions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = (await response.json().catch(() => ({}))) as { set?: AiQuestionSet };
    if (data.set) setSet(data.set);
  }

  const resultFor = useMemo(() => {
    const byText = new Map<string, AiKeywordResult>();
    for (const result of run?.results ?? []) byText.set(result.keyword.toLowerCase(), result);
    return (question: string) => byText.get(question.toLowerCase());
  }, [run]);

  const grouped = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof set>['questions']>();
    for (const question of set?.questions ?? []) {
      const list = groups.get(question.topic) ?? [];
      list.push(question);
      groups.set(question.topic, list);
    }
    return [...groups.entries()];
  }, [set]);

  const leaders = sourceLeaderboard(run, 8);
  const own = domain.replace(/^www\./, '').toLowerCase();

  // The trend is question runs only — keyword runs measure a different thing.
  const trend = points.filter((point) => point.mode === 'questions' && point.engine === 'gemini');
  const rate = (point: AiRunPoint) => (point.checked ? point.mentioned / point.checked : 0);

  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <CardHeader
          icon="sparkles"
          title="Buyer questions"
          subtitle="What assistants say when someone shops this category — generated from the business, never naming it"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                loading={pending === 'generate'}
                disabled={!configured || pending !== null}
                onClick={() => void generate()}
              >
                {set ? 'Regenerate' : 'Generate questions'}
              </Button>
              <Button
                size="sm"
                icon="play"
                loading={pending === 'check'}
                disabled={!configured || !set?.questions.length || pending !== null}
                onClick={() => void check()}
              >
                {run ? 'Check again' : 'Check visibility'}
              </Button>
            </div>
          }
        />
      </div>

      <div className="space-y-5 border-t border-hairline p-5">
        {error && (
          <Note tone="critical" icon="alert">
            {error}
          </Note>
        )}

        {!configured ? (
          <Note tone="neutral" icon="info">
            <span className="font-semibold">Needs Gemini.</span> Add{' '}
            <code className="font-mono">GEMINI_API_KEY</code> and restart — the same key generates the
            questions and checks them.
          </Note>
        ) : !set ? (
          <Note tone="neutral" icon="sparkles">
            No questions yet. Generating has Gemini research{' '}
            <span className="font-medium text-ink">{domain}</span> with Google Search, work out what it
            sells and where, and write twelve questions a buyer in that category would ask an
            assistant. Nothing is tracked until you check them.
          </Note>
        ) : (
          <>
            {/* ── 1. How the model reads the business ──────────────── */}
            <div className="rounded-lg border border-hairline bg-surface-sunken p-3.5">
              <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-ink-muted">
                How Gemini reads this business
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink">{set.business}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {set.services.map((service) => (
                  <span
                    key={service}
                    className="rounded-md bg-surface px-1.5 py-0.5 text-2xs text-ink-secondary"
                  >
                    {service}
                  </span>
                ))}
                {set.location && (
                  <span className="flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-2xs text-accent">
                    <Icon name="target" size={10} />
                    {set.location}
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
                Generated {relativeTime(set.generatedAt)} with {set.model}. If this is wrong,
                regenerate before tracking — every question below is built on it.
              </p>
            </div>

            {/* ── Summary and trend, once there is a run ───────────── */}
            {run && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  label="Named in the answer"
                  value={`${run.summary.mentioned} / ${run.summary.checked}`}
                  note="Recommended by name, cited or not"
                />
                <Stat
                  label="Cited as a source"
                  value={`${run.summary.cited} / ${run.summary.checked}`}
                  note="The answer linked this site"
                />
                <Stat
                  label="Average position"
                  value={run.summary.averagePosition?.toString() ?? '—'}
                  note="Among the domains cited, when cited"
                />
                <div className="rounded-lg border border-hairline px-3 py-2.5">
                  <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">Mention rate over time</p>
                  {trend.length > 1 ? (
                    <div className="mt-1.5">
                      <Sparkline values={trend.map(rate)} width={150} height={30} />
                      <p className="mt-1 text-2xs text-ink-muted">
                        {trend.length} runs · first {Math.round(rate(trend[0]) * 100)}% → now{' '}
                        {Math.round(rate(trend[trend.length - 1]) * 100)}%
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-2xs leading-snug text-ink-muted">
                      One run so far. The trend appears from the second.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── 2. The questions ─────────────────────────────────── */}
            <div className="space-y-4">
              {grouped.map(([topic, questions]) => (
                <section key={topic}>
                  <p className="mb-1.5 text-2xs font-bold uppercase tracking-[0.07em] text-ink-secondary">
                    {topic}
                  </p>
                  <ul className="space-y-1.5">
                    {questions.map((question) => {
                      const result = resultFor(question.question);
                      return (
                        <li
                          key={question.id}
                          className="group flex items-start gap-3 rounded-lg border border-hairline px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-ink">{question.question}</p>
                            {result && !result.error && result.sources.length > 0 && (
                              <p className="mt-1 truncate text-2xs text-ink-muted">
                                Cited:{' '}
                                {result.sources
                                  .slice(0, 5)
                                  .map((source) => source.domain)
                                  .join(' · ')}
                                {result.sources.length > 5 ? ` +${result.sources.length - 5}` : ''}
                              </p>
                            )}
                            {result?.error && (
                              <p className="mt-1 text-2xs text-status-critical">{result.error}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {result && <Verdict result={result} />}
                            <button
                              type="button"
                              onClick={() => void remove(question.id)}
                              aria-label={`Remove question: ${question.question}`}
                              title="Remove this question"
                              className="grid h-6 w-6 place-items-center rounded-md text-ink-muted opacity-0 transition hover:bg-tint-critical hover:text-status-critical group-hover:opacity-100 focus:opacity-100"
                            >
                              <Icon name="close" size={11} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {/* ── 3. Who the answers cited instead ─────────────────── */}
            {leaders.length > 0 && (
              <div>
                <p className="mb-2 text-2xs font-bold uppercase tracking-[0.07em] text-ink-secondary">
                  Most-cited sources across these answers
                </p>
                <ol className="space-y-1">
                  {leaders.map((leader, index) => {
                    const isOwn = leader.domain === own || leader.domain.endsWith(`.${own}`);
                    return (
                      <li key={leader.domain} className="flex items-center gap-2.5 text-xs">
                        <span className="tnum w-4 text-right text-2xs text-ink-muted">{index + 1}</span>
                        <span
                          className={cx(
                            'w-44 shrink-0 truncate',
                            isOwn ? 'font-semibold text-accent' : 'text-ink',
                          )}
                          title={leader.domain}
                        >
                          {leader.domain}
                          {isOwn ? ' (you)' : ''}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                          <span
                            className={cx('block h-full rounded-full', isOwn ? 'bg-accent' : 'bg-ink-muted')}
                            style={{ width: `${Math.round(leader.share * 100)}%` }}
                          />
                        </span>
                        <span className="tnum w-20 shrink-0 text-right text-2xs text-ink-muted">
                          {leader.answers} of {run?.results.length} answers
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
              <Icon name="info" size={12} className="mt-0.5 shrink-0" />
              These questions are generated, not observed — no one can see what people type into
              assistants. They are modelled from the business so the tracking covers the category,
              and they never name the client, so a mention is a genuine recommendation. Answers vary
              between runs; read the trend, not a single run.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-hairline px-3 py-2.5">
      <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-2xs leading-snug text-ink-muted">{note}</p>
    </div>
  );
}

function Verdict({ result }: { result: AiKeywordResult }) {
  if (result.error) {
    return (
      <Badge tone="critical" icon="alert">
        failed
      </Badge>
    );
  }
  if (result.mentioned && result.cited) {
    return (
      <Badge tone="good" icon="check">
        named · cited #{result.position}
      </Badge>
    );
  }
  if (result.cited) {
    return <Badge tone="good" icon={null}>cited #{result.position}</Badge>;
  }
  if (result.mentioned) {
    return <Badge tone="accent" icon={null}>named</Badge>;
  }
  return (
    <Badge tone="neutral" icon={null}>
      not mentioned
    </Badge>
  );
}
