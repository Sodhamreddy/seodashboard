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
  Select,
  cx,
  type Tone,
} from '@/components/ui/primitives';
import { ToolAction, ToolField, ToolForm } from './ToolForm';
import { bytes, number } from '@/lib/format';
import type { RobotsAudit, RobotsIssue, RobotsPreset } from '@/lib/seo/robots';

const SEVERITY_TONE: Record<RobotsIssue['severity'], Tone> = {
  critical: 'critical',
  warning: 'warning',
  info: 'neutral',
};

const SEVERITY_ICON: Record<RobotsIssue['severity'], IconName> = {
  critical: 'close',
  warning: 'alert',
  info: 'info',
};

const PRESET_LABEL: Record<RobotsPreset, string> = {
  standard: 'Standard — allow all, declare sitemap',
  'block-ai': 'Block AI crawlers — opt out of training',
  wordpress: 'WordPress — standard plus wp-admin rules',
  staging: 'Staging — block everything',
};

export function RobotsTool({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [preset, setPreset] = useState<RobotsPreset>('standard');
  const [audit, setAudit] = useState<RobotsAudit | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');

    try {
      const response = await fetch('/api/tools/robots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain, preset }),
      });
      const data = (await response.json()) as RobotsAudit & { error?: string };
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

  const blockedAi = audit?.aiCrawlers.filter((crawler) => crawler.blocked).length ?? 0;

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use the robots.txt tool"
        icon="shield"
        steps={[
          <>
            Enter the domain and press <strong className="text-ink">Check robots.txt</strong>. The
            live file at <code className="rounded bg-surface-sunken px-1 font-mono">/robots.txt</code>{' '}
            is fetched and parsed the way Google parses it.
          </>,
          <>
            Read the <strong className="text-ink">findings</strong> first. Anything marked critical
            is actively costing you crawling or indexing.
          </>,
          <>
            Check the <strong className="text-ink">AI crawler</strong> table to see which training
            and answer-engine bots you currently allow.
          </>,
          <>
            Pick a <strong className="text-ink">template</strong>, then upload the generated file to
            your site root so it resolves at{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">/robots.txt</code>.
          </>,
        ]}
      />

      <Card>
        <ToolForm onSubmit={run} hint="robots.txt must live at the site root.">
          <ToolField label="Domain" htmlFor="robots-domain">
            <Input
              id="robots-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com"
              required
            />
          </ToolField>
          <ToolField label="Template to generate" htmlFor="robots-preset" width={250}>
            <Select
              id="robots-preset"
              value={preset}
              onChange={(event) => setPreset(event.target.value as RobotsPreset)}
            >
              {(Object.keys(PRESET_LABEL) as RobotsPreset[]).map((key) => (
                <option key={key} value={key}>
                  {PRESET_LABEL[key]}
                </option>
              ))}
            </Select>
          </ToolField>
          <ToolAction>
            <Button type="submit" loading={pending} icon="play">
              {pending ? 'Fetching…' : 'Check robots.txt'}
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
          icon="shield"
          title="No robots.txt checked yet"
          description="One malformed line here can de-index an entire site. This checks the file the way Google reads it, then writes you a correct one."
        />
      )}

      {audit && (
        <>
          {audit.blocksEverything && (
            <Note tone="critical" icon="alert">
              <span className="font-semibold">This site blocks all crawling.</span>{' '}
              <code className="font-mono">User-agent: *</code> has{' '}
              <code className="font-mono">Disallow: /</code> with no narrower Allow. No search
              engine will crawl {audit.domain} until that is removed.
            </Note>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="File status"
              value={audit.found ? audit.status : 'Missing'}
              footnote={audit.found ? bytes(audit.sizeBytes) : 'No file at the site root'}
              icon="doc"
            />
            <StatTile
              label="Rule groups"
              value={number(audit.groups.length)}
              footnote={`${audit.addressedAgents.length} user-agent(s) addressed`}
              icon="layers"
            />
            <StatTile
              label="Sitemaps declared"
              value={number(audit.sitemaps.length)}
              footnote={audit.sitemaps.length === 0 ? 'Crawlers must guess' : audit.sitemaps[0]}
              icon="sitemap"
            />
            <StatTile
              label="AI crawlers blocked"
              value={`${blockedAi} / ${audit.aiCrawlers.length}`}
              footnote={blockedAi === 0 ? 'All AI training bots allowed' : undefined}
              icon="shield"
            />
          </div>

          {/* ── Findings ───────────────────────────────────────────── */}
          <Card>
            <CardHeader
              icon="alert"
              title="Findings"
              subtitle="Parsed the way Google does — longest matching rule wins, paths are case-sensitive"
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

          {/* ── Parsed groups + AI crawlers ─────────────────────────── */}
          <section className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                icon="layers"
                title="Parsed rules"
                subtitle="Consecutive User-agent lines share one rule block"
              />
              {audit.groups.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-muted">No rule groups found.</p>
              ) : (
                <ul className="space-y-3">
                  {audit.groups.map((group, index) => (
                    <li key={index} className="rounded-lg border border-hairline bg-surface-sunken p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {group.userAgents.map((agent) => (
                          <Badge key={agent} tone="accent" icon={null}>
                            {agent}
                          </Badge>
                        ))}
                        {group.crawlDelay !== null && (
                          <Badge tone="neutral" icon={null}>
                            crawl-delay {group.crawlDelay}
                          </Badge>
                        )}
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {group.rules.length === 0 ? (
                          <li className="text-2xs italic text-ink-muted">
                            No Allow/Disallow rules — nothing restricted.
                          </li>
                        ) : (
                          group.rules.map((rule, ruleIndex) => (
                            <li key={ruleIndex} className="font-mono text-2xs">
                              <span
                                className={
                                  rule.directive === 'disallow'
                                    ? 'text-status-critical'
                                    : 'text-status-good'
                                }
                              >
                                {rule.directive === 'disallow' ? 'Disallow' : 'Allow'}
                              </span>
                              <span className="text-ink-secondary">: {rule.path || '(empty)'}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                icon="shield"
                title="AI &amp; LLM crawlers"
                subtitle="Whether each bot is currently blocked from the whole site"
              />
              <ul className="space-y-1">
                {audit.aiCrawlers.map((crawler) => (
                  <li
                    key={crawler.agent}
                    className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-2xs text-ink">{crawler.agent}</p>
                      <p className="truncate text-2xs text-ink-muted">{crawler.label}</p>
                    </div>
                    <Badge tone={crawler.blocked ? 'critical' : 'good'}>
                      {crawler.blocked ? 'blocked' : 'allowed'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-hairline pt-2.5 text-2xs leading-relaxed text-ink-muted">
                Blocking these is a business decision, not an SEO fix — it removes you from AI
                answers as well as AI training. Note that{' '}
                <code className="font-mono">Google-Extended</code> only opts you out of Gemini
                training; it does <strong>not</strong> affect Google Search crawling.
              </p>
            </Card>
          </section>

          {/* ── Current vs generated ────────────────────────────────── */}
          <section className="space-y-3">
            <SectionHeading
              title="Current file and replacement"
              subtitle={`Template: ${PRESET_LABEL[preset]}`}
            />

            <PasteTarget
              where={
                <>
                  Upload as <code className="font-mono">robots.txt</code> at your site root — it must
                  resolve at <code className="font-mono">{audit.origin}/robots.txt</code>
                </>
              }
              detail="One file per host and protocol. A robots.txt in a subfolder is ignored entirely."
            />

            <div className="grid items-start gap-4 xl:grid-cols-2">
              {audit.found && audit.raw.trim() ? (
                <CodeBlock code={audit.raw} label="Current robots.txt" maxHeight={360} />
              ) : (
                <EmptyState
                  icon="doc"
                  title="No current file"
                  description={`Nothing is served at ${audit.url}.`}
                />
              )}
              <CodeBlock
                code={audit.generated}
                label="Generated robots.txt"
                downloadName="robots.txt"
                maxHeight={360}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
