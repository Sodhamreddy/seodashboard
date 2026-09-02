import { NextResponse } from 'next/server';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth';
import { authCredentials, authReadiness } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Resolves a caller-supplied `next` into a URL guaranteed to be same-origin.
 *
 * Prefix checks alone do not hold. "//evil.com" is protocol-relative,
 * "/\\evil.com" is normalised to that by browsers, and "/..//evil.com"
 * resolves to a *path* of "//evil.com" which turns protocol-relative the next
 * time it is used as a base. So: collapse the leading slashes to exactly one
 * (killing the protocol-relative form), resolve against the real request
 * origin, then require the origin to have survived. Anything else → dashboard.
 */
function safeRedirectUrl(next: string, requestUrl: string) {
  const base = new URL(requestUrl);
  const fallback = new URL('/dashboard', base);

  if (!next || !next.startsWith('/')) return fallback;

  let candidate: URL;
  try {
    candidate = new URL(next.replace(/^[/\\]+/, '/'), base);
  } catch {
    return fallback;
  }
  return candidate.origin === base.origin ? candidate : fallback;
}

/** Constant-time-ish compare so a wrong username and wrong password cost the same. */
function matches(actual: string, expected: string) {
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  let username = '';
  let password = '';
  let next = '';

  // A form POST is the no-JS / pre-hydration path: the browser submits the
  // form element directly. It gets redirects; the fetch() path gets JSON.
  const contentType = request.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    username = String(body.username ?? '');
    password = String(body.password ?? '');
    next = String(body.next ?? '');
  } else {
    const form = await request.formData();
    username = String(form.get('username') ?? '');
    password = String(form.get('password') ?? '');
    next = String(form.get('next') ?? '');
  }

  const destination = safeRedirectUrl(next, request.url);

  const expected = authCredentials();

  /*
   * Refuse before comparing when a production deploy has no credentials set.
   * Without this, empty env vars would make `expected.username/password` empty
   * strings, and an empty submission would compare equal — an open door.
   */
  const readiness = authReadiness();
  if (!readiness.ready) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const message =
      `Sign-in is not configured on this deployment. It needs ${readiness.missing.join('; ')}. ` +
      'Set these in the server environment, then rebuild and restart the app.';
    return isJson
      ? NextResponse.json({ error: message }, { status: 503 })
      : NextResponse.redirect(new URL('/login?error=setup', request.url), { status: 303 });
  }

  const ok =
    matches(username.trim(), expected.username) && matches(password, expected.password);

  if (!ok) {
    // Uniform delay blunts trivial credential-stuffing loops.
    await new Promise((resolve) => setTimeout(resolve, 450));
    return isJson
      ? NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login?error=1', request.url), { status: 303 });
  }

  const response = isJson
    ? NextResponse.json({ ok: true, redirectTo: `${destination.pathname}${destination.search}` })
    : NextResponse.redirect(destination, { status: 303 });

  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(expected.username),
    sessionCookieOptions(),
  );
  return response;
}
