import type { IconName } from '@/components/ui/Icon';

export type DataMode = 'real' | 'partial' | 'seed';

/** Decorative per-tool identity colour for icon tiles — never a data encoding. */
export type ToolTone = 'blue' | 'violet' | 'aqua' | 'orange' | 'yellow' | 'rose';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  group: string;
  blurb: string;
  tone: ToolTone;
  /** Optional pill shown beside the label in the sidebar. */
  badge?: string;
  /**
   * How much of this screen runs on live data today:
   * real    — fetches and analyses the actual page/site
   * partial — real analysis, one external write behind a token
   * seed    — realistic seeded data behind a swappable provider adapter
   */
  mode: DataMode;
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    tone: 'violet',
    label: 'Overview',
    icon: 'home',
    group: 'Overview',
    blurb: 'Every signal for the active domain on one screen.',
    mode: 'partial',
  },
  {
    href: '/builder',
    tone: 'rose',
    label: 'Report Builder',
    badge: 'New',
    icon: 'grid',
    group: 'Reporting',
    blurb: 'Drag-and-drop client dashboards from any metric in the catalog.',
    mode: 'partial',
  },
  {
    href: '/seo-score',
    tone: 'violet',
    label: 'SEO Score Checker',
    icon: 'gauge',
    group: 'On-page tools',
    blurb: 'Score any URL across 30 weighted checks with a prioritised fix list.',
    mode: 'real',
  },
  {
    href: '/meta-tags',
    tone: 'blue',
    label: 'Meta Tag Generator',
    icon: 'tag',
    group: 'On-page tools',
    blurb: 'Generate titles, descriptions and Open Graph tags from the live page.',
    mode: 'real',
  },
  {
    href: '/schema',
    tone: 'aqua',
    label: 'Schema Markup Generator',
    icon: 'code',
    group: 'On-page tools',
    blurb: 'Detect existing JSON-LD and generate validated missing markup.',
    mode: 'real',
  },
  {
    href: '/sitemap',
    tone: 'orange',
    label: 'XML Sitemap Automation',
    icon: 'sitemap',
    group: 'On-page tools',
    blurb: 'Diff the sitemap against the last snapshot, regenerate, submit to GSC.',
    mode: 'partial',
  },
  {
    href: '/robots',
    tone: 'yellow',
    label: 'robots.txt',
    icon: 'shield',
    group: 'On-page tools',
    blurb: 'Validate crawl rules the way Google parses them, and generate a correct file.',
    mode: 'real',
  },
  {
    href: '/broken-links',
    tone: 'rose',
    label: 'Broken Link Checker',
    icon: 'link',
    group: 'On-page tools',
    blurb: 'Probe every link on a page and separate real 404s from bot-blocks and timeouts.',
    mode: 'real',
  },
  {
    href: '/llms',
    tone: 'rose',
    label: 'llms.txt',
    icon: 'doc',
    group: 'On-page tools',
    blurb: 'Validate or generate the AI-facing content map from your sitemap.',
    mode: 'real',
  },
  {
    href: '/backlinks',
    tone: 'blue',
    label: 'Backlink Tracker',
    icon: 'link',
    group: 'Off-page',
    blurb: 'Referring domains, authority and spam risk from the live link index.',
    // Live via Crawly when a key is set and the domain is indexed; seeded
    // fallback otherwise. The in-page banner states which applied.
    mode: 'partial',
  },
  {
    // Live from Search Console when the domain maps to a verified property;
    // seeded fallback otherwise. The in-page banner states which one applied.
    href: '/keywords',
    tone: 'aqua',
    label: 'Keyword Monitoring',
    icon: 'search',
    group: 'Off-page',
    blurb: 'Position tracking, visibility trend and biggest movers.',
    mode: 'partial',
  },
  {
    href: '/traffic',
    tone: 'blue',
    label: 'Website Traffic',
    icon: 'bars',
    group: 'Analytics',
    blurb: 'Sessions, users, channel mix and landing pages from Google Analytics 4.',
    // Live once the Google connection carries the analytics.readonly scope and
    // a GA4 property resolves for the domain. Unlike the other provider pages
    // there is no seeded fallback — see src/lib/providers/traffic.ts.
    mode: 'partial',
  },
  {
    href: '/gmb-reviews',
    tone: 'orange',
    label: 'GMB Reviews Automation',
    icon: 'sparkles',
    group: 'Analytics',
    blurb: 'Monitor Google Business Profile reviews and draft replies by rating.',
    // Gated on Google approving Business Profile API access for the project,
    // which is an application, not a config flag. The page explains the steps.
    mode: 'partial',
  },
  {
    href: '/google-ads',
    tone: 'yellow',
    label: 'Google Ads Performance',
    icon: 'bars',
    group: 'Paid media',
    blurb: 'Campaign performance, CTR, conversions and ROAS in one view.',
    // Live once ADS_PROVIDER=google plus credentials (or a connected Google
    // account) are in place; falls back to seed otherwise. The in-page banner
    // reports which one actually happened for this request.
    mode: 'partial',
  },
  {
    href: '/budget-alerts',
    tone: 'rose',
    label: 'Budget Alert System',
    icon: 'bell',
    group: 'Paid media',
    blurb: 'Threshold rules, pacing projections and alert delivery.',
    // Same gate as Google Ads Performance — this reads the same report.
    mode: 'partial',
  },
];

export const NAV_GROUPS = [
  'Overview',
  'Reporting',
  'On-page tools',
  'Off-page',
  'Analytics',
  'Paid media',
] as const;

export function navItemFor(pathname: string) {
  return (
    NAV_ITEMS.find((item) => item.href === pathname) ??
    NAV_ITEMS.find((item) => pathname.startsWith(`${item.href}/`)) ??
    null
  );
}

export const MODE_LABEL: Record<DataMode, string> = {
  real: 'Live analysis',
  partial: 'Live + token gated',
  seed: 'Seeded data',
};
