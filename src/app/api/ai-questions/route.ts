import { NextResponse } from 'next/server';
import { loadClients } from '@/lib/clients';
import { getActiveDomain } from '@/lib/domain';
import { generateQuestions, loadQuestions, removeQuestion } from '@/lib/providers/aiQuestions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const domain = getActiveDomain();
  return NextResponse.json({ domain, set: await loadQuestions(domain) });
}

/** Researches the active client's business and replaces its question set. */
export async function POST() {
  const domain = getActiveDomain();
  const client = (await loadClients()).find((entry) => entry.domain === domain);
  const result = await generateQuestions(domain, client?.name);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, set: result });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'A question id is required.' }, { status: 400 });
  const set = await removeQuestion(getActiveDomain(), body.id);
  if (!set) return NextResponse.json({ error: 'No question set for this client.' }, { status: 404 });
  return NextResponse.json({ ok: true, set });
}
