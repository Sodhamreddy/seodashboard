import { NextResponse } from 'next/server';
import { MAX_KEYWORDS, type AiEngine, type AiRunMode } from '@/lib/ai-visibility';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { loadQuestions } from '@/lib/providers/aiQuestions';
import { getJob, startJob } from '@/lib/providers/aiJobs';
import {
  brandTerms,
  engineConfigured,
  loadAiVisibility,
  runAiVisibility,
} from '@/lib/providers/aiVisibility';
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

  // Fail fast on what can be known now, rather than inside a background job.
  if (!engineConfigured(engine)) {
    return NextResponse.json(
      { error: 'Gemini is not configured. Set GEMINI_API_KEY (or GOOGLE_API_KEY) and restart.' },
      { status: 400 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json(
      {
        error:
          mode === 'questions'
            ? 'No questions to check yet — generate them from the business first.'
            : 'No ranking keywords to check for this client yet.',
      },
      { status: 400 },
    );
  }

  const job = startJob(domain, engine, mode, (progress) =>
    runAiVisibility(domain, engine, items, mode, terms, progress),
  );
  return NextResponse.json({ ok: true, job }, { status: 202 });
}

/** `?job=<id>` polls a running check; with no id, returns the stored runs. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('job');
  if (id) {
    const job = getJob(id);
    return job
      ? NextResponse.json({ job })
      : NextResponse.json({ error: 'No such check — it may have finished over an hour ago.' }, { status: 404 });
  }
  const domain = getActiveDomain();
  return NextResponse.json({ domain, runs: await loadAiVisibility(domain) });
}
