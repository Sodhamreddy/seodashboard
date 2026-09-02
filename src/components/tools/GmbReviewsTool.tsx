'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Instructions } from '@/components/ui/Instructions';
import { StatTile } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Note,
  SectionHeading,
  Textarea,
  cx,
} from '@/components/ui/primitives';
import { number, percent, relativeTime } from '@/lib/format';
import type { GmbReview, GmbReviewsReport } from '@/lib/providers/gmb';
import type { GmbRules, ReviewDraft } from '@/lib/providers/gmb-automation';

/** Star row. The numeral is shown too — colour and glyph alone are not enough. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${rating} of 5 stars`}>
      <span aria-hidden className="text-status-warning">
        {'★'.repeat(Math.max(0, rating))}
        <span className="text-ink-muted">{'☆'.repeat(Math.max(0, 5 - rating))}</span>
      </span>
      <span className="tnum text-2xs text-ink-secondary">{rating}/5</span>
    </span>
  );
}

export function GmbReviewsTool({
  report,
  rules: initialRules,
  drafts: initialDrafts,
}: {
  report: GmbReviewsReport;
  rules: GmbRules;
  drafts: ReviewDraft[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [drafts] = useState(initialDrafts);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [published, setPublished] = useState<Record<string, 'sending' | 'done' | string>>({});
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [tab, setTab] = useState<'queue' | 'all' | 'templates'>('queue');

  const textFor = (draft: ReviewDraft) => edited[draft.review.name] ?? draft.draft;

  async function publish(draft: ReviewDraft) {
    const comment = textFor(draft).trim();
    if (!comment) return;

    setPublished((current) => ({ ...current, [draft.review.name]: 'sending' }));
    try {
      const response = await fetch('/api/gmb', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewName: draft.review.name, comment }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      setPublished((current) => ({
        ...current,
        [draft.review.name]: response.ok ? 'done' : (data.error ?? 'Failed to publish'),
      }));
    } catch {
      setPublished((current) => ({ ...current, [draft.review.name]: 'Network error' }));
    }
  }

  async function saveRules() {
    setSavingRules(true);
    setRulesSaved(false);
    try {
      const response = await fetch('/api/gmb', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (response.ok) setRulesSaved(true);
    } finally {
      setSavingRules(false);
    }
  }

  const maxBar = useMemo(
    () => Math.max(1, ...report.summary.distribution),
    [report.summary.distribution],
  );

  return (
    <div className="space-y-6">
      <Instructions
        title="How the review automation works"
        icon="sparkles"
        steps={[
          <>
            The <strong className="text-ink">Reply queue</strong> pairs every unanswered review with
            the template that fits its star rating, and fills in the reviewer&rsquo;s name.
          </>,
          <>
            <strong className="text-ink">Nothing is published automatically.</strong> Drafts are
            generated locally; you edit and press Publish per review. A reply appears publicly under
            the business name, so it always takes a human action.
          </>,
          <>
            Edit the wording under <strong className="text-ink">Templates</strong>. Use{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">{'{{reviewer}}'}</code>,{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">{'{{business}}'}</code> and{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">{'{{rating}}'}</code>.
          </>,
        ]}
      />

      <Note tone="neutral" icon="info">
        <span className="font-semibold">{report.location.title}</span> ·{' '}
        {number(report.summary.total)} reviews on the profile, {report.reviews.length} fetched.
        {report.otherLocations.length > 0 && (
          <>
            {' '}
            This account also manages {report.otherLocations.length} other location
            {report.otherLocations.length === 1 ? '' : 's'} — set{' '}
            <code className="font-mono">GMB_LOCATION_ID</code> to switch.
          </>
        )}
      </Note>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Average rating"
          value={report.summary.averageRating.toFixed(2)}
          unit="/ 5"
          footnote={`${number(report.summary.total)} reviews total`}
          icon="target"
          tone={report.summary.averageRating >= 4.5 ? 'good' : 'warning'}
        />
        <StatTile
          label="Response rate"
          value={percent(report.summary.responseRate)}
          footnote={`${report.summary.replied} of ${report.reviews.length} fetched answered`}
          icon="send"
          tone={report.summary.responseRate >= 80 ? 'good' : 'warning'}
        />
        <StatTile
          label="Awaiting reply"
          value={number(report.summary.unreplied)}
          footnote={`${report.summary.urgentUnreplied} at 3 stars or below`}
          icon="bell"
          tone={report.summary.urgentUnreplied > 0 ? 'critical' : 'neutral'}
        />
        <StatTile
          label="Negative reviews"
          value={number(report.summary.distribution[0] + report.summary.distribution[1])}
          footnote="1–2 star, in the fetched window"
          icon="alert"
          tone={
            report.summary.distribution[0] + report.summary.distribution[1] > 0
              ? 'warning'
              : 'good'
          }
        />
      </div>

      <Card>
        <CardHeader icon="bars" title="Rating distribution" subtitle="Of the reviews fetched" />
        <ul className="space-y-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = report.summary.distribution[stars - 1];
            return (
              <li key={stars} className="flex items-center gap-3">
                <span className="tnum w-8 shrink-0 text-2xs text-ink-secondary">{stars}★</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(count / maxBar) * 100}%`,
                      background: stars >= 4 ? 'var(--status-good)' : stars === 3 ? 'var(--status-warning)' : 'var(--status-critical)',
                    }}
                  />
                </span>
                <span className="tnum w-10 shrink-0 text-right text-2xs text-ink-secondary">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['queue', `Reply queue ${drafts.length}`],
            ['all', `All reviews ${report.reviews.length}`],
            ['templates', `Templates ${rules.templates.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cx(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              tab === key
                ? 'border-transparent bg-accent-soft text-accent'
                : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <section className="space-y-3">
          <SectionHeading
            title="Reply queue"
            subtitle="Lowest ratings first — drafted locally, published only when you press the button"
          />
          {drafts.length === 0 ? (
            <EmptyState
              icon="check"
              title="Every fetched review has a reply"
              description="Nothing is waiting. New reviews will appear here as they arrive."
            />
          ) : (
            drafts.map((draft) => {
              const state = published[draft.review.name];
              const done = state === 'done';
              const sending = state === 'sending';
              const failed = typeof state === 'string' && state !== 'done' && state !== 'sending';

              return (
                <Card key={draft.review.name}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars rating={draft.review.rating} />
                        <span className="text-xs font-medium text-ink">
                          {draft.review.reviewer}
                        </span>
                        {draft.review.createdAt && (
                          <span className="text-2xs text-ink-muted">
                            {relativeTime(draft.review.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-2xs text-ink-muted">{draft.reason}</p>
                    </div>
                    {draft.template && (
                      <Badge tone="accent" icon="sparkles">
                        {draft.template.label}
                      </Badge>
                    )}
                  </div>

                  {draft.review.comment ? (
                    <blockquote className="mb-3 border-l-2 border-hairline pl-3 text-xs leading-relaxed text-ink-secondary">
                      {draft.review.comment}
                    </blockquote>
                  ) : (
                    <p className="mb-3 text-xs italic text-ink-muted">
                      Rating only — this reviewer left no text.
                    </p>
                  )}

                  {!draft.template ? (
                    <Note tone="warning" icon="alert">
                      No template covers {draft.review.rating} stars. Add one under Templates, or
                      write a reply below.
                    </Note>
                  ) : null}

                  <Textarea
                    value={textFor(draft)}
                    onChange={(event) =>
                      setEdited((current) => ({
                        ...current,
                        [draft.review.name]: event.target.value,
                      }))
                    }
                    rows={4}
                    disabled={done}
                    placeholder="Write the reply that will appear publicly under the business name…"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                      icon={done ? 'check' : 'send'}
                      loading={sending}
                      disabled={done || !textFor(draft).trim()}
                      onClick={() => publish(draft)}
                    >
                      {done ? 'Published' : sending ? 'Publishing…' : 'Publish reply'}
                    </Button>
                    <span className="text-2xs text-ink-muted">
                      {textFor(draft).trim().length} characters · posts publicly to Google
                    </span>
                  </div>

                  {failed && (
                    <div className="mt-2">
                      <Note tone="critical" icon="alert">
                        {state}
                      </Note>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </section>
      )}

      {tab === 'all' && (
        <section className="space-y-3">
          <SectionHeading title="All reviews" subtitle="Most recently updated first" />
          {report.reviews.map((review) => (
            <ReviewCard key={review.name} review={review} />
          ))}
        </section>
      )}

      {tab === 'templates' && (
        <section className="space-y-3">
          <SectionHeading
            title="Reply templates"
            subtitle="Matched by star rating; a keyword makes a template more specific and it wins"
            action={
              <Button
                size="sm"
                icon={rulesSaved ? 'check' : 'copy'}
                loading={savingRules}
                onClick={saveRules}
              >
                {rulesSaved ? 'Saved' : 'Save templates'}
              </Button>
            }
          />

          <Note tone="neutral" icon="info">
            These are starting points, not finished copy. A reply that reads as boilerplate does
            more damage than a slow reply — edit them in the business&rsquo;s own voice.
          </Note>

          {rules.templates.map((template, index) => (
            <Card key={template.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Input
                  value={template.label}
                  aria-label="Template label"
                  onChange={(event) =>
                    setRules((current) => {
                      const templates = [...current.templates];
                      templates[index] = { ...templates[index], label: event.target.value };
                      return { ...current, templates };
                    })
                  }
                  className="max-w-[320px]"
                />
                <span className="text-2xs text-ink-muted">
                  {template.minRating === template.maxRating
                    ? `${template.minRating} star`
                    : `${template.minRating}–${template.maxRating} stars`}
                </span>
              </div>

              <Textarea
                value={template.body}
                rows={4}
                onChange={(event) =>
                  setRules((current) => {
                    const templates = [...current.templates];
                    templates[index] = { ...templates[index], body: event.target.value };
                    return { ...current, templates };
                  })
                }
              />

              <label className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-ink-secondary">
                Only when the review mentions
                <Input
                  value={template.keyword ?? ''}
                  placeholder="optional keyword"
                  onChange={(event) =>
                    setRules((current) => {
                      const templates = [...current.templates];
                      templates[index] = {
                        ...templates[index],
                        keyword: event.target.value || undefined,
                      };
                      return { ...current, templates };
                    })
                  }
                  className="max-w-[200px]"
                />
              </label>
            </Card>
          ))}

          <Card>
            <label className="flex items-start gap-2.5 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={rules.includePositive}
                onChange={(event) =>
                  setRules((current) => ({ ...current, includePositive: event.target.checked }))
                }
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-ink">Queue 4–5 star reviews too.</span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-ink-muted">
                  Off means only 1–3 star reviews reach the queue. Answering positive reviews lifts
                  the response rate Google shows, so this is on by default.
                </span>
              </span>
            </label>
          </Card>
        </section>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: GmbReview }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-xs font-medium text-ink">{review.reviewer}</span>
            {review.createdAt && (
              <span className="text-2xs text-ink-muted">{relativeTime(review.createdAt)}</span>
            )}
          </div>
          {review.comment && (
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{review.comment}</p>
          )}
        </div>
        <Badge tone={review.reply ? 'good' : 'warning'} icon={review.reply ? 'check' : 'alert'}>
          {review.reply ? 'Replied' : 'No reply'}
        </Badge>
      </div>

      {review.reply && (
        <div className="mt-3 rounded-lg bg-surface-sunken p-3">
          <p className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.07em] text-ink-muted">
            <Icon name="send" size={11} />
            Business reply
            {review.reply.updatedAt && (
              <span className="font-normal normal-case tracking-normal">
                · {relativeTime(review.reply.updatedAt)}
              </span>
            )}
          </p>
          <p className="text-xs leading-relaxed text-ink-secondary">{review.reply.comment}</p>
        </div>
      )}
    </Card>
  );
}
