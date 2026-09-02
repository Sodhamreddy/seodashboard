'use client';

import { useState } from 'react';
import { BarList, ChartFrame, SimpleTable } from '@/components/charts/ChartShell';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Instructions } from '@/components/ui/Instructions';
import { Icon } from '@/components/ui/Icon';
import { DataTable, StatTile, type Column } from '@/components/ui/data';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Note,
  SectionHeading,
  cx,
} from '@/components/ui/primitives';
import { number, relativeTime, shortDate } from '@/lib/format';
import type { SubmissionResult, SubmittedSitemap } from '@/lib/providers/gsc';
import type { SitemapAudit, SitemapEntry } from '@/lib/seo/sitemap';

const entryColumns: Column<SitemapEntry>[] = [
  {
    key: 'loc',
    header: 'URL',
    render: (row) => (
      <a
        href={row.loc}
        target="_blank"
        rel="noreferrer"
        className="block max-w-[520px] truncate text-accent hover:underline"
      >
        {row.loc}
      </a>
    ),
    sortValue: (row) => row.loc,
  },
  {
    key: 'lastmod',
    header: 'Last modified',
    align: 'right',
    render: (row) => (row.lastmod ? shortDate(row.lastmod) : <span className="text-ink-muted">—</span>),
    sortValue: (row) => row.lastmod ?? '',
  },
  {
    key: 'changefreq',
    header: 'Change freq',
    align: 'right',
    render: (row) => row.changefreq ?? <span className="text-ink-muted">—</span>,
    sortValue: (row) => row.changefreq ?? '',
  },
  {
    key: 'priority',
    header: 'Priority',
    align: 'right',
    render: (row) => row.priority ?? <span className="text-ink-muted">—</span>,
    sortValue: (row) => Number(row.priority ?? 0),
  },
];

export function SitemapTool({ defaultDomain }: { defaultDomain: string }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [audit, setAudit] = useState<SitemapAudit | null>(null);
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);
  const [registered, setRegistered] = useState<{
    mode: string;
    sitemaps: SubmittedSitemap[];
    note: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'audit' | 'snapshot' | 'submit' | 'gsc-list' | null>(
    null,
  );

  /** Read-only: what Google already has on file for this property. */
  async function loadRegistered() {
    setPending('gsc-list');
    setError('');
    try {
      const response = await fetch('/api/tools/sitemap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain, action: 'gsc-list' }),
      });
      const data = await response.json();
      if (!response.ok) setError((data as { error?: string }).error ?? 'Request failed.');
      else setRegistered(data);
    } catch {
      setError('Network error - could not reach Search Console.');
    } finally {
      setPending(null);
    }
  }

  async function call(action: 'audit' | 'snapshot' | 'submit') {
    setPending(action);
    setError('');
    if (action !== 'submit') setSubmission(null);

    try {
      const response = await fetch('/api/tools/sitemap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain,
          action,
          sitemapUrl:
            action === 'submit'
              ? (audit?.sitemaps[0]?.url ?? sitemapUrl)
              : sitemapUrl || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError((data as { error?: string }).error ?? 'Request failed.');
        return;
      }

      if (action === 'submit') setSubmission(data as SubmissionResult);
      else setAudit(data as SitemapAudit);
    } catch {
      setError('Network error — could not reach the sitemap service.');
    } finally {
      setPending(null);
    }
  }

  const broken = audit?.spotChecks.filter((check) => !check.ok) ?? [];

  return (
    <div className="space-y-6">
      <Instructions
        title="How to use XML Sitemap Automation"
        icon="sitemap"
        steps={[
          <>
            Enter the domain and press <strong className="text-ink">Crawl &amp; diff</strong>.
            robots.txt is read first, then the sitemap (and any sitemap index) is walked.
          </>,
          <>
            Press <strong className="text-ink">Save as baseline</strong> once. Every later crawl
            compares against it and reports new, removed and re-dated URLs — that snapshot is what
            turns this from a viewer into change detection.
          </>,
          <>
            Check <strong className="text-ink">Live spot checks</strong> for entries returning 404 —
            dead URLs in a sitemap waste crawl budget.
          </>,
          <>
            <strong className="text-ink">Submit to Search Console</strong> pushes the sitemap to
            Google. Without credentials it runs in simulation mode and says so.
          </>,
        ]}
      />

      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void call('audit');
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Domain"
              htmlFor="sitemap-domain"
              hint="robots.txt is read first, then /sitemap.xml and /sitemap_index.xml as fallbacks."
            >
              <Input
                id="sitemap-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                required
              />
            </Field>
            <Field
              label="Sitemap URL (optional)"
              htmlFor="sitemap-url"
              hint="Override discovery when the sitemap lives somewhere non-standard."
            >
              <Input
                id="sitemap-url"
                value={sitemapUrl}
                onChange={(event) => setSitemapUrl(event.target.value)}
                placeholder="https://example.com/sitemap-pages.xml"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={pending === 'audit'} icon="refresh">
              {pending === 'audit' ? 'Crawling sitemap…' : 'Crawl & diff'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              loading={pending === 'snapshot'}
              onClick={() => void call('snapshot')}
            >
              Save as baseline
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="search"
              loading={pending === 'gsc-list'}
              onClick={() => void loadRegistered()}
            >
              What Google has
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="send"
              disabled={!audit || audit.sitemaps.length === 0}
              loading={pending === 'submit'}
              onClick={() => void call('submit')}
            >
              Submit to Search Console
            </Button>
          </div>
        </form>

        {error && (
          <div className="mt-4">
            <Note tone="critical" icon="alert">
              {error}
            </Note>
          </div>
        )}

        {submission && (
          <div className="mt-4">
            <Note tone={submission.ok ? (submission.mode === 'live' ? 'good' : 'warning') : 'critical'} icon="send">
              <span className="font-semibold">
                {submission.mode === 'live' ? 'Live submission' : 'Simulated submission'}
              </span>{' '}
              — {submission.message}
              <span className="mt-1 block text-2xs text-ink-muted">
                Property {submission.siteUrl} · {submission.sitemapUrl}
              </span>
            </Note>
          </div>
        )}
      </Card>

      {!audit && !pending && !error && (
        <EmptyState
          icon="sitemap"
          title="No sitemap crawled yet"
          description="Crawl the sitemap to see its entries, spot-check for 404s, and diff it against the last saved baseline. Save a baseline once so future runs can report what changed."
        />
      )}

      {audit && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="URLs in sitemap" value={number(audit.stats.total)} icon="sitemap" />
            <StatTile
              label="Updated last 7 days"
              value={number(audit.stats.updatedLast7Days)}
              footnote={`${audit.stats.withLastmod} entries declare lastmod`}
              icon="clock"
            />
            <StatTile
              label="Stale over 180 days"
              value={number(audit.stats.staleOver180Days)}
              icon="alert"
            />
            <StatTile
              label="Deepest path"
              value={audit.stats.maxDepth}
              unit="levels"
              icon="layers"
            />
          </div>

          {audit.errors.length > 0 && (
            <Note tone="warning" icon="alert">
              <ul className="space-y-1">
                {audit.errors.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </Note>
          )}

          {registered && (
            <Card padded={false}>
              <div className="p-5 pb-3">
                <CardHeader
                  icon="shield"
                  title="Registered in Search Console"
                  subtitle={
                    registered.mode === 'live'
                      ? 'Every sitemap Google has on file for this property, worst first'
                      : registered.note
                  }
                  action={
                    <Badge
                      tone={
                        registered.sitemaps.some((entry) => entry.errors > 0) ? 'critical' : 'good'
                      }
                    >
                      {registered.sitemaps.length} on file
                    </Badge>
                  }
                />
              </div>

              {registered.sitemaps.length === 0 ? (
                <p className="px-5 pb-5 text-xs text-ink-muted">
                  {registered.mode === 'live'
                    ? 'Google has no sitemaps registered for this property yet.'
                    : registered.note}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-surface-sunken">
                      <tr>
                        {['Sitemap', 'URLs', 'Errors', 'Warnings', 'Downloaded'].map(
                          (header, index) => (
                            <th
                              key={header}
                              className={cx(
                                'whitespace-nowrap border-b border-hairline px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                                index > 0 && 'text-right',
                              )}
                            >
                              {header}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {[...registered.sitemaps]
                        .sort((a, b) => b.errors - a.errors || b.warnings - a.warnings)
                        .map((entry) => (
                          <tr key={entry.path} className="border-b border-hairline last:border-0">
                            <td className="px-3 py-2">
                              <span
                                className="block max-w-[420px] truncate text-ink"
                                title={entry.path}
                              >
                                {entry.path}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tnum text-ink">
                              {entry.urlCount ?? 'n/a'}
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {entry.errors > 0 ? (
                                <span className="font-medium text-status-critical">
                                  {entry.errors}
                                </span>
                              ) : (
                                <span className="text-ink-muted">0</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tnum">
                              {entry.warnings > 0 ? (
                                <span className="font-medium text-status-warning">
                                  {entry.warnings}
                                </span>
                              ) : (
                                <span className="text-ink-muted">0</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-2xs text-ink-muted">
                              {entry.lastDownloaded ? shortDate(entry.lastDownloaded) : 'never'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="border-t border-hairline px-5 py-3 text-2xs leading-relaxed text-ink-muted">
                Mistyped or duplicate entries waste crawl budget and clutter your reports. Remove them
                in Search Console under Sitemaps - this panel is read-only.
              </p>
            </Card>
          )}

          {/* ── Diff against baseline ──────────────────────────────── */}
          <section>
            <SectionHeading
              title="Change detection"
              subtitle={
                audit.diff.hasBaseline
                  ? `Compared against the baseline saved ${relativeTime(audit.diff.baselineTakenAt as string)}`
                  : 'No baseline stored yet for this domain'
              }
            />

            {!audit.diff.hasBaseline ? (
              <Note tone="neutral" icon="info">
                Save a baseline now. Every later crawl reports new, removed and re-dated URLs against it —
                that snapshot is what turns this from a viewer into change detection.
              </Note>
            ) : (
              <div className="grid gap-4 xl:grid-cols-3">
                {(
                  [
                    { title: 'New URLs', items: audit.diff.added, tone: 'good' as const, icon: 'plus' as const },
                    { title: 'Removed URLs', items: audit.diff.removed, tone: 'critical' as const, icon: 'trash' as const },
                    {
                      title: 'Re-dated URLs',
                      items: audit.diff.updated.map((entry) => entry.loc),
                      tone: 'accent' as const,
                      icon: 'refresh' as const,
                    },
                  ] as const
                ).map((group) => (
                  <Card key={group.title}>
                    <CardHeader
                      icon={group.icon}
                      title={group.title}
                      action={<Badge tone={group.tone}>{group.items.length}</Badge>}
                    />
                    {group.items.length === 0 ? (
                      <p className="py-4 text-center text-xs text-ink-muted">No changes.</p>
                    ) : (
                      <ul className="max-h-56 space-y-1 overflow-y-auto">
                        {group.items.slice(0, 60).map((loc) => (
                          <li key={loc} className="truncate text-2xs text-ink-secondary" title={loc}>
                            {loc.replace(audit.origin, '') || '/'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ── Discovery + spot checks ────────────────────────────── */}
          <section className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                icon="search"
                title="Discovery"
                subtitle="What robots.txt declares and which sitemaps responded"
              />
              <div className="space-y-3">
                <div className="rounded-lg border border-hairline bg-surface-sunken p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-ink">
                    robots.txt
                    {audit.robots.found ? (
                      <Badge tone="good">found</Badge>
                    ) : (
                      <Badge tone="warning">not found</Badge>
                    )}
                    {audit.robots.blocksEverything && <Badge tone="critical">blocks all crawling</Badge>}
                  </p>
                  {audit.robots.declaredSitemaps.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {audit.robots.declaredSitemaps.map((declared) => (
                        <li key={declared} className="break-all text-2xs text-ink-secondary">
                          Sitemap: {declared}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-2xs text-ink-muted">
                      No <code className="font-mono">Sitemap:</code> directive declared.
                    </p>
                  )}
                </div>

                <ul className="space-y-1.5">
                  {audit.sitemaps.map((sitemap) => (
                    <li
                      key={sitemap.url}
                      className="flex items-start justify-between gap-3 rounded-lg border border-hairline p-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block break-all text-2xs text-ink">{sitemap.url}</span>
                        <span className="mt-0.5 block text-2xs text-ink-muted">
                          {sitemap.kind === 'index' ? 'sitemap index' : 'urlset'} ·{' '}
                          {sitemap.entryCount} {sitemap.kind === 'index' ? 'child sitemaps' : 'URLs'}
                        </span>
                      </span>
                      {sitemap.error ? (
                        <Badge tone="critical">{sitemap.error}</Badge>
                      ) : (
                        <Badge tone="good">ok</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <Card>
              <CardHeader
                icon="shield"
                title="Live spot checks"
                subtitle="HEAD requests across an even stride of the entry list"
                action={
                  broken.length > 0 ? (
                    <Badge tone="critical">{broken.length} failing</Badge>
                  ) : (
                    <Badge tone="good">all ok</Badge>
                  )
                }
              />
              {audit.spotChecks.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-muted">No entries to check.</p>
              ) : (
                <ul className="space-y-1">
                  {audit.spotChecks.map((check) => (
                    <li
                      key={check.loc}
                      className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0"
                    >
                      <span className="min-w-0 truncate text-2xs text-ink-secondary" title={check.loc}>
                        {check.loc.replace(audit.origin, '') || '/'}
                      </span>
                      <span
                        className={`shrink-0 text-2xs font-medium tnum ${
                          check.ok ? 'text-status-good' : 'text-status-critical'
                        }`}
                      >
                        {check.ok ? (
                          <>
                            <Icon name="check" size={11} className="mr-1 inline" />
                            {check.status}
                          </>
                        ) : (
                          <>
                            <Icon name="close" size={11} className="mr-1 inline" />
                            {check.status || 'unreachable'}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* ── Shape of the sitemap ───────────────────────────────── */}
          <section className="grid items-start gap-4 xl:grid-cols-2">
            <ChartFrame
              title="URLs by path depth"
              subtitle="Deep pages get crawled less often — a spike far from the root is worth a look"
              table={
                <SimpleTable
                  headers={['Depth', 'URLs']}
                  rows={audit.stats.byDepth.map((row) => [`Level ${row.depth}`, row.count])}
                />
              }
            >
              <BarList
                data={audit.stats.byDepth.map((row) => ({
                  label: `Level ${row.depth}`,
                  value: row.count,
                }))}
                valueFormat="number"
              />
            </ChartFrame>

            <ChartFrame
              title="Freshness by lastmod month"
              subtitle="Last 12 months of declared modification dates"
              table={
                <SimpleTable
                  headers={['Month', 'URLs']}
                  rows={audit.stats.byLastmodMonth.map((row) => [row.month, row.count])}
                />
              }
            >
              {audit.stats.byLastmodMonth.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-muted">
                  No entries declare a lastmod date.
                </p>
              ) : (
                <BarList
                  data={audit.stats.byLastmodMonth.map((row) => ({
                    label: row.month,
                    value: row.count,
                  }))}
                  valueFormat="number"
                />
              )}
            </ChartFrame>
          </section>

          {/* ── Entries + regenerated XML ──────────────────────────── */}
          <section className="space-y-4">
            <Card padded={false}>
              <div className="p-5 pb-3">
                <CardHeader
                  icon="sitemap"
                  title="Sitemap entries"
                  subtitle={`Showing ${audit.entries.length} of ${audit.stats.total} URLs${audit.truncated ? ' (crawl capped at 5,000)' : ''}`}
                />
              </div>
              <DataTable
                columns={entryColumns}
                rows={audit.entries}
                rowKey={(row) => row.loc}
                initialSort="lastmod"
                maxHeight={460}
                caption="Sitemap entries with last modified date, change frequency and priority"
              />
            </Card>

            <div className="space-y-2">
              <SectionHeading
                title="Regenerated sitemap"
                subtitle="Normalised XML built from the crawled entries — upload it or diff it against what your CMS emits"
              />
              <CodeBlock
                code={audit.generatedXml}
                label="sitemap.xml"
                downloadName="sitemap.xml"
                maxHeight={380}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
