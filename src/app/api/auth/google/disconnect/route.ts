import { NextResponse } from 'next/server';
import { clearConnection, resetTokenCache } from '@/lib/providers/googleAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  await clearConnection();
  resetTokenCache();
  return NextResponse.redirect(new URL('/settings?google=disconnected', request.url), {
    status: 303,
  });
}
