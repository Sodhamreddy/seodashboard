import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SitePilot',
    template: '%s · SitePilot',
  },
  description:
    'Premium SEO and paid-media control room: on-page analysis, schema, sitemaps, backlinks, rank tracking, Google Ads performance and budget alerts.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f9' },
    { media: '(prefers-color-scheme: dark)', color: '#070a13' },
  ],
};

/**
 * Applies the stored theme before first paint so there is no flash.
 *
 * Light is the default. Stored values are 'light' | 'dark' | 'system'; only
 * 'system' consults the OS preference, so an explicit choice is never
 * overridden by the machine's setting.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('seodash-theme');
    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (error) {
    document.documentElement.classList.remove('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
