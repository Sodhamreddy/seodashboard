import { NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { clearConnection, resetTokenCache } from '@/lib/providers/googleAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  await clearConnection();
  resetTokenCache();
  return NextResponse.redirect(publicUrl(request, '/settings?google=disconnected'), {
    status: 303,
  });
}
