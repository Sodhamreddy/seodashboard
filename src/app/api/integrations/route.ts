import { NextResponse } from 'next/server';
import { listGa4Properties } from '@/lib/providers/ga4';
import { isGa4Failure } from '@/lib/providers/ga4';
import { listProperties } from '@/lib/providers/searchConsole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the connected Google account can actually see.
 *
 * This exists so mapping a client to a provider account is a pick-from-a-list
 * operation rather than a hunt for a numeric id in another product's admin
 * screen. The ids were always discoverable — asking the operator to type them
 * was the wrong design.
 */
export async function GET() {
  const [ga4, gsc] = await Promise.all([
    listGa4Properties(),
    listProperties().catch(() => []),
  ]);

  return NextResponse.json({
    ga4: isGa4Failure(ga4)
      ? { error: ga4.kind, properties: [] }
      : { error: null, properties: ga4 },
    // Informational only: Search Console resolves itself from the domain, but
    // seeing the verified list explains why a client's rankings are empty.
    gsc: gsc.map((property) => property.siteUrl),
  });
}
