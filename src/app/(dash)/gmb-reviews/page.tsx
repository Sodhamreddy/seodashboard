import type { Metadata } from 'next';
import Link from 'next/link';
import { GmbReviewsTool } from '@/components/tools/GmbReviewsTool';
import { Button, Card, CardHeader, EmptyState, Note } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { getGmbReviews, gmbFailureReason, isGmbFailure } from '@/lib/providers/gmb';
import { buildDrafts, loadGmbRules } from '@/lib/providers/gmb-automation';
import { getConnection, gmbScopeEnabled, hasBusinessScope } from '@/lib/providers/googleAuth';

export const metadata: Metadata = { title: 'GMB Reviews Automation' };
export const dynamic = 'force-dynamic';

/**
 * Google Business Profile reviews.
 *
 * The gated state here is longer than most because the gate is genuinely
 * unusual: Business Profile access is the one integration in this app that a
 * developer cannot switch on alone. It needs an approved application to Google,
 * so the page explains the whole sequence rather than saying "not connected".
 */
export default async function GmbReviewsPage() {
  const domain = getActiveDomain();
  const google = await getConnection();
  const scopeEnabled = gmbScopeEnabled();
  const scopeGranted = google.connected && hasBusinessScope(google.scopes);

  // Only call the API once a token could plausibly carry the scope — otherwise
  // every page load spends a guaranteed 403.
  const report = scopeGranted ? await getGmbReviews(domain) : null;

  if (report && !isGmbFailure(report)) {
    const rules = await loadGmbRules(domain, report.location.title);
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold leading-tight text-ink">GMB Reviews Automation</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Google Business Profile reviews for{' '}
            <span className="font-medium text-ink">{report.location.title}</span> — drafted replies,
            published on your word.
          </p>
        </header>
        <GmbReviewsTool
          report={report}
          rules={rules}
          drafts={buildDrafts(report.reviews, rules)}
        />
      </div>
    );
  }

  /* ── Gated: explain the actual sequence ─────────────────────────────── */

  const steps: { done: boolean; title: string; detail: React.ReactNode }[] = [
    {
      done: google.connected,
      title: 'Connect a Google account',
      detail: google.connected ? (
        <>Connected as {google.email || 'a Google account'}.</>
      ) : (
        <>
          Do this in <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
        </>
      ),
    },
    {
      done: false,
      title: 'Apply to Google for Business Profile API access',
      detail: (
        <>
          This is the real gate, and the only one you cannot clear from here. Enabling the API in
          Google Cloud is <em>not</em> sufficient — Google requires an approved application per
          project, submitted through the Business Profile APIs request form. Approval typically
          takes days to weeks. Until it lands, every call returns 403.
        </>
      ),
    },
    {
      done: scopeEnabled,
      title: 'Set ENABLE_GMB_SCOPE=true',
      detail: (
        <>
          Adds the <code className="font-mono">business.manage</code> scope to the consent screen.
          It is off by default on purpose: that scope is a Google{' '}
          <em>restricted</em> scope, and requesting it from an unapproved project can make the
          consent screen warn or fail — which would take Search Console, Ads and GA4 down with it.
        </>
      ),
    },
    {
      done: scopeGranted,
      title: 'Reconnect Google to grant the scope',
      detail: (
        <>
          A refresh token never gains a scope retroactively, so this needs a fresh consent after
          the flag is on.
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold leading-tight text-ink">GMB Reviews Automation</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Review monitoring and drafted replies for {domain}, via Google Business Profile.
        </p>
      </header>

      {report && isGmbFailure(report) ? (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Business Profile API returned an error.</span>{' '}
          {gmbFailureReason(report)}
        </Note>
      ) : (
        <Note tone="neutral" icon="info">
          <span className="font-semibold">Not connected yet.</span> The code is in place — the
          remaining steps are Google-side approvals, listed below.
        </Note>
      )}

      <Card>
        <CardHeader
          icon="shield"
          title="What this needs before it can run"
          subtitle="Four steps, in order — the second is the long one"
        />
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className={
                  step.done
                    ? 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-tint-good text-2xs font-bold text-status-good'
                    : 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-sunken text-2xs font-bold text-ink-muted'
                }
              >
                {step.done ? '✓' : index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {step.title}
                  {step.done && <span className="ml-2 text-2xs text-status-good">done</span>}
                </p>
                <p className="mt-0.5 text-2xs leading-relaxed text-ink-secondary">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-3">
          <Link href="/settings">
            <Button size="sm" variant="secondary" icon="settings">
              Open Settings
            </Button>
          </Link>
        </div>
      </Card>

      <EmptyState
        icon="sparkles"
        title="What you get once access is granted"
        description="A reply queue sorted lowest-rating-first, star distribution and response rate, editable per-rating reply templates with {{reviewer}} and {{business}} placeholders, and one-press publishing. Replies are never posted automatically — drafting is automated, publishing stays a human action."
      />
    </div>
  );
}
