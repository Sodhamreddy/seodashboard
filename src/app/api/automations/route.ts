import { NextResponse } from 'next/server';
import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_STATUSES,
  type Automation,
  type AutomationCategory,
} from '@/lib/automations';
import { loadAutomations, loadRunLog, saveAutomations } from '@/lib/providers/automations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [automations, runs] = await Promise.all([loadAutomations(), loadRunLog()]);
  return NextResponse.json({ automations, runs });
}

/**
 * Persists the registry as edited in the UI.
 *
 * Every field is re-validated here rather than trusted: this file is the record
 * the whole team reads, and a status of "live" that came from a typo'd string
 * would sort and count as its own category for good.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { automations?: Automation[] };
  if (!Array.isArray(body.automations)) {
    return NextResponse.json({ error: 'No automations supplied.' }, { status: 400 });
  }

  const seen = new Set<string>();
  const automations: Automation[] = [];

  for (const entry of body.automations) {
    const id = String(entry?.id ?? '').trim();
    const name = String(entry?.name ?? '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    const category = AUTOMATION_CATEGORIES.includes(entry.category as AutomationCategory)
      ? (entry.category as AutomationCategory)
      : 'Workflows';

    automations.push({
      id,
      name,
      category,
      description: String(entry.description ?? '').trim(),
      status: AUTOMATION_STATUSES.includes(entry.status) ? entry.status : 'planned',
      clients: Math.max(0, Math.round(Number(entry.clients) || 0)),
      schedule: String(entry.schedule ?? '').trim() || 'On demand',
      href: entry.href?.startsWith('/') ? entry.href : undefined,
      externalUrl: /^https?:\/\//.test(entry.externalUrl ?? '') ? entry.externalUrl : undefined,
      notes: String(entry.notes ?? '').trim() || undefined,
    });
  }

  if (automations.length === 0) {
    return NextResponse.json({ error: 'Nothing valid to save.' }, { status: 400 });
  }

  const registry = await saveAutomations(automations);
  return NextResponse.json({ ok: true, updatedAt: registry.updatedAt, automations });
}
