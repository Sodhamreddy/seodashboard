import type { Metadata } from 'next';
import { SitemapTool } from '@/components/tools/SitemapTool';
import { Note } from '@/components/ui/primitives';
import { getActiveDomain } from '@/lib/domain';
import { gscReadiness } from '@/lib/providers/gsc';

export const metadata: Metadata = { title: 'XML Sitemap Automation' };
export const dynamic = 'force-dynamic';

export default async function SitemapPage() {
  const gsc = await gscReadiness();

  return (
    <div className="space-y-5">
      {gsc.mode !== 'live' && (
        <Note tone="warning" icon="alert">
          <span className="font-semibold">Search Console submission runs in simulation mode.</span>{' '}
          {gsc.note} The crawl, diff, spot checks and XML regeneration below are all live regardless.
        </Note>
      )}
      <SitemapTool defaultDomain={getActiveDomain()} />
    </div>
  );
}
