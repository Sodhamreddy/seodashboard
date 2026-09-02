'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
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
  cx,
  type Tone,
} from '@/components/ui/primitives';
import { ToolAction, ToolField, ToolForm } from './ToolForm';
import { number, truncate } from '@/lib/format';
import type { BrokenLinkReport, LinkResult, LinkStatus } from '@/lib/seo/broken-links';

const STATUS_META: Record<
  LinkStatus,
  { label: string; tone: Tone; icon: IconName; blurb: string }
> = {
  broken: {
    label: 'Broken',
    tone: 'critical',
    icon: 'close',
    blurb: 'Returned a 4xx. These are dead links — fix or remove them.',
  },
  'server-error': {
    label: 'Server error',
    tone: 'serious',
    icon: 'alert',
    blurb: 'Returned a 5xx. The target is erroring; it may be temporary.',
  },
  unreachable: {
    label: 'Unreachable',
    tone: 'serious',
    icon: 'alert',
    blurb: 'DNS, TLS or connection failure — the host did not answer at all.',
  },
  timeout: {
    label: 'Timed out',
    tone: 'warning',
    icon: 'clock',
    blurb: 'No response in time. Inconclusive rather than broken — worth a retry.',
  },
  redirect: {
    label: 'Redirects',
    tone: 'warning',
    icon: 'arrowUp',
    blurb: 'Resolves, but via a redirect. Point the link at the final URL.',
  },
  blocked: {
    label: 'Bot-blocked',
    tone: 'neutral',
    icon: 'shield',
    blurb: '401/403 — the page exists but refuses crawlers. Not a broken link.',
  },
  'not-checked': {
    label: 'Not checked',
    tone: 'neutral',
    icon: 'info',
    blurb: 'mailto:, tel:, javascript: or a same-page anchor — nothing to request.',
  },
  ok: { label: 'Working', tone: 'good', icon: 'check', blurb: 'Returned 2xx directly.' },
};

/** The buckets shown as filter chips, in reporting order. */
const FILTERS: LinkStatus[] = [
  'broken',
  'server-error',
  'unreachable',
  'timeout',
  'redirect',
  'blocked',
  'not-checked',
  'ok',
];

export function BrokenLinkTool({ defaultDomain }: { defaultDomain: string }) {
  const [url, setUrl] = useState(defaultDomain);
  const [report, setReport] = useState<BrokenLinkReport | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<LinkStatus | 'all'>('all');

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setFilter('all');

    try {
      const response = await fetch('/api/tools/broken-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as BrokenLinkReport & { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Link check failed.');
        setReport(null);
      } else {
        setReport(data);
        // Land on the actionable bucket when there is one — the whole point of
        // running this is the failures, not the 180 working links.
        if (data.summary.needsAttention > 0) setFilter('broken');
      }
    } catch {
      setError('Network error — could not reach the analyzer.');
    } finally {
      setPending(false);
    }
  }

  const counts = useMemo(() => {
    if (!report) return {} as Record<LinkStatus, number>;
    return FILTERS.reduce(
      (acc, status) => {
        acc[status] = report.links.filter((link) => link.status === status).length;
        return acc;
      },
      {} as Record<LinkStatus, number>,
    );
  }, [report]);

  const visible = useMemo(() => {
    if (!report) return [];
    if (filter === 'all') return report.links;
    return report.links.filter((link) => link.status === filter);
  }, [report, filter]);

  function exportCsv() {
    if (!report) return;
    const rows = [
      ['Status', 'HTTP', 'URL', 'Anchor text', 'Scope', 'Occurrences', 'Final URL', 'Detail'],
      ...report.links.map((link) => [
        STATUS_META[link.status].label,
        link.code === null ? '' : String(link.code),
        link.url,
        link.text,
        link.internal ? 'Internal' : 'External',
        String(link.occurrences),
        link.finalUrl ?? '',
        link.detail ?? '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `broken-links-${new URL(report.finalUrl).hostname}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use the broken link checker"
        icon="link"
        steps={[
          <>
            Enter any page URL and press <strong className="text-ink">Check links</strong>. Every{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">&lt;a href&gt;</code> on that
            page is resolved and probed.
          </>,
          <>
            <strong className="text-ink">Broken</strong> means a 4xx — those are the ones to fix.{' '}
            <strong className="text-ink">Bot-blocked</strong> (401/403) and{' '}
            <strong className="text-ink">timed out</strong> are not broken; they are reported
            separately so you do not chase them.
          </>,
          <>
            This checks <strong className="text-ink">one page</strong>, not the whole site. Run it
            against the pages that matter — home, services, top landing pages — or paste any URL
            from the sitemap tool.
          </>,
        ]}
      />

      <Card>
        <CardHeader
          icon="link"
          title="Check a page for dead links"
          subtitle="Resolves and probes every anchor on the page, live"
        />
        <ToolForm
          onSubmit={run}
          hint="HEAD is tried first and confirmed with GET, so a server that rejects HEAD is not reported as broken. Repeated links are probed once."
        >
          <ToolField label="Page URL" htmlFor="bl-url">
            <Input
              id="bl-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="example.com/services"
              autoComplete="off"
            />
          </ToolField>
          <ToolAction>
            <Button type="submit" icon="search" loading={pending}>
              {pending ? 'Checking…' : 'Check links'}
            </Button>
          </ToolAction>
        </ToolForm>

        {error && (
          <div className="mt-3">
            <Note tone="critical" icon="alert">
              {error}
            </Note>
          </div>
        )}
      </Card>

      {pending && !report && (
        <EmptyState
          icon="refresh"
          title="Probing links"
          description="Each unique target gets one request, eight at a time. A link-heavy page can take up to a minute."
        />
      )}

      {report && (
        <>
          {report.summary.needsAttention === 0 ? (
            <Note tone="good" icon="check">
              <span className="font-semibold">No dead links found.</span> All{' '}
              {number(report.summary.checked)} probed links resolved.
              {report.summary.redirects > 0 && (
                <> {report.summary.redirects} go via a redirect worth tidying.</>
              )}
            </Note>
          ) : (
            <Note tone={report.summary.broken > 0 ? 'critical' : 'warning'} icon="alert">
              <span className="font-semibold">
                {number(report.summary.needsAttention)} link
                {report.summary.needsAttention === 1 ? '' : 's'} need attention
              </span>{' '}
              on {truncate(report.finalUrl, 60)} — {report.summary.broken} broken,{' '}
              {report.summary.serverErrors} server errors, {report.summary.unreachable} unreachable.
            </Note>
          )}

          {report.truncated && (
            <Note tone="warning" icon="info">
              This page has {number(report.totalFound)} links; the first{' '}
              {number(report.summary.total)} were checked. Nothing was silently dropped — re-run
              against a narrower page for full coverage.
            </Note>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Links found"
              value={number(report.summary.total)}
              footnote={`${report.summary.internal} internal · ${report.summary.external} external`}
              icon="link"
            />
            <StatTile
              label="Broken (4xx)"
              value={number(report.summary.broken)}
              footnote={
                report.summary.broken > 0 ? 'Fix or remove these' : 'Nothing returning a 4xx'
              }
              icon="close"
              tone={report.summary.broken > 0 ? 'critical' : 'good'}
            />
            <StatTile
              label="Redirects"
              value={number(report.summary.redirects)}
              footnote="Resolve, but not directly"
              icon="arrowUp"
              tone={report.summary.redirects > 0 ? 'warning' : 'neutral'}
            />
            <StatTile
              label="Working"
              value={number(report.summary.ok)}
              footnote={`${report.summary.blocked} bot-blocked · ${report.summary.timeouts} timed out`}
              icon="check"
              tone="good"
            />
          </div>

          <section>
            <SectionHeading
              title="Every link on the page"
              subtitle="Worst status first — filter by bucket below"
              action={
                <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
                  Export CSV
                </Button>
              }
            />

            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-2xs font-medium transition-colors',
                  filter === 'all'
                    ? 'border-transparent bg-accent-soft text-accent'
                    : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
                )}
              >
                All {report.summary.total}
              </button>
              {FILTERS.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  title={STATUS_META[status].blurb}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-2xs font-medium transition-colors',
                    filter === status
                      ? 'border-transparent bg-accent-soft text-accent'
                      : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
                  )}
                >
                  <Icon name={STATUS_META[status].icon} size={11} />
                  {STATUS_META[status].label} {counts[status]}
                </button>
              ))}
            </div>

            {filter !== 'all' && (
              <p className="mb-2 text-2xs leading-relaxed text-ink-muted">
                {STATUS_META[filter].blurb}
              </p>
            )}

            {visible.length === 0 ? (
              <EmptyState icon="check" title="Nothing in this bucket" />
            ) : (
              <Card padded={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-surface-sunken">
                      <tr>
                        {['Status', 'URL', 'Anchor text', 'Scope'].map((header, index) => (
                          <th
                            key={header}
                            scope="col"
                            className={cx(
                              'whitespace-nowrap border-b border-hairline px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                              index === 3 && 'text-right',
                            )}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((link) => (
                        <LinkRow key={`${link.status}-${link.url}`} link={link} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function LinkRow({ link }: { link: LinkResult }) {
  const meta = STATUS_META[link.status];

  return (
    <tr className="border-b border-hairline last:border-0">
      <td className="whitespace-nowrap px-3 py-2 align-top">
        <Badge tone={meta.tone} icon={meta.icon}>
          {link.code ?? meta.label}
        </Badge>
      </td>
      <td className="max-w-[420px] px-3 py-2 align-top">
        {link.status === 'not-checked' ? (
          <span className="break-all font-mono text-2xs text-ink-secondary">{link.url}</span>
        ) : (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="break-all font-mono text-2xs text-ink hover:text-accent hover:underline"
          >
            {link.url}
          </a>
        )}
        {link.finalUrl && (
          <span className="mt-0.5 block break-all text-2xs text-ink-muted">
            → {link.finalUrl}
          </span>
        )}
        {link.detail && (
          <span className="mt-0.5 block text-2xs text-ink-muted">{link.detail}</span>
        )}
      </td>
      <td className="max-w-[220px] px-3 py-2 align-top text-2xs text-ink-secondary">
        {truncate(link.text, 70)}
        {link.occurrences > 1 && (
          <span className="ml-1 text-ink-muted">×{link.occurrences}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right align-top text-2xs text-ink-muted">
        {link.internal ? 'Internal' : 'External'}
        {link.rel && <span className="ml-1 font-mono">{link.rel}</span>}
      </td>
    </tr>
  );
}
