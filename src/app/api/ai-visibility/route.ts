import { NextResponse } from 'next/server';
import { MAX_KEYWORDS, type AiEngine, type AiRunMode } from '@/lib/ai-visibility';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { loadQuestions } from '@/lib/providers/aiQuestions';
import { brandTerms, loadAiVisibility, runAiVisibility } from '@/lib/providers/aiVisibility';
import { getKeywordReport } from '@/lib/providers/keywords';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs an AI visibility check for the active client.
 *
 * A POST someone presses, never something a page does on render: each prompt
 * is a grounded model call costing seconds and quota. Two modes:
 *
 *  - `keywords` — the terms the site already ranks for in Search Console.
 *    "Where we earn clicks today, does the answer engine cite us?"
 *  - `questions` — buyer questions generated from the business.
 *    "When someone shops our category, does the assistant recommend us?"
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { engine?: AiEngine; mode?: AiRunMode };
  const engine = body.engine ?? 'gemini';
  const mode: AiRunMode = body.mode === 'questions' ? 'questions' : 'keywords';
  const domain = getActiveDomain();

  const client = (await loadClients()).find((entry) => entry.domain === domain);
  const questionSet = mode === 'questions' ? await loadQuestions(domain) : null;

  // A mention by the trading name counts, not only by the domain.
  const terms = brandTerms(domain, [client?.name]);

  let items: { text: string; topic?: string }[];
  if (mode === 'questions') {
    items = (questionSet?.questions ?? []).map((question) => ({
      text: question.question,
      topic: question.topic,
    }));
  } else {
    const report = await getKeywordReport(domain);
    items = report.keywords
      .filter((row) => row.position !== null)
      .slice(0, MAX_KEYWORDS)
      .map((row) => ({ text: row.keyword }));
  }

  const result = await runAiVisibility(domain, engine, items, mode, terms);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, run: result });
}

export async function GET() {
  const domain = getActiveDomain();
  return NextResponse.json({ domain, runs: await loadAiVisibility(domain) });
}
