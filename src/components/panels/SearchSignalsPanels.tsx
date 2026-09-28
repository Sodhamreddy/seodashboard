import Link from 'next/link';
import { Panel } from '@/components/panels/Panel';
import { Sparkline } from '@/components/ui/data';
import { Badge, cx } from '@/components/ui/primitives';
import {
  sourceLeaderboard,
  type AiQuestionSet,
  type AiVisibilityStore,
} from '@/lib/ai-visibility';
import { relativeTime } from '@/lib/format';
import { compareSnapshots, type SerpStore } from '@/lib/serp';

/**
 * The two newest signals, on the Overview.
 *
 * AI visibility and the SERP Agent each have a page, but a page you have to
 * know to open is how a feature goes unseen — the Overview is where the day
 * starts, so each gets a panel here with the one or two numbers that matter
 * and a link to the detail. Both read only what is already stored; nothing is
 * fetched from Gemini or the agent on render.
 */
export function SearchSignalsPanels({
  domain,
  aiRuns,
  questionSet,
  serp,
}: {
  domain: string;
  aiRuns: AiVisibilityStore;
  questionSet: AiQuestionSet | null;
  serp: SerpStore;
}) {
  return (
    <section className="grid items-start gap-4 xl:grid-cols-2">
      <AiVisibilityPanel domain={domain} aiRuns={aiRuns} questionSet={questionSet} />
      <SerpAgentPanel serp={serp} />
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs uppercase tracking-[0.06em] text-ink-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold leading-none text-ink">{value}</p>
      {note && <p className="mt-1 truncate text-2xs text-ink-muted">{note}</p>}
    </div>
  );
}

function Empty({ children, href, action }: { children: React.ReactNode; href: string; action: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-xs leading-relaxed text-ink-secondary">{children}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2.5 py-1.5 text-2xs font-medium text-ink transition-colors hover:bg-surface-sunken"
      >
        {action} ›
      </Link>
    </div>
  );
}

function AiVisibilityPanel({
  domain,
  aiRuns,
  questionSet,
}: {
  domain: string;
  aiRuns: AiVisibilityStore;
  questionSet: AiQuestionSet | null;
}) {
  const run = aiRuns.questions?.gemini;
  const own = domain.replace(/^www\./, '').toLowerCase();
  const rivals = sourceLeaderboard(run, 6).filter(
    (leader) => leader.domain !== own && !leader.domain.endsWith(`.${own}`),
  );
  const trend = (aiRuns.history ?? []).filter(
    (point) => point.mode === 'questions' && point.engine === 'gemini' && point.checked > 0,
  );

  return (
    <Panel
      title="AI Search visibility"
      subtitle="Do assistants recommend this client when a buyer asks about the category?"
      icon="sparkles"
      tone="violet"
      href="/ai-overview"
    >
      {!run ? (
        questionSet ? (
          <Empty href="/ai-overview" action="Run the check">
            {questionSet.questions.length} buyer questions are ready across{' '}
            {questionSet.services.length} services, but none have been checked yet.
          </Empty>
        ) : (
          <Empty href="/ai-overview" action="Generate buyer questions">
            Nothing tracked yet. Generate the questions a buyer would ask an assistant about this
            business, then check whether Gemini recommends or cites it.
          </Empty>
        )
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Figure
              label="Named"
              value={`${run.summary.mentioned}/${run.summary.checked}`}
              note="Recommended by name"
            />
            <Figure
              label="Cited"
              value={`${run.summary.cited}/${run.summary.checked}`}
              note="Linked as a source"
            />
            <Figure
              label="Avg position"
              value={run.summary.averagePosition?.toString() ?? '—'}
              note="When cited"
            />
          </div>

          {trend.length > 1 && (
            <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-3">
              <Sparkline values={trend.map((point) => point.mentioned / point.checked)} width={140} height={28} />
              <p className="text-2xs text-ink-muted">Mention rate across {trend.length} runs</p>
            </div>
          )}

          {rivals.length > 0 && (
            <div className="mt-4 border-t border-hairline pt-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-muted">
                Cited instead
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rivals.slice(0, 5).map((leader) => (
                  <span
                    key={leader.domain}
                    className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-2xs text-ink-secondary"
                  >
                    {leader.domain}{' '}
                    <span className="tnum text-ink-muted">
                      {leader.answers}/{run.results.length}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-3 text-2xs text-ink-muted">
            Gemini · {run.results.length} questions · checked {relativeTime(run.at)}
            {(run.summary.failed ?? 0) > 0 ? ` · ${run.summary.failed} failed` : ''}
          </p>
        </>
      )}
    </Panel>
  );
}

function SerpAgentPanel({ serp }: { serp: SerpStore }) {
  const latest = serp.snapshots[serp.snapshots.length - 1];
  const previous = latest
    ? [...serp.snapshots]
        .reverse()
        .find((s) => s !== latest && s.engine === latest.engine && s.device === latest.device)
    : undefined;
  const { rows, summary } = compareSnapshots(latest, previous);

  const best = [...rows]
    .filter((row) => row.position !== null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 5);

  return (
    <Panel
      title="SERP Agent"
      subtitle="Exact Google positions reported by the agent"
      icon="target"
      tone="blue"
      href="/serp"
    >
      {!latest ? (
        <Empty href="/serp" action="See how to connect it">
          The SERP Agent has not reported for this client yet. Once it posts its results, exact
          positions and movement between runs appear here.
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Figure
              label="Avg position"
              value={summary.averagePosition?.toString() ?? '—'}
              note={`${summary.ranking} of ${summary.tracked} ranking`}
            />
            <Figure label="Top 3" value={String(summary.top3)} note={`${summary.top10} in top 10`} />
            <Figure
              label="Moved"
              value={previous ? `${summary.improved}↑ ${summary.declined}↓` : '—'}
              note={previous ? 'Since the last run' : 'Needs a second run'}
            />
          </div>

          {best.length > 0 && (
            <ul className="mt-4 border-t border-hairline pt-2">
              {best.map((row) => (
                <li
                  key={row.keyword}
                  className="flex items-center gap-3 border-b border-hairline py-1.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-ink" title={row.keyword}>
                    {row.keyword}
                  </span>
                  <span className="tnum shrink-0 text-2xs text-ink-secondary">#{row.position}</span>
                  <span className="w-12 shrink-0 text-right">
                    {row.isNew ? (
                      <Badge tone="good" icon={null}>new</Badge>
                    ) : row.change ? (
                      <span
                        className={cx(
                          'tnum text-2xs font-medium',
                          row.change < 0 ? 'text-status-good' : 'text-status-critical',
                        )}
                      >
                        {row.change < 0 ? '↑' : '↓'}
                        {Math.abs(row.change)}
                      </span>
                    ) : (
                      <span className="text-2xs text-ink-muted">—</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-2xs text-ink-muted">
            {latest.engine} · {latest.device}
            {latest.location ? ` · ${latest.location}` : ''} · reported {relativeTime(latest.at)}
          </p>
        </>
      )}
    </Panel>
  );
}
