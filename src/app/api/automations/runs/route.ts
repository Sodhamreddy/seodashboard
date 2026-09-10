import { NextResponse } from 'next/server';
import { loadAutomations, recordRun } from '@/lib/providers/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where an automation reports that it ran.
 *
 * This is the one route in the app a machine calls, so it is outside the login
 * gate (see `PUBLIC_PATHS` in middleware) and gated on a bearer token instead.
 * Three rules follow from that:
 *
 *  - **No token configured, no endpoint.** It answers 503 rather than accepting
 *    anonymous writes, because a registry anyone can write to reports fiction.
 *  - **The id must already exist** in the registry. Otherwise a typo in a
 *    runner's config would quietly create a row nobody maintains.
 *  - **Nothing else is writable.** A run cannot change an automation's status,
 *    name or client count; those stay the operator's, edited in the UI.
 *
 * Push rather than pull because the automations run in more than one framework;
 * a dashboard that polled would have to know all of them.
 *
 *   curl -X POST https://dash.example.com/api/automations/runs \
 *     -H "authorization: Bearer $AUTOMATION_INGEST_TOKEN" \
 *     -H 'content-type: application/json' \
 *     -d '{"id":"serp-agent","ok":true,"durationMs":42000,"note":"124 keywords"}'
 */

/** Constant-time-ish compare, so a wrong token costs the same as a short one. */
function tokenMatches(supplied: string, expected: string) {
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < supplied.length; i += 1) {
    diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expected = process.env.AUTOMATION_INGEST_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          'Run reporting is not configured. Set AUTOMATION_INGEST_TOKEN in the server environment and restart.',
      },
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const supplied = header.replace(/^Bearer\s+/i, '').trim();
  if (!supplied || !tokenMatches(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ok?: boolean;
    at?: string;
    durationMs?: number;
    note?: string;
  };

  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'An automation id is required.' }, { status: 400 });

  const automations = await loadAutomations();
  if (!automations.some((entry) => entry.id === id)) {
    return NextResponse.json(
      {
        error: `No automation with id "${id}". Add it in the dashboard first, or correct the id in the runner.`,
        known: automations.map((entry) => entry.id),
      },
      { status: 404 },
    );
  }

  // An explicit timestamp is honoured only when it parses, so a runner with a
  // broken clock string cannot file a run under the year 1970.
  const parsed = body.at ? new Date(body.at) : null;
  const at =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();

  const duration = Number(body.durationMs);

  const history = await recordRun(id, {
    at,
    ok: body.ok !== false,
    durationMs: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : undefined,
    note: String(body.note ?? '').trim().slice(0, 300) || undefined,
  });

  return NextResponse.json({ ok: true, id, runs: history.length });
}
