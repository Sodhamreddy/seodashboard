import { NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const response = NextResponse.redirect(publicUrl(request, '/login'), { status: 303 });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
