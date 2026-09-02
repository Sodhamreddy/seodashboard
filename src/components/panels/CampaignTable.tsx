'use client';

import { DataTable, type Column } from '@/components/ui/data';
import { Badge, Card, CardHeader, type Tone } from '@/components/ui/primitives';
import { currency, number, percent } from '@/lib/format';
import type { Campaign, CampaignStatus } from '@/lib/providers/ads';

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  enabled: 'good',
  limited: 'warning',
  paused: 'neutral',
};

const columns: Column<Campaign>[] = [
  {
    key: 'name',
    header: 'Campaign',
    render: (row) => (
      <div className="min-w-0">
        <span className="block max-w-[260px] truncate font-medium text-ink">{row.name}</span>
        <span className="block text-2xs text-ink-muted">{row.channel}</span>
      </div>
    ),
    sortValue: (row) => row.name,
  },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge tone={STATUS_TONE[row.status]} icon={row.status === 'limited' ? 'alert' : null}>
        {row.status === 'limited' ? 'limited by budget' : row.status}
      </Badge>
    ),
    sortValue: (row) => row.status,
  },
  {
    key: 'spend',
    header: 'Spend',
    align: 'right',
    render: (row) => currency(row.spend),
    sortValue: (row) => row.spend,
  },
  {
    key: 'impressions',
    header: 'Impr.',
    align: 'right',
    render: (row) => number(row.impressions),
    sortValue: (row) => row.impressions,
  },
  {
    key: 'clicks',
    header: 'Clicks',
    align: 'right',
    render: (row) => number(row.clicks),
    sortValue: (row) => row.clicks,
  },
  {
    key: 'ctr',
    header: 'CTR',
    align: 'right',
    render: (row) => percent(row.ctr, 2),
    sortValue: (row) => row.ctr,
  },
  {
    key: 'cpc',
    header: 'CPC',
    align: 'right',
    render: (row) => currency(row.cpc, 2),
    sortValue: (row) => row.cpc,
  },
  {
    key: 'conversions',
    header: 'Conv.',
    align: 'right',
    render: (row) => number(row.conversions, 1),
    sortValue: (row) => row.conversions,
  },
  {
    key: 'cpa',
    header: 'CPA',
    align: 'right',
    render: (row) => (row.cpa ? currency(row.cpa) : <span className="text-ink-muted">—</span>),
    sortValue: (row) => row.cpa,
  },
  {
    key: 'roas',
    header: 'ROAS',
    align: 'right',
    render: (row) => (
      <span className={row.roas >= 2 ? 'font-medium text-status-good' : undefined}>
        {row.roas.toFixed(2)}×
      </span>
    ),
    sortValue: (row) => row.roas,
  },
  {
    key: 'impressionShare',
    header: 'Impr. share',
    align: 'right',
    render: (row) => percent(row.impressionShare),
    sortValue: (row) => row.impressionShare,
  },
];

export function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <CardHeader
          icon="bars"
          title="Campaign performance"
          subtitle="Sortable by any metric. ROAS is conversion value divided by spend."
        />
      </div>
      <DataTable
        columns={columns}
        rows={campaigns}
        rowKey={(row) => row.id}
        initialSort="spend"
        caption="Campaign performance with spend, impressions, clicks, CTR, CPC, conversions, CPA and ROAS"
      />
    </Card>
  );
}
