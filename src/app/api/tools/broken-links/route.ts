import { NextResponse } from 'next/server';
import { FetchPageError } from '@/lib/fetch-page';
import { runBrokenLinkCheck } from '@/lib/seo/broken-links';

export const runtime = 'nodejs';
/* A 200-link page at 8 concurrent probes can legitimately take a while. */
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string };

  try {
    return NextResponse.json(await runBrokenLinkCheck(String(body.url ?? '')));
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Link check failed.' },
      { status: 500 },
    );
  }
}
