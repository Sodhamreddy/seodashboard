'use client';

import { useMemo, useState } from 'react';
import { DataTable, type Column } from '@/components/ui/data';
import { Badge, Card, CardHeader, cx } from '@/components/ui/primitives';
import { number } from '@/lib/format';
import type { ReferringDomain } from '@/lib/providers/backlinks';

/**
 * The live (Crawly) view of a backlink profile.
 *
 * Columns are exactly what the index measures. There is deliberately no anchor
 * text, rel or first-seen column — that data does not exist in this source, and
 * an empty column implies it was checked and found missing.
 */

type FilterKey = 'all' | 'new' | 'lost' | 'high' | 'medium' | 'low' | 'flagged';

/*
 * New and lost lead, because they are the two the operator acts on: one is an
 * outreach win to record, the other a link to chase. They only appear once a
 * second snapshot exists to compare against.
 */
const MOVEMENT_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'lost', label: 'Lost' },
];

const QUALITY_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'flagged', label: 'Flagged' },
];

/** Rating is a qualitative band, so it gets the sequential ramp by strength. */
const RATING_TONE: Record<string, string> = {
  High: 'var(--seq-700)',
  Medium: 'var(--seq-400)',
  Low: 'var(--seq-250)',
};

const STATUS_TONE = {
  new: 'good',
  live: 'neutral',
  lost: 'critical',
} as const;

const COLUMNS: Column<ReferringDomain>[] = [
  {
    key: 'sourceDomain',
    header: 'Referring domain',
    render: (row) => (
      <a
        href={`https://${row.sourceDomain}`}
        target="_blank"
        rel="noreferrer noopener"
        className="max-w-[320px] truncate font-medium text-accent hover:underline"
        title={row.sourceDomain}
      >
        {row.sourceDomain}
      </a>
    ),
    sortValue: (row) => row.sourceDomain,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) =>
      row.status ? (
        <Badge tone={STATUS_TONE[row.status]} icon={row.status === 'lost' ? 'alert' : null}>
          {row.status}
        </Badge>
      ) : (
        <span className="text-2xs text-ink-muted" title="Needs a second snapshot to compare">
          —
        </span>
      ),
    sortValue: (row) => ({ lost: 3, new: 2, live: 1 })[row.status ?? 'live'] ?? 0,
  },
  {
    key: 'links',
    header: 'Links',
    align: 'right',
    render: (row) =>
      row.status === 'lost' ? (
        <span className="text-ink-muted" title={`Last seen ${row.lastSeen?.slice(0, 10) ?? 'earlier'}`}>
          gone
        </span>
      ) : (
        number(row.links)
      ),
    sortValue: (row) => row.links,
  },
  {
    key: 'rating',
    header: 'Rating',
    render: (row) => (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ background: RATING_TONE[row.rating] ?? 'var(--gridline)' }}
        />
        {row.rating || '—'}
      </span>
    ),
    // Order by strength, not alphabetically.
    sortValue: (row) => ({ High: 3, Medium: 2, Low: 1 })[row.rating] ?? 0,
  },
  {
    key: 'harmonicRank',
    header: 'Harmonic rank',
    align: 'right',
    render: (row) =>
      row.harmonicRank > 0 ? (
        number(row.harmonicRank)
      ) : (
        <span className="text-ink-muted" title="Not ranked in the index">
          —
        </span>
      ),
    // Smaller rank is stronger; unranked (0) must sort last, not first.
    sortValue: (row) => (row.harmonicRank > 0 ? row.harmonicRank : Number.MAX_SAFE_INTEGER),
  },
  {
    key: 'flags',
    header: 'Flags',
    align: 'right',
    render: (row) =>
      row.toxic ? (
        <Badge tone="critical">toxic</Badge>
      ) : row.suspicious ? (
        <Badge tone="warning">suspicious</Badge>
      ) : (
        <Badge tone="good">clean</Badge>
      ),
    sortValue: (row) => (row.toxic ? 2 : row.suspicious ? 1 : 0),
  },
];

export function ReferringDomainsTable({ rows }: { rows: ReferringDomain[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      all: rows.length,
      new: rows.filter((row) => row.status === 'new').length,
      lost: rows.filter((row) => row.status === 'lost').length,
      high: rows.filter((row) => row.rating === 'High').length,
      medium: rows.filter((row) => row.rating === 'Medium').length,
      low: rows.filter((row) => row.rating === 'Low').length,
      flagged: rows.filter((row) => row.toxic || row.suspicious).length,
    }),
    [rows],
  );

  // Movement chips are hidden entirely until there is history behind them —
  // a "New 0" chip on day one would report an absence of data as an absence
  // of new links.
  const hasMovement = rows.some((row) => row.status);
  const filters = hasMovement
    ? [{ key: 'all' as FilterKey, label: 'All' }, ...MOVEMENT_FILTERS, ...QUALITY_FILTERS]
    : [{ key: 'all' as FilterKey, label: 'All' }, ...QUALITY_FILTERS];

  const filtered = useMemo(() => {
    const byFilter = rows.filter((row) => {
      if (filter === 'flagged') return row.toxic || row.suspicious;
      if (filter === 'new' || filter === 'lost') return row.status === filter;
      if (filter === 'all') return true;
      return row.rating.toLowerCase() === filter;
    });
    const needle = query.trim().toLowerCase();
    return needle ? byFilter.filter((row) => row.sourceDomain.includes(needle)) : byFilter;
  }, [rows, filter, query]);

  return (
    <Card padded={false}>
      <div className="space-y-3 p-5 pb-3">
        <CardHeader
          icon="link"
          title="Referring domains"
          subtitle="Measured by the Crawly index. Anchor text, rel and first-seen dates are not part of this source."
          action={
            <div className="flex flex-wrap gap-1">
              {filters.map((option) => (
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
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter domains…"
          aria-label="Filter referring domains"
          className="h-9 w-full max-w-xs rounded-lg border border-hairline bg-surface-raised px-3 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </div>
      <DataTable
        columns={COLUMNS}
        rows={filtered}
        rowKey={(row) => row.sourceDomain}
        /*
         * With history, status leads: sorting by link count buried every lost
         * domain on the last page, because a lost domain has none. Without
         * history every row would tie at "live", so link count stays the
         * default there.
         */
        initialSort={hasMovement ? 'status' : 'links'}
        emptyMessage="No referring domains match this filter."
        caption="Referring domains with link count, quality rating, harmonic rank and risk flags"
      />
    </Card>
  );
}
