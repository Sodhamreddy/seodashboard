import { NextResponse } from 'next/server';
import { getActiveDomain } from '@/lib/domain';
import {
  MAX_KEYWORDS,
  loadAiVisibility,
  runAiVisibility,
  type AiEngine,
} from '@/lib/providers/aiVisibility';
import { getKeywordReport } from '@/lib/providers/keywords';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs an AI visibility check for the active client.
 *
 * Deliberately a POST someone presses rather than something the traffic page
 * does on render: each keyword is a grounded model call costing seconds and
 * quota, and a panel that re-ran itself on every page view would spend both
 * on nobody's behalf. The result is stored, so the page shows the last run
 * with its timestamp until the button is pressed again.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { engine?: AiEngine };
  const engine = body.engine ?? 'gemini';
  const domain = getActiveDomain();

  /*
   * The keywords are the ones the site already ranks for on Google — the
   * interesting question is not "does this engine know the topic" but
   * "where we earn clicks today, does the answer engine cite us".
   */
  const keywords = await getKeywordReport(domain);
  const ranking = keywords.keywords
    .filter((row) => row.position !== null)
    .slice(0, MAX_KEYWORDS)
    .map((row) => row.keyword);

  const result = await runAiVisibility(domain, engine, ranking);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, run: result });
}

export async function GET() {
  const domain = getActiveDomain();
  return NextResponse.json({ domain, runs: await loadAiVisibility(domain) });
}
