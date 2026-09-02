import { authSecret, sessionHours } from './env';

export const SESSION_COOKIE = 'seodash_session';

export type SessionPayload = {
  /** username */
  u: string;
  /** issued at (epoch seconds) */
  iat: number;
  /** expires at (epoch seconds) */
  exp: number;
};

/*
 * Stateless HMAC-SHA256 signed session cookie. Built on Web Crypto only, so
 * the exact same code verifies in the edge middleware and in node route
 * handlers. Payload is signed, not encrypted — never put secrets in it.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(authSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function sign(data: string) {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(data));
  return toBase64Url(new Uint8Array(signature));
}

/** Constant-time string compare — avoids leaking the signature byte by byte. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(username: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    u: username,
    iat: now,
    exp: now + Math.round(sessionHours() * 3600),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  let expected: string;
  try {
    expected = await sign(body);
  } catch {
    return null;
  }
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== 'number') return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.round(sessionHours() * 3600),
  };
}
