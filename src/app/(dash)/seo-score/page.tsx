import type { Metadata } from 'next';
import { SeoScoreTool } from '@/components/tools/SeoScoreTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'SEO Score Checker' };
export const dynamic = 'force-dynamic';

export default function SeoScorePage() {
  return <SeoScoreTool defaultUrl={`https://${getActiveDomain()}/`} />;
}
