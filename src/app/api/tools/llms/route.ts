import { NextResponse } from 'next/server';
import { FetchPageError } from '@/lib/fetch-page';
import { runLlmsAudit } from '@/lib/seo/llms';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { domain?: string };

  try {
    return NextResponse.json(await runLlmsAudit(String(body.domain ?? '')));
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'llms.txt audit failed.' },
      { status: 500 },
    );
  }
}
