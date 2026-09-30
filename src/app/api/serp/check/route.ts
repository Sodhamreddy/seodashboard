import { NextResponse } from 'next/server';
import { loadClients } from '@/lib/clients';
import { normalizeDomain } from '@/lib/env';
import { checkGoogleRank, serperConfigured } from '@/lib/free-serp';
import { recordSerp } from '@/lib/providers/serp';
import type { SerpResult } from '@/lib/serp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_KEYWORDS = 10;

/**
 * On-demand Google rank check for the active client.
 *
 * Reads real Google results through Serper (see lib/free-serp). A missing key
 * is reported as configuration, not a failed lookup, so the operator knows to
 * add SERPER_API_KEY rather than assuming the site is down.
 */
export async function POST(request: Request) {
  const started = Date.now();

  if (!serperConfigured()) {
    return NextResponse.json(
      {
        error:
          'Google rank checks are not configured. Add SERPER_API_KEY (a free key from serper.dev) to the environment and restart.',
      },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    domain?: string;
    keywords?: string[];
    country?: string;
    location?: string;
  };

  const domain = normalizeDomain(String(body.domain ?? ''));
  const clients = await loadClients();
  if (!domain || !clients.some((client) => client.domain === domain)) {
    return NextResponse.json({ error: 'Choose a saved client before running a rank check.' }, { status: 400 });
  }

  const keywords = Array.from(
    new Set(
      (Array.isArray(body.keywords) ? body.keywords : [])
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_KEYWORDS);
  if (keywords.length === 0) {
    return NextResponse.json({ error: 'Enter at least one keyword.' }, { status: 400 });
  }

  const location = body.location?.trim() || undefined;

  const settled = await Promise.allSettled(
    keywords.map((keyword) =>
      checkGoogleRank(keyword.slice(0, 200), domain, { country: body.country, location }),
    ),
  );

  const results: SerpResult[] = settled.flatMap((outcome) =>
    outcome.status === 'fulfilled'
      ? [
          {
            keyword: outcome.value.keyword,
            position: outcome.value.position,
            url: outcome.value.url,
            features: outcome.value.inLocalPack ? ['local-pack'] : undefined,
          },
        ]
      : [],
  );

  const errors = settled.flatMap((outcome, index) =>
    outcome.status === 'rejected'
      ? [
          {
            keyword: keywords[index],
            message: outcome.reason instanceof Error ? outcome.reason.message : 'Lookup failed.',
          },
        ]
      : [],
  );

  if (results.length === 0) {
    return NextResponse.json(
      { error: errors[0]?.message ?? 'The Google lookup returned no results.', errors },
      { status: 502 },
    );
  }

  // Kept in the same history as the agent's own runs; labelled by source.
  await recordSerp({
    domain,
    at: new Date().toISOString(),
    engine: 'google',
    device: 'desktop',
    location,
    results,
  });

  return NextResponse.json({
    ok: true,
    results,
    errors,
    durationMs: Date.now() - started,
    note: location
      ? `Live Google results from ${location}.`
      : 'Live Google desktop results, national (add a location for local ranks).',
  });
}
