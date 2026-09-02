import { NextResponse } from 'next/server';
import { FetchPageError, fetchPage, normalizeUrl } from '@/lib/fetch-page';
import { extractPageFacts } from '@/lib/seo/extract';
import { fetchVitals } from '@/lib/seo/pagespeed';
import { analyzeSeoScore } from '@/lib/seo/score';
import { quickSitemapProbe } from '@/lib/seo/sitemap';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    strategy?: 'mobile' | 'desktop';
  };

  try {
    const target = normalizeUrl(String(body.url ?? ''));
    const page = await fetchPage(target.toString());
    const facts = extractPageFacts(page);

    // The crawl probe and PageSpeed run concurrently — both are network-bound.
    const [crawl, vitals] = await Promise.all([
      quickSitemapProbe(facts.origin),
      fetchVitals(facts.url, body.strategy ?? 'mobile'),
    ]);

    return NextResponse.json(analyzeSeoScore(facts, crawl, vitals.vitals, vitals.note));
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed.' },
      { status: 500 },
    );
  }
}
