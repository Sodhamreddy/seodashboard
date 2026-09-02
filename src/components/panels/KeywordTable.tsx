'use client';

import { useMemo, useState } from 'react';
import { DataTable, Delta, Sparkline, type Column } from '@/components/ui/data';
import { Badge, Card, CardHeader, cx } from '@/components/ui/primitives';
import { number } from '@/lib/format';
import type { KeywordRow } from '@/lib/providers/keywords';

type FilterKey = 'all' | 'top10' | 'improved' | 'declined' | 'unranked';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'top10', label: 'Top 10' },
  { key: 'improved', label: 'Improved' },
  { key: 'declined', label: 'Declined' },
  { key: 'unranked', label: 'Not ranking' },
];

/** Difficulty is a magnitude, so it gets the sequential ramp, not a hue per band. */
function difficultyFill(difficulty: number) {
  if (difficulty >= 70) return 'var(--seq-700)';
  if (difficulty >= 50) return 'var(--seq-550)';
  if (difficulty >= 30) return 'var(--seq-400)';
  return 'var(--seq-250)';
}

const BASE_COLUMNS: Column<KeywordRow>[] = [
  {
    key: 'keyword',
    header: 'Keyword',
    render: (row) => (
      <div className="min-w-0">
        <span className="block max-w-[260px] truncate font-medium text-ink" title={row.keyword}>
          {row.keyword}
        </span>
        <span className="block max-w-[260px] truncate text-2xs text-ink-muted">
          {[row.landingPath, row.location].filter(Boolean).join(' · ')}
        </span>
      </div>
    ),
    sortValue: (row) => row.keyword,
  },
  {
    key: 'position',
    header: 'Position',
    align: 'right',
    render: (row) =>
      row.position === null ? (
        <span className="text-ink-muted">100+</span>
      ) : (
        <span className={cx('font-semibold', row.position <= 3 && 'text-status-good')}>
          {row.position}
        </span>
      ),
    // Unranked sorts last regardless of direction intent.
    sortValue: (row) => row.position ?? 999,
  },
  {
    key: 'change',
    header: 'Change',
    align: 'right',
    render: (row) => <Delta value={row.change} suffix="" />,
    sortValue: (row) => row.change,
  },
  {
    key: 'history',
    header: '12-week trend',
    render: (row) => {
      const values = row.history.map((rank) => (rank === null ? 100 : rank));
      // Lower is better, so invert for the sparkline to read "up is good".
      return <Sparkline values={values.map((rank) => 101 - rank)} width={92} height={26} />;
    },
  },
  {
    key: 'best',
    header: 'Best',
    align: 'right',
    render: (row) => (row.bestPosition ? row.bestPosition : <span className="text-ink-muted">—</span>),
    sortValue: (row) => row.bestPosition || 999,
  },
];

const INTENT_COLUMN: Column<KeywordRow> = {
  key: 'intent',
  header: 'Intent',
  render: (row) => (
    <Badge tone={row.intent === 'transactional' ? 'accent' : 'neutral'} icon={null}>
      {row.intent}
    </Badge>
  ),
  sortValue: (row) => row.intent,
};

/**
 * Search Console measures clicks, impressions and CTR but knows nothing about
 * search volume, difficulty or CPC — so those columns are replaced rather than
 * shown full of dashes. A paid rank tracker would bring them back.
 */
const GSC_COLUMNS: Column<KeywordRow>[] = [
  {
    key: 'clicks',
    header: 'Clicks',
    align: 'right',
    render: (row) => number(row.clicks ?? 0),
    sortValue: (row) => row.clicks ?? 0,
  },
  {
    key: 'impressions',
    header: 'Impressions',
    align: 'right',
    render: (row) => number(row.impressions ?? 0),
    sortValue: (row) => row.impressions ?? 0,
  },
  {
    key: 'ctr',
    header: 'CTR',
    align: 'right',
    render: (row) => `${(row.ctr ?? 0).toFixed(2)}%`,
    sortValue: (row) => row.ctr ?? 0,
  },
  INTENT_COLUMN,
];

const SEED_COLUMNS: Column<KeywordRow>[] = [
  {
    key: 'volume',
    header: 'Volume',
    align: 'right',
    render: (row) => (row.volume === null ? <span className="text-ink-muted">—</span> : number(row.volume)),
    sortValue: (row) => row.volume ?? 0,
  },
  {
    key: 'difficulty',
    header: 'Difficulty',
    align: 'right',
    render: (row) =>
      row.difficulty === null ? (
        <span className="text-ink-muted">—</span>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-sunken">
            <span
              className="block h-full rounded-full"
              style={{ width: `${row.difficulty}%`, background: difficultyFill(row.difficulty) }}
            />
          </span>
          <span className="w-6 text-right">{row.difficulty}</span>
        </div>
      ),
    sortValue: (row) => row.difficulty ?? 0,
  },
  {
    key: 'cpc',
    header: 'CPC',
    align: 'right',
    render: (row) => (row.cpc === null ? <span className="text-ink-muted">—</span> : `$${row.cpc.toFixed(2)}`),
    sortValue: (row) => row.cpc ?? 0,
  },
  INTENT_COLUMN,
];

export function KeywordTable({
  keywords,
  source = 'seed',
}: {
  keywords: KeywordRow[];
  source?: 'gsc' | 'seed';
}) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const columns = useMemo(
    () => [...BASE_COLUMNS, ...(source === 'gsc' ? GSC_COLUMNS : SEED_COLUMNS)],
    [source],
  );

  const counts = useMemo(
    () => ({
      all: keywords.length,
      top10: keywords.filter((row) => row.position !== null && row.position <= 10).length,
      improved: keywords.filter((row) => row.change > 0).length,
      declined: keywords.filter((row) => row.change < 0).length,
      unranked: keywords.filter((row) => row.position === null).length,
    }),
    [keywords],
  );

  const rows = useMemo(() => {
    const byFilter = keywords.filter((row) => {
      if (filter === 'top10') return row.position !== null && row.position <= 10;
      if (filter === 'improved') return row.change > 0;
      if (filter === 'declined') return row.change < 0;
      if (filter === 'unranked') return row.position === null;
      return true;
    });

    const needle = query.trim().toLowerCase();
    return needle ? byFilter.filter((row) => row.keyword.toLowerCase().includes(needle)) : byFilter;
  }, [keywords, filter, query]);

  return (
    <Card padded={false}>
      <div className="space-y-3 p-5 pb-3">
        <CardHeader
          icon="search"
          title={source === 'gsc' ? 'Queries from Search Console' : 'Tracked keywords'}
          subtitle={
            source === 'gsc'
              ? 'Real positions, clicks and impressions from Search Console. Positive change means the query moved up the SERP; the sparkline is inverted so up always reads as better.'
              : 'Positive change means the keyword moved up the SERP. The trend sparkline is inverted so up always reads as better.'
          }
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
          placeholder="Filter keywords…"
          aria-label="Filter keywords"
          className="h-9 w-full max-w-xs rounded-lg border border-hairline bg-surface-raised px-3 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        initialSort={source === 'gsc' ? 'clicks' : 'volume'}
        emptyMessage="No keywords match this filter."
        caption="Keywords with position, weekly change and performance metrics"
      />
    </Card>
  );
}
