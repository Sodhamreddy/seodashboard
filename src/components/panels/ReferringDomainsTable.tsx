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

type FilterKey = 'all' | 'high' | 'medium' | 'low' | 'flagged';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
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
    key: 'links',
    header: 'Links',
    align: 'right',
    render: (row) => number(row.links),
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
      high: rows.filter((row) => row.rating === 'High').length,
      medium: rows.filter((row) => row.rating === 'Medium').length,
      low: rows.filter((row) => row.rating === 'Low').length,
      flagged: rows.filter((row) => row.toxic || row.suspicious).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const byFilter = rows.filter((row) => {
      if (filter === 'flagged') return row.toxic || row.suspicious;
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
        initialSort="links"
        emptyMessage="No referring domains match this filter."
        caption="Referring domains with link count, quality rating, harmonic rank and risk flags"
      />
    </Card>
  );
}
