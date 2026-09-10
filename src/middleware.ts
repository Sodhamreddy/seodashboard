import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { publicUrl } from '@/lib/public-url';

/**
 * Everything except these is behind the login gate.
 *
 * `/api/automations/runs` is the one route a machine calls — an automation
 * running in another framework reporting that it ran — so a session cookie is
 * not available to it. It enforces a bearer token of its own and refuses
 * outright when that token is unset, which is a narrower door than a shared
 * login: it can only append to the run log, and only for an id already in the
 * registry.
 */
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/automations/runs',
];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (session && pathname === '/login') {
    return NextResponse.redirect(publicUrl(request, '/dashboard'));
  }

  if (isPublic || session) return NextResponse.next();

  // Unauthenticated API calls get a 401 rather than an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = publicUrl(request, '/login');
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
