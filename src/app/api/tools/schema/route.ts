import { NextResponse } from 'next/server';
import { FetchPageError, fetchPage, normalizeUrl } from '@/lib/fetch-page';
import { extractPageFacts } from '@/lib/seo/extract';
import { detectSchema } from '@/lib/seo/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Detects existing JSON-LD and prefills the generator from the live page. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string };

  try {
    const target = normalizeUrl(String(body.url ?? ''));
    const page = await fetchPage(target.toString());
    return NextResponse.json(detectSchema(extractPageFacts(page)));
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Detection failed.' },
      { status: 500 },
    );
  }
}
