import type { Metadata } from 'next';
import { MetaTagTool } from '@/components/tools/MetaTagTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'Meta Tag Generator' };
export const dynamic = 'force-dynamic';

export default function MetaTagsPage() {
  return <MetaTagTool defaultUrl={`https://${getActiveDomain()}/`} />;
}
