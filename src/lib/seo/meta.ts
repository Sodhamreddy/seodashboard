import type { PageFacts } from './extract';

export const TITLE_MIN = 30;
export const TITLE_MAX = 60;
export const DESC_MIN = 120;
export const DESC_MAX = 158;

export type FieldStatus = 'ok' | 'warn' | 'fail' | 'missing';

export type MetaField = {
  key: string;
  label: string;
  current: string;
  suggested: string;
  status: FieldStatus;
  note: string;
  /** Present for length-governed fields so the UI can draw a meter. */
  limits?: { min: number; max: number };
};

export type MetaTagResult = {
  page: {
    url: string;
    hostname: string;
    status: number;
    title: string;
    h1: string | null;
  };
  brand: string;
  primaryKeyword: string;
  fields: MetaField[];
  /** The values the snippets were rendered from — the editor's starting point. */
  snippet: MetaSnippetInput;
  headHtml: string;
  nextMetadata: string;
  preview: {
    serp: { title: string; breadcrumb: string; description: string };
    social: { title: string; description: string; image: string; domain: string };
  };
};

const SEPARATORS = /\s+[|–—·:]\s+/;

/** "Best Cakes in Austin | Sweet Co" → brand "Sweet Co". */
function deriveBrand(facts: PageFacts, override?: string) {
  if (override?.trim()) return override.trim();

  const fromOg = facts.og.site_name;
  if (fromOg) return fromOg;

  const label = facts.hostname.replace(/^www\./, '').split('.')[0];

  // Prefer the brand's real casing and punctuation as written in the title —
  // "nextjs.org" should yield "Next.js", not "Nextjs".
  const normalized = label.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const titleMatch = facts.title
    .split(/\s+/)
    .find((word) => word.replace(/[^a-z0-9]/gi, '').toLowerCase() === normalized);
  if (titleMatch) return titleMatch.replace(/[.,:;|–—]+$/, '');

  const parts = facts.title.split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last.length <= 30) return last;
  }

  return label.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Title minus its brand suffix — the part that actually describes the page. */
function titleCore(facts: PageFacts, brand: string) {
  const parts = facts.title.split(SEPARATORS).map((part) => part.trim()).filter(Boolean);
  const withoutBrand = parts.filter(
    (part) => part.toLowerCase() !== brand.toLowerCase(),
  );
  return (withoutBrand[0] || parts[0] || '').trim();
}

function clipToWord(value: string, max: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—–-]+$/, '');
}

function titleCase(value: string) {
  const minor = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or',
    'per', 'the', 'to', 'vs', 'via', 'with',
  ]);
  return value
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minor.has(lower)) return lower;
      if (/[A-Z].*[A-Z]/.test(word)) return word; // leave acronyms alone
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function buildTitle(facts: PageFacts, brand: string, keyword: string) {
  const core =
    keyword.trim() ||
    titleCore(facts, brand) ||
    facts.h1[0] ||
    facts.hostname.replace(/^www\./, '');

  let subject = titleCase(clipToWord(core, TITLE_MAX));

  // Fold a distinguishing H1 in when the subject alone is too thin to rank.
  if (subject.length < TITLE_MIN && facts.h1[0]) {
    const h1 = clipToWord(facts.h1[0], TITLE_MAX);
    if (!h1.toLowerCase().includes(subject.toLowerCase())) {
      const merged = `${subject}: ${h1}`;
      if (merged.length <= TITLE_MAX) subject = merged;
      else if (h1.length >= subject.length) subject = titleCase(h1);
    }
  }

  const suffix = ` | ${brand}`;
  const alreadyBranded = subject.toLowerCase().includes(brand.toLowerCase());
  if (!alreadyBranded && subject.length + suffix.length <= TITLE_MAX) return subject + suffix;
  return clipToWord(subject, TITLE_MAX);
}

function buildDescription(facts: PageFacts, brand: string, keyword: string) {
  const existing = facts.metaDescription.trim();
  const seed =
    (existing.length >= DESC_MIN ? existing : '') ||
    facts.firstParagraph ||
    existing ||
    facts.textSample ||
    `${facts.h1[0] || brand} — learn more.`;

  let description = seed.replace(/\s+/g, ' ').trim();

  // Lead with the target keyword when it is missing entirely.
  const trimmedKeyword = keyword.trim();
  if (trimmedKeyword && !description.toLowerCase().includes(trimmedKeyword.toLowerCase())) {
    const lead = trimmedKeyword.charAt(0).toUpperCase() + trimmedKeyword.slice(1);
    description = `${lead}: ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
  }

  // Clip one character short of the limit so the closing period always fits —
  // clipping *after* appending it would cut a word in half.
  description = clipToWord(description, DESC_MAX - 1);

  // Pad a too-short description with a soft CTA rather than leaving it thin.
  if (description.length < DESC_MIN) {
    const cta = ` Learn more about ${trimmedKeyword || facts.h1[0] || brand} at ${brand}.`;
    if (description.length + cta.length <= DESC_MAX) description = `${description}${cta}`;
  }

  if (!/[.!?]$/.test(description)) description = `${description}.`;
  return description;
}

function lengthStatus(value: string, min: number, max: number): FieldStatus {
  if (!value) return 'missing';
  if (value.length < min * 0.6 || value.length > max * 1.25) return 'fail';
  if (value.length < min || value.length > max) return 'warn';
  return 'ok';
}

/**
 * Absolute URL with a real host, or ''. Real pages ship broken values here —
 * `content="https:"` is a genuine example — and those must not be copied into
 * the generated tags.
 */
function usableUrl(value: string | undefined) {
  if (!value?.trim()) return '';
  try {
    const url = new URL(value.trim());
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    return isHttp && url.hostname.includes('.') ? value.trim() : '';
  } catch {
    return '';
  }
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Everything the emitted snippets need — no PageFacts, so this runs anywhere. */
export type MetaSnippetInput = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  brand: string;
  pageType: 'website' | 'article' | 'product';
  locale: string;
  robots: string;
  twitterHandle?: string;
};

export const DEFAULT_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

export function renderHeadHtml(input: MetaSnippetInput) {
  const handle = input.twitterHandle?.trim();
  return [
    '<!-- Primary meta -->',
    `<title>${escapeAttr(input.title)}</title>`,
    `<meta name="description" content="${escapeAttr(input.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(input.canonical)}" />`,
    `<meta name="robots" content="${escapeAttr(input.robots)}" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    '',
    '<!-- Open Graph -->',
    `<meta property="og:type" content="${escapeAttr(input.pageType)}" />`,
    `<meta property="og:site_name" content="${escapeAttr(input.brand)}" />`,
    `<meta property="og:title" content="${escapeAttr(input.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(input.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(input.canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(input.ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${escapeAttr(input.locale)}" />`,
    '',
    '<!-- Twitter / X -->',
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(input.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(input.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(input.ogImage)}" />`,
    ...(handle ? [`<meta name="twitter:site" content="${escapeAttr(handle)}" />`] : []),
  ].join('\n');
}

export function renderNextMetadata(input: MetaSnippetInput) {
  const handle = input.twitterHandle?.trim();
  return `import type { Metadata } from 'next';

export const metadata: Metadata = ${JSON.stringify(
    {
      title: input.title,
      description: input.description,
      alternates: { canonical: input.canonical },
      robots: {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
      },
      openGraph: {
        type: input.pageType,
        siteName: input.brand,
        title: input.title,
        description: input.description,
        url: input.canonical,
        locale: input.locale,
        images: [{ url: input.ogImage, width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        title: input.title,
        description: input.description,
        images: [input.ogImage],
        ...(handle ? { site: handle } : {}),
      },
    },
    null,
    2,
  )};
`;
}

export type MetaOptions = {
  primaryKeyword?: string;
  brandName?: string;
  ogImage?: string;
  pageType?: 'website' | 'article' | 'product';
  locale?: string;
  twitterHandle?: string;
};

export function generateMetaTags(facts: PageFacts, options: MetaOptions = {}): MetaTagResult {
  const brand = deriveBrand(facts, options.brandName);
  const keyword = options.primaryKeyword?.trim() || '';
  const locale = options.locale?.trim() || 'en_US';
  const pageType = options.pageType || 'website';

  const title = buildTitle(facts, brand, keyword);
  const description = buildDescription(facts, brand, keyword);
  const canonical = facts.canonical || facts.url;
  const existingOgImage = usableUrl(facts.og.image);
  const ogImage =
    usableUrl(options.ogImage) ||
    existingOgImage ||
    usableUrl(facts.twitter.image) ||
    `${facts.origin}/og-image.png`;

  const robots = DEFAULT_ROBOTS;

  const fields: MetaField[] = [
    {
      key: 'title',
      label: 'Title tag',
      current: facts.title,
      suggested: title,
      status: lengthStatus(facts.title, TITLE_MIN, TITLE_MAX),
      limits: { min: TITLE_MIN, max: TITLE_MAX },
      note: facts.title
        ? `Currently ${facts.title.length} characters. Google truncates around ${TITLE_MAX}.`
        : 'No title tag found — this is the single highest-impact fix on the page.',
    },
    {
      key: 'description',
      label: 'Meta description',
      current: facts.metaDescription,
      suggested: description,
      status: lengthStatus(facts.metaDescription, DESC_MIN, DESC_MAX),
      limits: { min: DESC_MIN, max: DESC_MAX },
      note: facts.metaDescription
        ? `Currently ${facts.metaDescription.length} characters. Aim for ${DESC_MIN}–${DESC_MAX}.`
        : 'No description found — Google will invent one from body copy.',
    },
    {
      key: 'canonical',
      label: 'Canonical URL',
      current: facts.canonical,
      suggested: canonical,
      status: facts.canonical ? 'ok' : 'missing',
      note: facts.canonical
        ? 'Self-referencing canonical present.'
        : 'Add a self-referencing canonical to consolidate duplicate URLs.',
    },
    {
      key: 'robots',
      label: 'Robots',
      current: facts.robotsMeta,
      suggested: robots,
      status: /noindex/.test(facts.robotsMeta)
        ? 'fail'
        : facts.robotsMeta
          ? 'ok'
          : 'warn',
      note: /noindex/.test(facts.robotsMeta)
        ? 'This page is set to noindex — it cannot rank until that is removed.'
        : 'Explicit rich-result directives let Google use large image previews.',
    },
    {
      key: 'og:title',
      label: 'og:title',
      current: facts.og.title || '',
      suggested: title,
      status: facts.og.title ? 'ok' : 'missing',
      note: 'Used by Facebook, LinkedIn, Slack and WhatsApp link previews.',
    },
    {
      key: 'og:description',
      label: 'og:description',
      current: facts.og.description || '',
      suggested: description,
      status: facts.og.description ? 'ok' : 'missing',
      note: 'Falls back to meta description when absent, but set it explicitly.',
    },
    {
      key: 'og:image',
      label: 'og:image',
      current: facts.og.image || '',
      suggested: ogImage,
      status: existingOgImage ? 'ok' : facts.og.image ? 'fail' : 'missing',
      note: existingOgImage
        ? '1200×630 PNG or JPG, under 5 MB, absolute URL.'
        : facts.og.image
          ? `Present but not a usable absolute URL ("${facts.og.image}") — link previews will fall back to nothing.`
          : '1200×630 PNG or JPG, under 5 MB, absolute URL.',
    },
    {
      key: 'twitter:card',
      label: 'twitter:card',
      current: facts.twitter.card || '',
      suggested: 'summary_large_image',
      status: facts.twitter.card ? 'ok' : 'missing',
      note: 'summary_large_image gives the full-width preview on X.',
    },
    {
      key: 'viewport',
      label: 'Viewport',
      current: facts.viewport,
      suggested: 'width=device-width, initial-scale=1',
      status: facts.viewport ? 'ok' : 'fail',
      note: facts.viewport
        ? 'Responsive viewport declared.'
        : 'Without a viewport tag the page fails mobile-friendliness.',
    },
  ];

  const snippetInput: MetaSnippetInput = {
    title,
    description,
    canonical,
    ogImage,
    brand,
    pageType,
    locale,
    robots,
    twitterHandle: options.twitterHandle?.trim() ?? '',
  };
  const headHtml = renderHeadHtml(snippetInput);
  const nextMetadata = renderNextMetadata(snippetInput);

  let breadcrumb = facts.hostname;
  try {
    const segments = new URL(canonical).pathname.split('/').filter(Boolean);
    if (segments.length) breadcrumb = `${facts.hostname} › ${segments.join(' › ')}`;
  } catch {
    /* keep hostname */
  }

  return {
    page: {
      url: facts.url,
      hostname: facts.hostname,
      status: facts.status,
      title: facts.title,
      h1: facts.h1[0] ?? null,
    },
    brand,
    primaryKeyword: keyword,
    fields,
    snippet: snippetInput,
    headHtml,
    nextMetadata,
    preview: {
      serp: { title, breadcrumb, description },
      social: { title, description, image: ogImage, domain: facts.hostname },
    },
  };
}
