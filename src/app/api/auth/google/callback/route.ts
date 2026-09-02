import { NextResponse } from 'next/server';
import {
  GOOGLE_STATE_COOKIE,
  fetchGoogleEmail,
  googleOAuthClient,
  googleRedirectUri,
  resetTokenCache,
  saveConnection,
} from '@/lib/providers/googleAuth';

export const runtime = 'nodejs';

/** Everything lands back on /settings with a status the page can explain. */
function back(request: Request, status: string) {
  const response = NextResponse.redirect(new URL(`/settings?google=${status}`, request.url));
  response.cookies.set(GOOGLE_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return back(request, error === 'access_denied' ? 'denied' : 'error');
  if (!code) return back(request, 'no_code');

  // CSRF: the state Google echoed must match the cookie we set at start.
  const expected = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_STATE_COOKIE}=`))
    ?.slice(GOOGLE_STATE_COOKIE.length + 1);

  if (!state || !expected || state !== expected) return back(request, 'bad_state');

  const { clientId, clientSecret } = googleOAuthClient();
  if (!clientId || !clientSecret) return back(request, 'missing_client');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(request),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!tokenResponse.ok) return back(request, 'exchange_failed');

    const body = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
    };

    // No refresh token means we'd be back to 1-hour tokens — treat as failure
    // rather than storing something that stops working after an hour.
    if (!body.refresh_token) return back(request, 'no_refresh_token');

    await saveConnection({
      refreshToken: body.refresh_token,
      scopes: (body.scope ?? '').split(' ').filter(Boolean),
      email: body.access_token ? await fetchGoogleEmail(body.access_token) : '',
      connectedAt: new Date().toISOString(),
    });
    resetTokenCache();

    return back(request, 'connected');
  } catch {
    return back(request, 'exchange_failed');
  }
}
