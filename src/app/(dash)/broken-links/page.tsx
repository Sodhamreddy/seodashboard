import type { Metadata } from 'next';
import { BrokenLinkTool } from '@/components/tools/BrokenLinkTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'Broken Link Checker' };
export const dynamic = 'force-dynamic';

export default function BrokenLinksPage() {
  return <BrokenLinkTool defaultDomain={getActiveDomain()} />;
}
