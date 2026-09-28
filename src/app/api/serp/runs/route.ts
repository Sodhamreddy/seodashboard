import { NextResponse } from 'next/server';
import { loadClients } from '@/lib/clients';
import { normalizeDomain } from '@/lib/env';
import { recordSerp } from '@/lib/providers/serp';
import type { SerpDevice, SerpResult } from '@/lib/serp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the SERP Agent reports what it found.
 *
 * Outside the login gate and behind its own bearer token, like the automation
 * run endpoint — the caller is an agent in another framework, not a browser.
 * It reuses AUTOMATION_INGEST_TOKEN rather than minting a second secret: both
 * endpoints are the same trust boundary (machines the team runs), and two
 * tokens for one boundary is one more to rotate and forget.
 *
 * The domain must already be on the client roster, so a typo in the agent's
 * config cannot create a client nobody set up.
 *
 *   curl -X POST https://dash.example.com/api/serp/runs \
 *     -H "authorization: Bearer $AUTOMATION_INGEST_TOKEN" \
 *     -H 'content-type: application/json' \
 *     -d '{"domain":"example.com","engine":"google","device":"desktop",
 *          "results":[{"keyword":"24 hour care","position":4,"url":"https://example.com/care"}]}'
 */

const MAX_RESULTS = 1000;

function tokenMatches(supplied: string, expected: string) {
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i += 1) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function toPosition(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.round(number) : null;
}

export async function POST(request: Request) {
  const expected = process.env.AUTOMATION_INGEST_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: 'SERP ingest is not configured. Set AUTOMATION_INGEST_TOKEN and restart.' },
      { status: 503 },
    );
  }

  const supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!supplied || !tokenMatches(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    domain?: string;
    at?: string;
    engine?: string;
    device?: string;
    location?: string;
    results?: Record<string, unknown>[];
  };

  const domain = normalizeDomain(String(body.domain ?? ''));
  const clients = await loadClients();
  if (!domain || !clients.some((client) => client.domain === domain)) {
    return NextResponse.json(
      {
        error: `"${body.domain ?? ''}" is not on the client roster. Add the client first, or fix the domain in the agent.`,
        known: clients.map((client) => client.domain),
      },
      { status: 404 },
    );
  }

  if (!Array.isArray(body.results) || body.results.length === 0) {
    return NextResponse.json({ error: 'results must be a non-empty array.' }, { status: 400 });
  }

  const results: SerpResult[] = body.results
    .slice(0, MAX_RESULTS)
    .map((row): SerpResult | null => {
      const keyword = String(row.keyword ?? '').trim();
      if (!keyword) return null;
      const url = String(row.url ?? '').trim();
      return {
        keyword: keyword.slice(0, 200),
        position: toPosition(row.position),
        url: /^https?:\/\//.test(url) ? url : undefined,
        previousPosition:
          row.previousPosition === undefined ? undefined : toPosition(row.previousPosition),
        features: Array.isArray(row.features)
          ? row.features.map((feature) => String(feature).slice(0, 40)).slice(0, 8)
          : undefined,
      };
    })
    .filter((row): row is SerpResult => row !== null);

  if (results.length === 0) {
    return NextResponse.json({ error: 'No result had a keyword.' }, { status: 400 });
  }

  const parsed = body.at ? new Date(body.at) : null;
  const store = await recordSerp({
    domain,
    at: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString(),
    engine: String(body.engine ?? 'google').slice(0, 40) || 'google',
    device: (body.device === 'mobile' ? 'mobile' : 'desktop') as SerpDevice,
    location: body.location ? String(body.location).slice(0, 80) : undefined,
    results,
  });

  return NextResponse.json({ ok: true, domain, keywords: results.length, snapshots: store.snapshots.length });
}
