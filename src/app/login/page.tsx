import { BrandMark } from '@/components/shell/BrandMark';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Note } from '@/components/ui/primitives';
import { authReadiness } from '@/lib/env';
import { NAV_ITEMS } from '@/lib/nav';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  const readiness = authReadiness();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/*
       * Brand panel.
       *
       * Deliberately a saturated brand surface rather than the faint tinted
       * white it replaced: this is the one screen with no data on it, so it is
       * the only place the product gets to introduce itself. White on the
       * navy end of the Kleza gradient clears AA comfortably.
       */}
      <section className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(150deg, #08366b 0%, #0d4b8c 46%, #1d6fc2 100%)',
          }}
          aria-hidden="true"
        />
        {/* Two soft highlights so the flat gradient has some depth. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(720px 420px at 88% -6%, rgba(46,163,242,0.45), transparent 62%), radial-gradient(560px 380px at 4% 104%, rgba(126,190,197,0.28), transparent 60%)',
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <BrandMark size={28} rounded={false} className="drop-shadow" />
            </span>
            <div>
              <p className="text-base font-semibold leading-tight">SitePilot</p>
              <p className="text-2xs text-white/70">Client SEO &amp; paid-media reporting</p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg text-[2.1rem] font-semibold leading-[1.15] tracking-[-0.02em]">
            {NAV_ITEMS.length - 1} SEO and paid-media tools
            <span className="block text-white/70">behind one login.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
            On-page analysis runs against the live page. Traffic, rankings, backlinks and paid media
            come from the connected Google accounts, scoped per client.
          </p>

          <ul className="mt-10 grid max-w-lg gap-x-7 gap-y-3 sm:grid-cols-2">
            {NAV_ITEMS.filter((item) => item.href !== '/dashboard').map((item) => (
              <li key={item.href} className="flex items-center gap-2.5 text-xs text-white/85">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white/12">
                  <Icon name={item.icon} size={13} />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="shield" size={12} />
            Signed HMAC session cookies
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={12} />
            Fixed-window expiry
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="check" size={12} />
            httpOnly, never readable by scripts
          </span>
        </div>
      </section>

      {/* ── Form panel ──────────────────────────────────────────────── */}
      <section className="flex items-center justify-center bg-plane px-5 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          {/* Mobile gets its own brand block, since the panel beside it is
              hidden below lg and the page would otherwise open on a bare form. */}
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <BrandMark size={40} />
              <div>
                <p className="text-base font-semibold leading-tight text-ink">SitePilot</p>
                <p className="text-2xs text-ink-muted">
                  {NAV_ITEMS.length - 1} SEO and paid-media tools
                </p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Sign in</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
            One login covers every client on the roster.
          </p>

          <div className="mt-7">
            <Suspense fallback={null}>
              {/* Never prefilled. A prefilled username is half a credential. */}
              <LoginForm defaultUsername="" />
            </Suspense>
          </div>

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
