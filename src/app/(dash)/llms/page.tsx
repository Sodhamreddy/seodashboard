import type { Metadata } from 'next';
import { LlmsTool } from '@/components/tools/LlmsTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'llms.txt' };
export const dynamic = 'force-dynamic';

export default function LlmsPage() {
  return <LlmsTool defaultDomain={getActiveDomain()} />;
}
