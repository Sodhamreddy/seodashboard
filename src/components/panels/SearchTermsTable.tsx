'use client';

import { DataTable, type Column } from '@/components/ui/data';
import { currency } from '@/lib/format';
import type { AdsReport } from '@/lib/providers/ads';

/**
 * A server component (the Google Ads page) cannot pass a `columns` array
 * containing render functions straight into the client `DataTable` — Next
 * forbids functions crossing the server/client boundary. This wrapper takes
 * the plain, serialisable `searchTerms` array instead and builds the column
 * functions here, client-side, the same pattern KeywordTable/BacklinkTable/
 * CampaignTable already use.
 */

type SearchTermRow = AdsReport['searchTerms'][number];

const COLUMNS: Column<SearchTermRow>[] = [
  {
    key: 'term',
    header: 'Search term',
    render: (row) => row.term,
    sortValue: (row) => row.term,
  },
  {
    key: 'clicks',
    header: 'Clicks',
    align: 'right',
    render: (row) => row.clicks,
    sortValue: (row) => row.clicks,
  },
  {
    key: 'cost',
    header: 'Cost',
    align: 'right',
    render: (row) => currency(row.cost),
    sortValue: (row) => row.cost,
  },
  {
    key: 'conversions',
    header: 'Conv.',
    align: 'right',
    render: (row) => row.conversions,
    sortValue: (row) => row.conversions,
  },
  {
    key: 'cpa',
    header: 'CPA',
    align: 'right',
    render: (row) =>
      row.conversions > 0 ? (
        currency(row.cost / row.conversions)
      ) : (
        <span className="text-status-critical">no conv.</span>
      ),
    sortValue: (row) => (row.conversions > 0 ? row.cost / row.conversions : Number.POSITIVE_INFINITY),
  },
];

export function SearchTermsTable({ searchTerms }: { searchTerms: SearchTermRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={searchTerms}
      rowKey={(row) => row.term}
      initialSort="cost"
      caption="Search terms with clicks, cost, conversions and CPA"
    />
  );
}
