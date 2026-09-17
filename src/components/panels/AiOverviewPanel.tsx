'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Card, CardHeader, Note, cx } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import {
  AI_ENGINES,
  type AiEngine,
  type AiVisibilityRun,
  type AiVisibilityStore,
} from '@/lib/ai-visibility';

/**
 * Whether answer engines cite this site for the keywords it already ranks for.
 *
 * There is no position ten in an AI answer: a site is cited as a source or it
 * is not, and if it is, what matters is how many other sources were named
 * ahead of it. So the table reports exactly that — cited or not, the rank
 * among distinct cited domains, and who else was in the answer, which is the
 * competitor list that actually matters in this channel.
 *
 * The check runs on a button rather than on page load. Each keyword is a
 * grounded model call costing seconds and quota; spending that on every visit
 * to the traffic page would be spending it on nobody's behalf.
 */
export function AiOverviewPanel({
  runs,
  configured,
}: {
  runs: AiVisibilityStore;
  /** Which engines have a key on the server. */
  configured: Record<AiEngine, boolean>;
}) {
  const [store, setStore] = useState(runs);
  const [pending, setPending] = useState<AiEngine | null>(null);
  const [error, setError] = useState('');

  async function check(engine: AiEngine) {
    setPending(engine);
    setError('');
    try {
      const response = await fetch('/api/ai-visibility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engine }),
      });
      const data = (await response.json()) as { error?: string; run?: AiVisibilityRun };
      if (!response.ok || !data.run) {
        setError(data.error ?? 'The check could not be run.');
        return;
      }
      setStore((current) => ({ ...current, [engine]: data.run }));
    } catch {
      setError('Network error — the check did not run.');
    } finally {
      setPending(null);
    }
  }

  const gemini = store.gemini;

  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <CardHeader
          icon="sparkles"
          title="AI Overview"
          subtitle="Whether answer engines cite this site for the keywords it already ranks for on Google"
          action={
            <Button
              size="sm"
              icon="play"
              loading={pending === 'gemini'}
              disabled={!configured.gemini}
              onClick={() => void check('gemini')}
            >
              {gemini ? 'Run again' : 'Check Gemini'}
            </Button>
          }
        />
      </div>

      {/* ── Engine coverage ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-hairline bg-surface-sunken px-5 py-2.5">
        {AI_ENGINES.map((engine) => {
          const ready = configured[engine.id];
          const wired = engine.id === 'gemini';
          return (
            <span key={engine.id} className="flex items-center gap-1.5 text-2xs text-ink-secondary">
              <span
                aria-hidden="true"
                className={cx(
                  'h-1.5 w-1.5 rounded-full',
                  wired && ready ? 'bg-status-good' : 'bg-ink-muted',
                )}
              />
              {engine.label}
              <span className="text-ink-muted">
                {!wired ? 'adapter to come' : ready ? 'ready' : `needs ${engine.env}`}
              </span>
            </span>
          );
        })}
        {gemini && (
          <span className="ml-auto font-mono text-2xs text-ink-muted">
            {gemini.model} · {relativeTime(gemini.at)}
          </span>
        )}
      </div>

      <div className="p-5">
        {error && (
          <Note tone="critical" icon="alert">
            {error}
          </Note>
        )}

        {!configured.gemini ? (
          <Note tone="neutral" icon="info">
            <span className="font-semibold">Gemini is not configured.</span> Add{' '}
            <code className="font-mono">GEMINI_API_KEY</code> to the server environment and restart,
            then press Check. ChatGPT and Claude follow the same shape once their adapters land —
            the stored results and this table do not change.
          </Note>
        ) : !gemini ? (
          <Note tone="neutral" icon="sparkles">
            No check has been run for this client yet. It asks Gemini your top five ranking keywords
            with Google Search grounding on, and records which sources the answer actually cited.
          </Note>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Figure
                label="Cited"
                value={`${gemini.summary.cited} / ${gemini.summary.checked}`}
                note="Keywords where the answer used this site as a source"
              />
              <Figure
                label="Average position"
                value={gemini.summary.averagePosition?.toString() ?? '—'}
                note="Rank among the distinct domains cited"
              />
              <Figure
                label="Named in the answer"
                value={`${gemini.summary.mentioned} / ${gemini.summary.checked}`}
                note="Mentioned in the prose, cited or not"
              />
            </div>

            <ul className="space-y-2">
              {gemini.results.map((result) => (
                <li
                  key={result.keyword}
                  className="rounded-lg border border-hairline p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-ink">{result.keyword}</p>
                    {result.error ? (
                      <Badge tone="critical" icon="alert">
                        failed
                      </Badge>
                    ) : result.cited ? (
                      <Badge tone="good" icon="check">
                        cited · position {result.position}
                      </Badge>
                    ) : result.mentioned ? (
                      <Badge tone="warning">named, not cited</Badge>
                    ) : (
                      <Badge tone="neutral" icon={null}>
                        not cited
                      </Badge>
                    )}
                  </div>

                  {result.error ? (
                    <p className="mt-1.5 text-2xs leading-relaxed text-status-critical">
                      {result.error}
                    </p>
                  ) : result.sources.length === 0 ? (
                    <p className="mt-1.5 text-2xs text-ink-muted">
                      The answer cited no sources — nothing to rank against.
                    </p>
                  ) : (
                    <ol className="mt-2 flex flex-wrap gap-1.5">
                      {result.sources.slice(0, 8).map((source, index) => {
                        const isSite = index + 1 === result.position;
                        return (
                          <li
                            key={`${source.domain}-${index}`}
                            className={cx(
                              'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs',
                              isSite
                                ? 'bg-accent-soft font-semibold text-accent'
                                : 'bg-surface-sunken text-ink-secondary',
                            )}
                            title={source.title}
                          >
                            <span className="tnum text-ink-muted">{index + 1}</span>
                            {source.domain}
                          </li>
                        );
                      })}
                      {result.sources.length > 8 && (
                        <li className="px-1.5 py-0.5 text-2xs text-ink-muted">
                          +{result.sources.length - 8} more
                        </li>
                      )}
                    </ol>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
              <Icon name="info" size={12} className="mt-0.5 shrink-0" />
              Grounded answers only: the sources above are the ones Gemini actually retrieved, not
              the model&rsquo;s recollection. Results move between runs — treat one run as a sample,
              not a rank.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-hairline px-3 py-2.5">
      <p className="text-2xs uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      <p className="mt-1 tnum text-xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-2xs leading-snug text-ink-muted">{note}</p>
    </div>
  );
}
