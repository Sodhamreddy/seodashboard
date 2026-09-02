'use client';

import { useState } from 'react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Instructions, PasteTarget } from '@/components/ui/Instructions';
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
  cx,
  type Tone,
} from '@/components/ui/primitives';
import { ToolAction, ToolField, ToolForm } from './ToolForm';
import { number } from '@/lib/format';
import type { LlmsAudit, LlmsIssue } from '@/lib/seo/llms';

const SEVERITY_TONE: Record<LlmsIssue['severity'], Tone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'neutral',
};

const SEVERITY_ICON: Record<LlmsIssue['severity'], IconName> = {
  critical: 'close',
  warning: 'alert',
  info: 'info',
};

export function LlmsTool({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [audit, setAudit] = useState<LlmsAudit | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/tools/llms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = (await response.json()) as LlmsAudit & { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Audit failed.');
        setAudit(null);
      } else {
        setAudit(data);
      }
    } catch {
      setError('Network error — could not reach the analyzer.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Note tone="neutral" icon="info">
        <span className="font-semibold">What llms.txt is, honestly.</span> It is a community
        proposal (llmstxt.org) for a markdown file at your site root that gives AI tools a curated
        map of your content. Unlike robots.txt, <strong>the major AI crawlers have not committed to
        reading it</strong>, so treat it as cheap forward-positioning rather than a ranking factor.
        It costs nothing to publish and cannot hurt.
      </Note>

      <Instructions
        title="How to use the llms.txt tool"
        icon="doc"
        steps={[
          <>
            Enter the domain and press <strong className="text-ink">Check llms.txt</strong>. Both{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">/llms.txt</code> and{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">/llms-full.txt</code> are
            fetched.
          </>,
          <>
            If a file exists it is <strong className="text-ink">validated</strong> against the
            format: one H1 title, a summary blockquote, then{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">##</code> sections of
            markdown links.
          </>,
          <>
            A replacement is <strong className="text-ink">generated from your sitemap</strong>,
            grouped by site section, with the most substantial sections first — consumers with a
            small context budget read from the top.
          </>,
          <>
            <strong className="text-ink">Edit the generated file before publishing.</strong> Titles
            are derived from URL slugs, so they read like slugs; a human pass makes it far more
            useful.
          </>,
        ]}
      />

      <Card>
        <ToolForm
          onSubmit={run}
          hint="The home page and sitemap are read to build the suggested file."
        >
          <ToolField label="Domain" htmlFor="llms-domain">
            <Input
              id="llms-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com"
              required
            />
          </ToolField>
          <ToolAction>
            <Button type="submit" loading={pending} icon="play">
              {pending ? 'Reading site…' : 'Check llms.txt'}
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

      {!audit && !pending && !error && (
        <EmptyState
          icon="doc"
          title="No llms.txt checked yet"
          description="This validates an existing file and drafts one from your sitemap if you have none."
        />
      )}

      {audit && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="llms.txt"
              value={audit.found ? 'Published' : 'Missing'}
              footnote={audit.found ? `HTTP ${audit.status}` : audit.url}
              icon="doc"
            />
            <StatTile
              label="llms-full.txt"
              value={audit.fullFound ? 'Published' : 'Missing'}
              footnote="Optional expanded-content companion"
              icon="layers"
            />
            <StatTile
              label="Links listed"
              value={number(audit.parsed.linkCount)}
              footnote={`across ${audit.parsed.sections.length} section(s)`}
              icon="link"
            />
            <StatTile
              label="URLs available"
              value={number(audit.generatedFrom.urlsConsidered)}
              footnote={
                audit.generatedFrom.source === 'sitemap'
                  ? 'from your sitemap'
                  : 'home page only — no sitemap read'
              }
              icon="sitemap"
            />
          </div>

          {audit.generatedFrom.note && (
            <Note tone="warning" icon="alert">
              {audit.generatedFrom.note}
            </Note>
          )}

          <Card>
            <CardHeader
              icon="alert"
              title="Validation"
              subtitle="Checked against the llmstxt.org format"
            />
            <ul className="space-y-2.5">
              {audit.issues.map((issue, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span
                    className={cx(
                      'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md',
                      issue.severity === 'critical' && 'bg-tint-critical text-status-critical',
                      issue.severity === 'warning' && 'bg-tint-warning text-ink',
                      issue.severity === 'info' && 'bg-surface-sunken text-ink-muted',
                    )}
                  >
                    <Icon name={SEVERITY_ICON[issue.severity]} size={12} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium text-ink">{issue.title}</p>
                      <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
                    </div>
                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-secondary">
                      {issue.detail}
                    </p>
                    {issue.fix && (
                      <p className="mt-1 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
                        <Icon name="chevronRight" size={11} className="mt-0.5 shrink-0" />
                        {issue.fix}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {audit.found && audit.parsed.sections.length > 0 && (
            <Card>
              <CardHeader
                icon="layers"
                title="What the current file says"
                subtitle={audit.parsed.title || 'No title parsed'}
              />
              {audit.parsed.summary && (
                <p className="mb-3 border-l-2 border-[color:var(--accent)] pl-3 text-xs italic leading-relaxed text-ink-secondary">
                  {audit.parsed.summary}
                </p>
              )}
              <ul className="space-y-3">
                {audit.parsed.sections.map((section, index) => (
                  <li key={index}>
                    <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                      {section.heading}
                      <span className="ml-1.5 font-normal text-ink-muted">
                        {section.links.length} link(s)
                      </span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {section.links.slice(0, 8).map((link, linkIndex) => (
                        <li key={linkIndex} className="truncate text-2xs text-ink-muted">
                          {link.title} — {link.url}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <section className="space-y-3">
            <SectionHeading
              title="Generated llms.txt"
              subtitle={
                audit.generatedFrom.source === 'sitemap'
                  ? `Built from ${audit.generatedFrom.urlsConsidered} sitemap URLs, grouped by section`
                  : 'Built from the home page only'
              }
            />

            <PasteTarget
              where={
                <>
                  Save as <code className="font-mono">llms.txt</code> at your site root —{' '}
                  <code className="font-mono">{audit.origin}/llms.txt</code>
                </>
              }
              detail="Serve it as text/plain or text/markdown. Review the titles first: they are generated from URL slugs, not written by hand."
            />

            <div className="grid items-start gap-4 xl:grid-cols-2">
              {audit.found && audit.raw.trim() ? (
                <CodeBlock code={audit.raw} label="Current llms.txt" maxHeight={420} />
              ) : (
                <EmptyState
                  icon="doc"
                  title="No current file"
                  description={`Nothing is served at ${audit.url}.`}
                />
              )}
              <CodeBlock
                code={audit.generated}
                label="Generated llms.txt"
                downloadName="llms.txt"
                maxHeight={420}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
