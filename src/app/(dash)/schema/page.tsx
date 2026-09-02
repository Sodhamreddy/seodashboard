import type { Metadata } from 'next';
import { SchemaTool } from '@/components/tools/SchemaTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'Schema Markup Generator' };
export const dynamic = 'force-dynamic';

export default function SchemaPage() {
  return <SchemaTool defaultUrl={`https://${getActiveDomain()}/`} />;
}
