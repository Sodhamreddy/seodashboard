/**
 * The origin a browser actually used to reach this app.
 *
 * Behind a TLS-terminating reverse proxy, `request.url` is the *internal*
 * address — nginx accepts `https://seodashboard.kleza.io` and forwards plain
 * HTTP to Node on `localhost:7002`, so every absolute redirect built from
 * `request.url` sent the browser to `localhost:7002`, which of course refuses
 * the connection.
 *
 * This is only a problem for redirects the *server* issues. A client-side
 * navigation after `fetch` uses a relative path and was unaffected, which is
 * why signing in worked while the Google OAuth callback did not.
 *
 * Resolution order:
 *   1. `APP_ORIGIN` — explicit, and immune to proxy misconfiguration.
 *   2. `X-Forwarded-Proto` / `X-Forwarded-Host`, which a correctly configured
 *      proxy sends.
 *   3. The request's own origin, which is correct in local development.
 *
 * On trusting forwarded headers: these values only ever build a **same-app**
 * redirect path, and `safeRedirectUrl` still requires the final URL to share
 * this origin. A spoofed header can therefore send a user to a different
 * hostname's copy of this app at worst, not to an attacker's page — and the
 * `APP_ORIGIN` override removes even that.
 */

const first = (value: string | null) => value?.split(',')[0]?.trim() || '';

/** Hosts that can never be the public origin of a deployed app. */
const INTERNAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)(:\d+)?$/i;

/**
 * Resolves the origin and reports how, so a misconfiguration is diagnosable.
 *
 * The case worth naming: nginx forwarding `X-Forwarded-Proto` but replacing
 * `Host` with the upstream address. The proto is then right and the host is
 * `localhost:7002`, so the app happily builds `https://localhost:7002/...` —
 * a URL that looks plausible and refuses every connection. No amount of header
 * sniffing recovers the real hostname from that request; only `APP_ORIGIN` or a
 * fixed proxy config can.
 */
export function resolvePublicOrigin(request: Request): {
  origin: string;
  source: 'env' | 'forwarded-host' | 'host-header' | 'request-url';
  /** True when the resolved host cannot be reachable from a browser. */
  looksInternal: boolean;
} {
  const override = process.env.APP_ORIGIN?.trim();
  if (override) {
    try {
      return { origin: new URL(override).origin, source: 'env', looksInternal: false };
    } catch {
      /* malformed override must not break the app */
    }
  }

  const url = new URL(request.url);
  const proto = first(request.headers.get('x-forwarded-proto')) || url.protocol.replace(':', '');
  const forwardedHost = first(request.headers.get('x-forwarded-host'));
  const hostHeader = first(request.headers.get('host'));

  const host = forwardedHost || hostHeader || url.host;
  const source = forwardedHost
    ? 'forwarded-host'
    : hostHeader
      ? 'host-header'
      : 'request-url';

  // Only a problem when the request clearly arrived through a proxy: a plain
  // localhost request in development is meant to resolve to localhost.
  const viaProxy = Boolean(request.headers.get('x-forwarded-proto'));

  return {
    origin: `${proto}://${host}`,
    source,
    looksInternal: viaProxy && INTERNAL_HOST.test(host),
  };
}

/**
 * Whether a host can be reached from a browser. Exported so a server component
 * working from `headers()` can run the same check without a `Request`.
 */
export function looksInternalHost(host: string) {
  return INTERNAL_HOST.test(host.trim());
}

export function publicOrigin(request: Request): string {
  return resolvePublicOrigin(request).origin;
}

/** An absolute URL on the public origin, for a server-issued redirect. */
export function publicUrl(request: Request, path: string): URL {
  return new URL(path, publicOrigin(request));
}
