import { NextResponse } from 'next/server';
import { FetchPageError } from '@/lib/fetch-page';
import { listSearchConsoleSitemaps, submitSitemapToSearchConsole } from '@/lib/providers/gsc';
import { runSitemapAudit } from '@/lib/seo/sitemap';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    domain?: string;
    sitemapUrl?: string;
    action?: 'audit' | 'snapshot' | 'submit' | 'gsc-list';
  };

  const action = body.action ?? 'audit';
  const domain = String(body.domain ?? '');

  try {
    if (action === 'gsc-list') {
      return NextResponse.json(await listSearchConsoleSitemaps(domain));
    }

    if (action === 'submit') {
      if (!body.sitemapUrl) {
        return NextResponse.json({ error: 'No sitemap URL to submit.' }, { status: 400 });
      }
      return NextResponse.json(await submitSitemapToSearchConsole(domain, body.sitemapUrl));
    }

    return NextResponse.json(
      await runSitemapAudit(domain, {
        saveSnapshot: action === 'snapshot',
        sitemapUrl: body.sitemapUrl,
      }),
    );
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sitemap audit failed.' },
      { status: 500 },
    );
  }
}
