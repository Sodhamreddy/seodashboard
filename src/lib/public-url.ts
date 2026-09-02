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

export function publicOrigin(request: Request): string {
  const override = process.env.APP_ORIGIN?.trim();
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      // A malformed APP_ORIGIN must not take the app down; fall through.
    }
  }

  const url = new URL(request.url);
  const proto = first(request.headers.get('x-forwarded-proto')) || url.protocol.replace(':', '');
  const host =
    first(request.headers.get('x-forwarded-host')) ||
    first(request.headers.get('host')) ||
    url.host;

  return `${proto}://${host}`;
}

/** An absolute URL on the public origin, for a server-issued redirect. */
export function publicUrl(request: Request, path: string): URL {
  return new URL(path, publicOrigin(request));
}
