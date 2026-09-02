import { NextResponse } from 'next/server';
import { FetchPageError } from '@/lib/fetch-page';
import { runRobotsAudit, type RobotsPreset } from '@/lib/seo/robots';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PRESETS: RobotsPreset[] = ['standard', 'block-ai', 'wordpress', 'staging'];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    domain?: string;
    preset?: RobotsPreset;
  };

  const preset = PRESETS.includes(body.preset as RobotsPreset)
    ? (body.preset as RobotsPreset)
    : 'standard';

  try {
    return NextResponse.json(await runRobotsAudit(String(body.domain ?? ''), preset));
  } catch (error) {
    if (error instanceof FetchPageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'robots.txt audit failed.' },
      { status: 500 },
    );
  }
}
