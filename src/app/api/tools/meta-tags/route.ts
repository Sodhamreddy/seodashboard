import { NextResponse } from 'next/server';
import { FetchPageError, fetchPage, normalizeUrl } from '@/lib/fetch-page';
import { extractPageFacts } from '@/lib/seo/extract';
import { generateMetaTags, type MetaOptions } from '@/lib/seo/meta';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as MetaOptions & { url?: string };

  try {
    const target = normalizeUrl(String(body.url ?? ''));
    const page = await fetchPage(target.toString());
    const facts = extractPageFacts(page);

    return NextResponse.json(
      generateMetaTags(facts, {
        primaryKeyword: body.primaryKeyword,
        brandName: body.brandName,
        ogImage: body.ogImage,
        pageType: body.pageType,
        locale: body.locale,
        twitterHandle: body.twitterHandle,
      }),
    );
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed.' },
      { status: 500 },
    );
  }
}
