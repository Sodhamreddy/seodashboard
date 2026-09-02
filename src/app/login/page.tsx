import { BrandMark } from '@/components/shell/BrandMark';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/primitives';
import { DEV_FALLBACK_PASSWORD, DEV_FALLBACK_USERNAME, authCredentials, authReadiness } from '@/lib/env';
import { NAV_ITEMS } from '@/lib/nav';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  const credentials = authCredentials();
  const readiness = authReadiness();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline bg-surface p-10 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(1000px 520px at 12% -8%, var(--accent-soft), transparent 62%), radial-gradient(700px 420px at 96% 108%, var(--tint-serious), transparent 60%)',
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <div>
              <p className="text-sm font-semibold leading-tight text-ink">SitePilot</p>
              <p className="text-2xs text-ink-muted">Premium client dashboard</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-semibold leading-tight text-ink">
            {NAV_ITEMS.length - 1} SEO and paid-media tools behind one login.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-secondary">
            On-page analysis runs against the live page. Backlinks, rank tracking and Google Ads sit
            behind swappable provider adapters, so wiring real credentials never touches the UI.
          </p>

          <ul className="mt-9 grid max-w-md gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {NAV_ITEMS.filter((item) => item.href !== '/dashboard').map((item) => (
              <li key={item.href} className="flex items-center gap-2 text-xs text-ink-secondary">
                <Icon name={item.icon} size={14} className="shrink-0 text-accent" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-2xs text-ink-muted">
          Sessions are signed HMAC cookies, httpOnly and expiring on a fixed window.
        </p>
      </section>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <section className="flex items-center justify-center bg-plane px-6 py-14">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={36} />
            <p className="text-sm font-semibold text-ink">SitePilot</p>
          </div>

          <h2 className="text-xl font-semibold text-ink">Sign in</h2>
          <p className="mt-1.5 text-xs text-ink-secondary">
            Single gated login. Credentials come from environment variables.
          </p>

          <div className="mt-7">
            <Suspense fallback={null}>
              {/* Never prefill in production — a prefilled username is a hint. */}
              <LoginForm defaultUsername={credentials.isDefault ? DEV_FALLBACK_USERNAME : ''} />
            </Suspense>
          </div>

          {/*
           * The development-defaults hint prints a working username and
           * password on screen, so it is strictly a local affordance. In
           * production `isDefault` is always false, so it cannot render — and
           * an unconfigured deploy gets the setup notice below instead.
           */}
          {credentials.isDefault && (
            <div className="mt-6">
              <Note tone="warning" icon="alert">
                Running on development defaults —{' '}
                <strong className="font-semibold">{DEV_FALLBACK_USERNAME}</strong> /{' '}
                <strong className="font-semibold">{DEV_FALLBACK_PASSWORD}</strong>. Set{' '}
                <code className="font-mono">DASHBOARD_USERNAME</code>,{' '}
                <code className="font-mono">DASHBOARD_PASSWORD</code> and{' '}
                <code className="font-mono">AUTH_SECRET</code> in <code className="font-mono">.env.local</code>{' '}
                before this is reachable by anyone else.
              </Note>
            </div>
          )}

          {!readiness.ready && readiness.isProduction && (
            <div className="mt-6">
              <Note tone="critical" icon="alert">
                <span className="font-semibold">Sign-in is not configured.</span> This deployment is
                missing {readiness.missing.join(', ')}. Set them in the hosting panel’s environment
                variables and restart the app. No one can sign in until then.
              </Note>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
