'use client';

import { useMemo, useState } from 'react';
import { DataTable, type Column } from '@/components/ui/data';
import { Badge, Card, CardHeader, cx, type Tone } from '@/components/ui/primitives';
import { shortDate } from '@/lib/format';
import type { Backlink, BacklinkStatus } from '@/lib/providers/backlinks';

const STATUS_TONE: Record<BacklinkStatus, Tone> = {
  new: 'good',
  live: 'neutral',
  lost: 'critical',
};

const FILTERS: { key: 'all' | BacklinkStatus | 'toxic'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'lost', label: 'Lost' },
  { key: 'live', label: 'Live' },
  { key: 'toxic', label: 'Toxic candidates' },
];

const columns: Column<Backlink>[] = [
  {
    key: 'source',
    header: 'Source',
    render: (row) => (
      <div className="min-w-0">
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noreferrer nofollow"
          className="block max-w-[320px] truncate font-medium text-accent hover:underline"
          title={row.sourceUrl}
        >
          {row.sourceDomain}
        </a>
        <span className="block max-w-[320px] truncate text-2xs text-ink-muted">{row.sourceUrl}</span>
      </div>
    ),
    sortValue: (row) => row.sourceDomain,
  },
  {
    key: 'anchor',
    header: 'Anchor text',
    render: (row) => (
      <span className="block max-w-[220px] truncate text-ink-secondary" title={row.anchor}>
        {row.anchor}
      </span>
    ),
    sortValue: (row) => row.anchor,
  },
  {
    key: 'target',
    header: 'Target',
    render: (row) => <span className="text-ink-secondary">{row.targetPath}</span>,
    sortValue: (row) => row.targetPath,
  },
  {
    key: 'da',
    header: 'DA',
    align: 'right',
    render: (row) => row.domainAuthority,
    sortValue: (row) => row.domainAuthority,
  },
  {
    key: 'pa',
    header: 'PA',
    align: 'right',
    render: (row) => row.pageAuthority,
    sortValue: (row) => row.pageAuthority,
  },
  {
    key: 'spam',
    header: 'Spam',
    align: 'right',
    render: (row) => (
      <span className={cx(row.spamScore >= 30 && 'font-medium text-status-critical')}>
        {row.spamScore}%
      </span>
    ),
    sortValue: (row) => row.spamScore,
  },
  {
    key: 'rel',
    header: 'Rel',
    render: (row) => (
      <Badge tone={row.rel === 'dofollow' ? 'accent' : 'neutral'} icon={null}>
        {row.rel}
      </Badge>
    ),
    sortValue: (row) => row.rel,
  },
  {
    key: 'firstSeen',
    header: 'First seen',
    align: 'right',
    render: (row) => shortDate(row.firstSeen),
    sortValue: (row) => row.firstSeen,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    sortValue: (row) => row.status,
  },
];

export function BacklinkTable({ backlinks }: { backlinks: Backlink[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const counts = useMemo(
    () => ({
      all: backlinks.length,
      new: backlinks.filter((link) => link.status === 'new').length,
      lost: backlinks.filter((link) => link.status === 'lost').length,
      live: backlinks.filter((link) => link.status === 'live').length,
      toxic: backlinks.filter((link) => link.spamScore >= 30).length,
    }),
    [backlinks],
  );

  const rows = useMemo(() => {
    if (filter === 'all') return backlinks;
    if (filter === 'toxic') return backlinks.filter((link) => link.spamScore >= 30);
    return backlinks.filter((link) => link.status === filter);
  }, [backlinks, filter]);

  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <CardHeader
          icon="link"
          title="Backlink detail"
          subtitle="Sortable by any column. Toxic candidates are spam score 30% or higher — review before disavowing."
          action={
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  className={cx(
                    'rounded-md px-2 py-1 text-2xs font-medium transition-colors',
                    filter === option.key
                      ? 'bg-accent-soft text-accent'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {option.label}
                  <span className="ml-1 tnum opacity-70">{counts[option.key]}</span>
                </button>
              ))}
            </div>
          }
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSort="da"
        maxHeight={520}
        emptyMessage="No backlinks match this filter."
        caption="Backlinks with source, anchor text, domain and page authority, spam score and status"
      />
    </Card>
  );
}
