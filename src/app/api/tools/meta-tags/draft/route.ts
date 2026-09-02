import { NextResponse } from 'next/server';
import { normalizeUrl } from '@/lib/fetch-page';
import { readJson, writeJson } from '@/lib/store';
import type { MetaSnippetInput } from '@/lib/seo/meta';

export const runtime = 'nodejs';

type Draft = { url: string; snippet: MetaSnippetInput; savedAt: string };

/** One file per URL, so re-editing the same page overwrites rather than piles up. */
function draftPath(url: string) {
  const key = url.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 120);
  return `drafts/meta/${key}.json`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    snippet?: MetaSnippetInput;
  };

  if (!body.snippet || typeof body.snippet !== 'object') {
    return NextResponse.json({ error: 'No snippet supplied.' }, { status: 400 });
  }

  let url: string;
  try {
    url = normalizeUrl(String(body.url ?? '')).toString();
  } catch {
    return NextResponse.json({ error: 'A valid page URL is required.' }, { status: 400 });
  }

  const draft: Draft = { url, snippet: body.snippet, savedAt: new Date().toISOString() };
  await writeJson(draftPath(url), draft);
  return NextResponse.json({ ok: true, savedAt: draft.savedAt });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('url') ?? '';

  let url: string;
  try {
    url = normalizeUrl(raw).toString();
  } catch {
    return NextResponse.json({ error: 'A valid page URL is required.' }, { status: 400 });
  }

  const draft = await readJson<Draft | null>(draftPath(url), null);
  return NextResponse.json({ ok: true, draft });
}
