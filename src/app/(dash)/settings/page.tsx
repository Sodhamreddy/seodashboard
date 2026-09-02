import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Instructions } from '@/components/ui/Instructions';
import { Badge, Card, CardHeader, Note, SectionHeading, cx } from '@/components/ui/primitives';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { getActiveDomain } from '@/lib/domain';
import { loadClients } from '@/lib/clients';
import { ClientIntegrations } from '@/components/panels/ClientIntegrations';
import {
  getConnection,
  gmbScopeEnabled,
  hasAnalyticsScope,
  hasBusinessScope,
} from '@/lib/providers/googleAuth';
import { gscReadiness } from '@/lib/providers/gsc';
import {
  DEV_FALLBACK_USERNAME,
  adsProviderStatus,
  authCredentials,
  backlinkProviderStatus,
  googleAdsConfig,
  pageSpeedKey,
  rankProviderStatus,
  sessionHours,
} from '@/lib/env';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Read-only configuration status.
 *
 * This page deliberately never renders a secret value — only whether one is
 * present. Anything that could leak a key belongs in .env.local and nowhere a
 * browser (or a screenshot in a client meeting) can reach it.
 */
const GOOGLE_STATUS_MESSAGE: Record<string, { tone: 'good' | 'critical' | 'warning'; text: string }> = {
  connected: {
    tone: 'good',
    text: 'Google account connected. Search Console is live; Analytics 4 traffic is live if you approved the Analytics permission.',
  },
  disconnected: { tone: 'warning', text: 'Google account disconnected. The stored refresh token was deleted.' },
  denied: { tone: 'warning', text: 'You declined the Google consent screen, so nothing was connected.' },
  bad_state: { tone: 'critical', text: 'The security check failed (state mismatch). Start the connection again.' },
  no_refresh_token: {
    tone: 'critical',
    text: 'Google returned no refresh token. Revoke this app at myaccount.google.com/permissions, then connect again.',
  },
  exchange_failed: {
    tone: 'critical',
    text: 'Google rejected the token exchange. The most common cause is a redirect URI not registered in Google Cloud.',
  },
  missing_client: {
    tone: 'critical',
    text: 'GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set before connecting.',
  },
  error: { tone: 'critical', text: 'Google returned an error. Try again.' },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { google?: string };
}) {
  const session = await verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  const domain = getActiveDomain();
  const credentials = authCredentials();
  const ads = googleAdsConfig();
  const google = await getConnection();
  const gsc = await gscReadiness();
  const clients = await loadClients();

  /*
   * A refresh token never gains a scope retroactively, so a connection made
   * before GA4 support was added is "connected" yet cannot read Analytics. That
   * is a distinct state from disconnected and needs its own prompt — otherwise
   * the page shows a green "Connected" badge beside a traffic page that says
   * nothing works.
   */
  const analyticsGranted = google.connected && hasAnalyticsScope(google.scopes);
  const needsAnalyticsReconsent = google.connected && !analyticsGranted;
  const googleStatus = searchParams.google ? GOOGLE_STATUS_MESSAGE[searchParams.google] : undefined;

  const integrations: {
    name: string;
    icon: IconName;
    live: boolean;
    detail: string;
    vars: { key: string; set: boolean }[];
  }[] = [
    {
      name: 'PageSpeed Insights',
      icon: 'gauge',
      live: !!pageSpeedKey(),
      detail: pageSpeedKey()
        ? 'Core Web Vitals in the SEO Score Checker are live.'
        : 'Free Google API key. Without it the score checker reports on-page checks only.',
      vars: [{ key: 'PAGESPEED_API_KEY', set: !!pageSpeedKey() }],
    },
    {
      name: 'Search Console',
      icon: 'sitemap',
      live: gsc.mode === 'live',
      detail:
        gsc.mode === 'live'
          ? 'Sitemap submission posts to Search Console for real.'
          : 'Sitemap submission runs in simulation mode and says so on the page.',
      vars: [
        { key: 'Connected Google account', set: google.connected },
        { key: 'GSC_ACCESS_TOKEN (fallback)', set: !!process.env.GSC_ACCESS_TOKEN },
        { key: 'GSC_SITE_URL', set: !!process.env.GSC_SITE_URL },
      ],
    },
    {
      name: 'Analytics 4 (traffic)',
      icon: 'bars',
      live: analyticsGranted,
      detail: !google.connected
        ? 'Sessions, channels and landing pages need a connected Google account.'
        : analyticsGranted
          ? 'Traffic data is live. Set GA4_PROPERTY_ID only if several properties match.'
          : 'Connected, but this token predates GA4 support — reconnect below to grant the Analytics scope.',
      vars: [
        { key: 'Connected Google account', set: google.connected },
        { key: 'analytics.readonly scope granted', set: analyticsGranted },
        { key: 'GA4_PROPERTY_ID (optional override)', set: !!process.env.GA4_PROPERTY_ID },
      ],
    },
    {
      name: 'Business Profile (reviews)',
      icon: 'sparkles',
      live: google.connected && hasBusinessScope(google.scopes),
      detail: !gmbScopeEnabled()
        ? 'Off by default. business.manage is a Google restricted scope; requesting it from an unapproved project can break the whole consent screen. Set ENABLE_GMB_SCOPE=true only after Google approves Business Profile API access.'
        : hasBusinessScope(google.scopes)
          ? 'Scope granted. Reviews are live unless the project is still awaiting Google approval.'
          : 'Scope enabled but not yet granted — reconnect Google above.',
      vars: [
        { key: 'ENABLE_GMB_SCOPE=true', set: gmbScopeEnabled() },
        { key: 'business.manage scope granted', set: google.connected && hasBusinessScope(google.scopes) },
        { key: 'GMB_LOCATION_ID (optional override)', set: !!process.env.GMB_LOCATION_ID },
      ],
    },
    {
      name: 'Google Ads',
      icon: 'bars',
      live: adsProviderStatus().mode === 'live',
      detail: adsProviderStatus().note || 'Live campaign data is being pulled from the Ads API.',
      vars: [
        { key: 'ADS_PROVIDER=google', set: (process.env.ADS_PROVIDER ?? '') === 'google' },
        { key: 'GOOGLE_ADS_DEVELOPER_TOKEN', set: !!ads.developerToken },
        { key: 'GOOGLE_ADS_CLIENT_ID', set: !!ads.clientId },
        { key: 'GOOGLE_ADS_CLIENT_SECRET', set: !!ads.clientSecret },
        { key: 'GOOGLE_ADS_REFRESH_TOKEN', set: !!ads.refreshToken },
        { key: 'GOOGLE_ADS_CUSTOMER_ID', set: !!ads.customerId },
        { key: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC only)', set: !!ads.loginCustomerId },
      ],
    },
    {
      name: 'Backlink provider',
      icon: 'link',
      live: backlinkProviderStatus().mode === 'live',
      detail: backlinkProviderStatus().note || 'Live referring-domain data is being pulled.',
      vars: [
        { key: 'BACKLINK_PROVIDER', set: !!process.env.BACKLINK_PROVIDER },
        { key: 'CRAWLY_API_KEY', set: !!process.env.CRAWLY_API_KEY },
      ],
    },
    {
      name: 'Rank tracking',
      icon: 'search',
      live: rankProviderStatus().mode === 'live',
      detail: rankProviderStatus().note || 'Live rank tracking is being pulled.',
      vars: [
        { key: 'RANK_PROVIDER', set: !!process.env.RANK_PROVIDER },
        { key: 'SERANKING_API_KEY', set: !!process.env.SERANKING_API_KEY },
      ],
    },
    {
      name: 'Alert delivery',
      icon: 'bell',
      live: !!process.env.ALERT_WEBHOOK_URL,
      detail: process.env.ALERT_WEBHOOK_URL
        ? 'Budget alerts post to the configured webhook.'
        : 'Budget alerts are evaluated but have nowhere to go. A Slack or n8n webhook URL is enough.',
      vars: [
        { key: 'ALERT_WEBHOOK_URL', set: !!process.env.ALERT_WEBHOOK_URL },
        { key: 'ALERT_EMAIL_TO', set: !!process.env.ALERT_EMAIL_TO },
      ],
    },
  ];

  const liveCount = integrations.filter((integration) => integration.live).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold leading-tight text-ink">Settings</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">
          Read-only view of how this instance is configured. {liveCount} of {integrations.length}{' '}
          integrations have their variables set.
        </p>
      </header>

      {credentials.isDefault && (
        <Note tone="critical" icon="alert">
          <span className="font-semibold">This dashboard is using development credentials.</span>{' '}
          Anyone who can reach this port can sign in as{' '}
          <code className="font-mono">{DEV_FALLBACK_USERNAME}</code>. Set{' '}
          <code className="font-mono">DASHBOARD_USERNAME</code>,{' '}
          <code className="font-mono">DASHBOARD_PASSWORD</code> and{' '}
          <code className="font-mono">AUTH_SECRET</code> in{' '}
          <code className="font-mono">.env.local</code>, then restart. The secret matters as much as
          the password — the default lets anyone forge a session cookie.
        </Note>
      )}

      <Instructions
        title="How to change any of this"
        icon="info"
        steps={[
          <>
            Everything here is read from{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">.env.local</code> at the
            project root. Copy{' '}
            <code className="rounded bg-surface-sunken px-1 font-mono">.env.example</code> if you do
            not have one yet.
          </>,
          <>
            Edit the variable, then <strong className="text-ink">restart the server</strong> — env
            values are read at boot, not per request.
          </>,
          <>
            See <code className="rounded bg-surface-sunken px-1 font-mono">API-INTEGRATION.md</code>{' '}
            for exactly which API each variable belongs to, what it costs, and how to obtain it.
          </>,
          <>
            <strong className="text-ink">No secret value is ever shown on this page</strong> — only
            whether it is set — so this screen is safe to share in a call.
          </>,
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader icon="home" title="Active domain" subtitle="What the data panels are scoped to" />
          <p className="text-lg font-semibold text-ink">{domain}</p>
          <p className="mt-1 text-2xs text-ink-muted">
            Change it from the client switcher in the top bar.
          </p>
        </Card>

        <Card>
          <CardHeader icon="shield" title="Session" subtitle="Signed HMAC cookie, httpOnly" />
          <p className="text-lg font-semibold text-ink">{session?.u ?? 'unknown'}</p>
          <p className="mt-1 text-2xs text-ink-muted">
            Expires {sessionHours()}h after sign-in. Rotating{' '}
            <code className="font-mono">AUTH_SECRET</code> invalidates every session.
          </p>
        </Card>

        <Card>
          <CardHeader icon="layers" title="Local store" subtitle="Sitemap baselines, alert rules, drafts" />
          <p className="text-lg font-semibold text-ink">.data/</p>
          <p className="mt-1 text-2xs text-ink-muted">
            JSON files on disk. Not writable on serverless — swap{' '}
            <code className="font-mono">src/lib/store.ts</code> for a database before deploying
            those features.
          </p>
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Client integrations"
          subtitle="Which provider account each client reads from — set per client, not globally"
        />
        <ClientIntegrations
          clients={clients}
          activeDomain={domain}
          envFallbackActive={clients.length <= 1}
        />
      </section>

      <section>
        <SectionHeading
          title="Google account"
          subtitle="One sign-in covers Search Console, Google Analytics 4 and Google Ads token handling"
        />

        {googleStatus && (
          <div className="mb-3">
            <Note
              tone={googleStatus.tone}
              icon={googleStatus.tone === 'good' ? 'check' : 'alert'}
            >
              {googleStatus.text}
            </Note>
          </div>
        )}

        {/* Stated up front rather than left to the integrations list: a green
            "Connected" badge beside an empty Traffic page is the confusing
            case this notice exists to resolve. */}
        {needsAnalyticsReconsent && (
          <div className="mb-3">
            <Note tone="warning" icon="alert">
              <span className="font-semibold">
                Google Analytics 4 needs one more permission.
              </span>{' '}
              This account was connected before GA4 support existed, so its token covers Search
              Console and Ads but not Analytics — a token never gains a scope retroactively. Use{' '}
              <strong>Reconnect to add Analytics</strong> below and approve the Analytics
              permission; nothing else changes and the Ads setup is untouched.
            </Note>
          </div>
        )}

        <Card>
          <CardHeader
            icon="shield"
            title={google.connected ? `Connected as ${google.email || 'a Google account'}` : 'Not connected'}
            subtitle={
              google.connected
                ? 'A refresh token is stored server-side and used to mint access tokens automatically.'
                : 'Signing in stores a refresh token so access tokens never need pasting again.'
            }
            action={
              <Badge tone={google.connected ? 'good' : 'warning'}>
                {google.connected ? 'Connected' : 'Not connected'}
              </Badge>
            }
          />

          {!google.configurable ? (
            <Note tone="critical" icon="alert">
              Set {google.missing.join(' and ')} in{' '}
              <code className="font-mono">.env.local</code> before connecting — the OAuth client is
              what identifies this app to Google.
            </Note>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {google.connected ? (
                  <>
                    {/* Reconnect runs the same consent flow. `prompt=consent`
                        is already set on the start route, so this is what
                        actually grants a newly-added scope. */}
                    <a
                      href="/api/auth/google/start"
                      className={
                        needsAnalyticsReconsent
                          ? 'btn-accent inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm'
                          : 'inline-flex h-10 items-center gap-2 rounded-lg border border-hairline px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken'
                      }
                    >
                      <Icon name="refresh" size={15} />
                      {needsAnalyticsReconsent ? 'Reconnect to add Analytics' : 'Reconnect'}
                    </a>
                    <form action="/api/auth/google/disconnect" method="post">
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairline px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-tint-critical hover:text-status-critical"
                      >
                        <Icon name="logout" size={15} />
                        Disconnect
                      </button>
                    </form>
                  </>
                ) : (
                  <a
                    href="/api/auth/google/start"
                    className="btn-accent inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm"
                  >
                    <Icon name="shield" size={15} />
                    Connect Google account
                  </a>
                )}

                {google.connectedAt && (
                  <p className="text-2xs text-ink-muted">
                    Connected {new Date(google.connectedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-hairline pt-3">
                <p className="text-2xs leading-relaxed text-ink-secondary">
                  <strong className="text-ink">What this unlocks:</strong> Search Console sitemap
                  submission becomes fully live, and Google Ads no longer needs a hand-minted
                  refresh token.
                </p>
                <p className="text-2xs leading-relaxed text-ink-secondary">
                  <strong className="text-ink">What it cannot unlock:</strong> the Google Ads{' '}
                  <code className="font-mono">developer token</code>. That is issued to a manager
                  account and approved by Google — no sign-in substitutes for it.
                </p>
                <p className="text-2xs leading-relaxed text-ink-muted">
                  Register this redirect URI in Google Cloud → Credentials → your OAuth client:{' '}
                  <code className="font-mono">http://localhost:3001/api/auth/google/callback</code>
                </p>
              </div>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Integrations"
          subtitle="Whether the variables are present. A key can be set and still be expired — validity is proven when the tool actually calls the API."
        />
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.name}>
              <CardHeader
                icon={integration.icon}
                title={integration.name}
                subtitle={integration.detail}
                action={
                  <Badge tone={integration.live ? 'good' : 'warning'}>
                    {integration.live ? 'Configured' : 'Not configured'}
                  </Badge>
                }
              />
              <ul className="space-y-1">
                {integration.vars.map((variable) => (
                  <li
                    key={variable.key}
                    className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 last:border-0"
                  >
                    <code className="truncate font-mono text-2xs text-ink-secondary">
                      {variable.key}
                    </code>
                    <span
                      className={cx(
                        'inline-flex shrink-0 items-center gap-1 text-2xs font-medium',
                        variable.set ? 'text-status-good' : 'text-ink-muted',
                      )}
                    >
                      <Icon name={variable.set ? 'check' : 'close'} size={11} />
                      {variable.set ? 'set' : 'empty'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
