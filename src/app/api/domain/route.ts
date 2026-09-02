import { NextResponse } from 'next/server';
import { DOMAIN_COOKIE } from '@/lib/domain';
import { normalizeDomain } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { domain?: string };
  const domain = normalizeDomain(String(body.domain ?? ''));

  if (!domain || !domain.includes('.')) {
    return NextResponse.json(
      { error: 'Enter a valid domain, for example example.com.' },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true, domain });
  response.cookies.set(DOMAIN_COOKIE, domain, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  return response;
}
