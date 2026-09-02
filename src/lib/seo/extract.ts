import * as cheerio from 'cheerio';
import type { FetchedPage } from '../fetch-page';

export type HeadingNode = { level: number; text: string };

export type JsonLdBlock = {
  index: number;
  raw: string;
  /** Flattened @graph-aware list of entities found in this block. */
  entities: Record<string, unknown>[];
  error?: string;
};

export type PageFacts = {
  url: string;
  origin: string;
  hostname: string;
  path: string;
  isHttps: boolean;
  status: number;
  redirected: boolean;
  sizeBytes: number;
  ttfbMs: number;
  headers: Record<string, string>;

  hasDoctype: boolean;
  lang: string;
  charset: string;
  viewport: string;

  title: string;
  metaDescription: string;
  metaKeywords: string;
  canonical: string;
  robotsMeta: string;
  googlebotMeta: string;
  favicon: string;
  hreflang: { hreflang: string; href: string }[];

  headings: HeadingNode[];
  h1: string[];
  h2Count: number;
  headingOrderJumps: number;

  wordCount: number;
  firstParagraph: string;
  textSample: string;

  images: {
    total: number;
    missingAlt: number;
    emptyAlt: number;
    lazyLoaded: number;
    modernFormat: number;
    withDimensions: number;
    samplesMissingAlt: string[];
  };

  links: {
    total: number;
    internal: number;
    external: number;
    nofollow: number;
    emptyAnchor: number;
  };

  og: Record<string, string>;
  twitter: Record<string, string>;

  jsonLd: JsonLdBlock[];
  schemaTypes: string[];
  microdataItems: number;

  scriptCount: number;
  stylesheetCount: number;
  inlineScriptBytes: number;
  hasNoscript: boolean;
};

function collapse(value: string | undefined | null) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function typesOf(entity: Record<string, unknown>): string[] {
  const raw = entity['@type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string');
  return [];
}

/** Walks @graph and nested arrays so `Article` inside a graph still counts. */
function flattenEntities(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenEntities(item, depth + 1));
  if (typeof value !== 'object') return [];

  const entity = value as Record<string, unknown>;
  const nested = '@graph' in entity ? flattenEntities(entity['@graph'], depth + 1) : [];
  return typesOf(entity).length > 0 ? [entity, ...nested] : nested;
}

export function extractPageFacts(page: FetchedPage): PageFacts {
  const $ = cheerio.load(page.html);
  const url = new URL(page.finalUrl);

  const metaValue = (selector: string) => collapse($(selector).first().attr('content'));

  // ── Open Graph / Twitter ────────────────────────────────────────────
  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  $('meta').each((_, element) => {
    const node = $(element);
    const property = (node.attr('property') || '').toLowerCase();
    const name = (node.attr('name') || '').toLowerCase();
    const content = collapse(node.attr('content'));
    if (!content) return;
    if (property.startsWith('og:')) og[property.slice(3)] = content;
    if (property.startsWith('twitter:')) twitter[property.slice(8)] = content;
    if (name.startsWith('twitter:')) twitter[name.slice(8)] = content;
    if (name.startsWith('og:')) og[name.slice(3)] = content;
  });

  // ── Headings ────────────────────────────────────────────────────────
  const headings: HeadingNode[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    const text = collapse($(element).text());
    if (!text) return;
    headings.push({ level: Number(element.tagName.slice(1)), text });
  });

  let headingOrderJumps = 0;
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level - headings[i - 1].level > 1) headingOrderJumps += 1;
  }

  // ── Images ──────────────────────────────────────────────────────────
  const images = {
    total: 0,
    missingAlt: 0,
    emptyAlt: 0,
    lazyLoaded: 0,
    modernFormat: 0,
    withDimensions: 0,
    samplesMissingAlt: [] as string[],
  };
  $('img').each((_, element) => {
    const node = $(element);
    const alt = node.attr('alt');
    const src = node.attr('src') || node.attr('data-src') || '';
    images.total += 1;
    if (alt === undefined) {
      images.missingAlt += 1;
      if (images.samplesMissingAlt.length < 8 && src) images.samplesMissingAlt.push(src);
    } else if (alt.trim() === '') {
      images.emptyAlt += 1;
    }
    if ((node.attr('loading') || '').toLowerCase() === 'lazy') images.lazyLoaded += 1;
    if (/\.(webp|avif)(\?|$)/i.test(src)) images.modernFormat += 1;
    if (node.attr('width') && node.attr('height')) images.withDimensions += 1;
  });
  $('source[type="image/webp"], source[type="image/avif"]').each(() => {
    images.modernFormat += 1;
  });

  // ── Links ───────────────────────────────────────────────────────────
  const links = { total: 0, internal: 0, external: 0, nofollow: 0, emptyAnchor: 0 };
  $('a[href]').each((_, element) => {
    const node = $(element);
    const href = (node.attr('href') || '').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) return;

    links.total += 1;
    if ((node.attr('rel') || '').toLowerCase().includes('nofollow')) links.nofollow += 1;
    if (!collapse(node.text()) && !node.find('img[alt]').length) links.emptyAnchor += 1;

    try {
      const resolved = new URL(href, url);
      if (resolved.hostname.replace(/^www\./, '') === url.hostname.replace(/^www\./, '')) {
        links.internal += 1;
      } else {
        links.external += 1;
      }
    } catch {
      links.internal += 1;
    }
  });

  // ── JSON-LD ─────────────────────────────────────────────────────────
  const jsonLd: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((index, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      jsonLd.push({ index, raw, entities: flattenEntities(JSON.parse(raw)) });
    } catch (error) {
      jsonLd.push({
        index,
        raw,
        entities: [],
        error: error instanceof Error ? error.message : 'Invalid JSON',
      });
    }
  });
  const schemaTypes = Array.from(
    new Set(jsonLd.flatMap((block) => block.entities.flatMap(typesOf))),
  ).sort();

  // ── Text ────────────────────────────────────────────────────────────
  const body = $('body').clone();
  body.find('script, style, noscript, template, svg').remove();
  const bodyText = collapse(body.text());
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;

  let firstParagraph = '';
  $('p').each((_, element) => {
    if (firstParagraph) return;
    const text = collapse($(element).text());
    if (text.length > 60) firstParagraph = text;
  });

  const hreflang: { hreflang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, element) => {
    hreflang.push({
      hreflang: collapse($(element).attr('hreflang')),
      href: collapse($(element).attr('href')),
    });
  });

  let inlineScriptBytes = 0;
  $('script:not([src])').each((_, element) => {
    inlineScriptBytes += $(element).text().length;
  });

  return {
    url: page.finalUrl,
    origin: url.origin,
    hostname: url.hostname,
    path: url.pathname,
    isHttps: url.protocol === 'https:',
    status: page.status,
    redirected: page.redirected,
    sizeBytes: page.sizeBytes,
    ttfbMs: page.ttfbMs,
    headers: page.headers,

    hasDoctype: /^\s*<!doctype\s+html/i.test(page.html),
    lang: collapse($('html').attr('lang')),
    charset:
      collapse($('meta[charset]').first().attr('charset')) ||
      (/charset=([\w-]+)/i.exec(page.contentType)?.[1] ?? ''),
    viewport: metaValue('meta[name="viewport"]'),

    title: collapse($('head title').first().text() || $('title').first().text()),
    metaDescription: metaValue('meta[name="description"]'),
    metaKeywords: metaValue('meta[name="keywords"]'),
    canonical: collapse($('link[rel="canonical"]').first().attr('href')),
    robotsMeta: metaValue('meta[name="robots"]').toLowerCase(),
    googlebotMeta: metaValue('meta[name="googlebot"]').toLowerCase(),
    favicon: collapse(
      $('link[rel~="icon"]').first().attr('href') ||
        $('link[rel="shortcut icon"]').first().attr('href'),
    ),
    hreflang,

    headings,
    h1: headings.filter((heading) => heading.level === 1).map((heading) => heading.text),
    h2Count: headings.filter((heading) => heading.level === 2).length,
    headingOrderJumps,

    wordCount,
    firstParagraph,
    textSample: bodyText.slice(0, 1200),

    images,
    links,
    og,
    twitter,
    jsonLd,
    schemaTypes,
    microdataItems: $('[itemscope]').length,

    scriptCount: $('script[src]').length,
    stylesheetCount: $('link[rel="stylesheet"]').length,
    inlineScriptBytes,
    hasNoscript: $('noscript').length > 0,
  };
}
