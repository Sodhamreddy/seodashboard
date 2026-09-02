import { NextResponse } from 'next/server';
import {
  GOOGLE_STATE_COOKIE,
  googleOAuthClient,
  googleRedirectUri,
  requestedScopes,
} from '@/lib/providers/googleAuth';

export const runtime = 'nodejs';


/**
 * Kicks off the Google consent screen.
 *
 * `access_type=offline` + `prompt=consent` is what guarantees a refresh token
 * comes back — without both, Google returns only a 1-hour access token on
 * repeat authorisations, which is exactly the manual-paste problem this flow
 * exists to remove.
 */
export async function GET(request: Request) {
  const { clientId, clientSecret } = googleOAuthClient();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?google=missing_client', request.url));
  }

  // Random state, echoed back by Google, compared against a cookie — this is
  // what stops a third party from completing the flow on the user's behalf.
  const state = crypto.randomUUID();

  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', googleRedirectUri(request));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', ['openid', 'email', ...requestedScopes()].join(' '));
  authorize.searchParams.set('access_type', 'offline');
  authorize.searchParams.set('prompt', 'consent');
  authorize.searchParams.set('include_granted_scopes', 'true');
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return response;
}
