import type { PageFacts } from './extract';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** Relative importance inside its category. */
  weight: number;
  detail: string;
  fix?: string;
  /**
   * A concrete, paste-ready change for this check — built from the page's own
   * values, so it is a suggestion the user can apply rather than advice they
   * have to translate. Only present where a snippet is genuinely meaningful.
   */
  suggestion?: { label: string; code: string };
  category: CategoryKey;
};

export type CategoryKey = 'indexability' | 'meta' | 'content' | 'technical' | 'semantics';

export type CategoryScore = {
  key: CategoryKey;
  name: string;
  blurb: string;
  weight: number;
  score: number;
  counts: { pass: number; warn: number; fail: number };
  checks: Check[];
};

export type CrawlContext = {
  robotsTxt: { found: boolean; url: string; blocksEverything: boolean; sitemaps: string[] };
  sitemap: { found: boolean; url: string; urlCount: number };
};

export type Vitals = {
  source: string;
  strategy: 'mobile' | 'desktop';
  performance: number | null;
  seo: number | null;
  accessibility: number | null
  bestPractices: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
};

export type SeoScoreResult = {
  page: {
    url: string;
    hostname: string;
    status: number;
    title: string;
    sizeBytes: number;
    ttfbMs: number;
    wordCount: number;
    checkedAt: string;
  };
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  verdict: string;
  categories: CategoryScore[];
  priorityFixes: Check[];
  crawl: CrawlContext;
  vitals: Vitals | null;
  vitalsNote: string;
};

const CATEGORY_META: Record<CategoryKey, { name: string; blurb: string; weight: number }> = {
  indexability: {
    name: 'Indexability & crawl',
    blurb: 'Can Google reach, crawl and index this URL at all?',
    weight: 24,
  },
  meta: {
    name: 'Titles & meta',
    blurb: 'What the SERP snippet is built from.',
    weight: 24,
  },
  content: {
    name: 'Content & structure',
    blurb: 'Depth, heading hierarchy, internal linking, image accessibility.',
    weight: 22,
  },
  technical: {
    name: 'Technical & delivery',
    blurb: 'Payload, response time, transport, security headers.',
    weight: 15,
  },
  semantics: {
    name: 'Structured data & social',
    blurb: 'Rich-result eligibility and link-preview quality.',
    weight: 15,
  },
};

const STATUS_VALUE: Record<CheckStatus, number | null> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  info: null,
};

function grade(score: number): SeoScoreResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function verdictFor(score: number) {
  if (score >= 90) return 'Strong. Only refinements left — focus effort on content and links.';
  if (score >= 80) return 'Solid foundation with a handful of fixable gaps.';
  if (score >= 65) return 'Ranking is being held back by fixable on-page issues.';
  if (score >= 50) return 'Significant on-page problems — work the priority list top-down.';
  return 'Critical issues are blocking performance. Start with indexability.';
}

export function analyzeSeoScore(
  facts: PageFacts,
  crawl: CrawlContext,
  vitals: Vitals | null,
  vitalsNote: string,
): SeoScoreResult {
  const checks: Check[] = [];
  const add = (check: Omit<Check, 'category'> & { category: CategoryKey }) => checks.push(check);

  const xRobots = (facts.headers['x-robots-tag'] || '').toLowerCase();
  const isNoindex = /noindex/.test(facts.robotsMeta) || /noindex/.test(xRobots);

  // ── Indexability & crawl ────────────────────────────────────────────
  add({
    id: 'status',
    category: 'indexability',
    label: 'HTTP status',
    weight: 3,
    status: facts.status >= 200 && facts.status < 300 ? 'pass' : 'fail',
    detail: `Server returned ${facts.status}.`,
    fix: 'Only 2xx URLs get indexed — resolve the error or redirect chain.',
  });
  add({
    id: 'noindex',
    category: 'indexability',
    label: 'Indexable',
    weight: 3,
    status: isNoindex ? 'fail' : 'pass',
    detail: isNoindex
      ? `A noindex directive is present (${facts.robotsMeta || xRobots}).`
      : 'No noindex directive found in the meta robots tag or X-Robots-Tag header.',
    fix: 'Remove the noindex directive before expecting any ranking.',
  });
  add({
    id: 'https',
    category: 'indexability',
    label: 'HTTPS',
    weight: 3,
    status: facts.isHttps ? 'pass' : 'fail',
    detail: facts.isHttps ? 'Served over HTTPS.' : 'Served over plain HTTP.',
    fix: 'Install a certificate and 301 all HTTP traffic to HTTPS.',
  });
  add({
    id: 'canonical',
    category: 'indexability',
    label: 'Canonical tag',
    weight: 2,
    status: facts.canonical ? 'pass' : 'warn',
    detail: facts.canonical ? `Canonical points to ${facts.canonical}` : 'No canonical tag.',
    fix: 'Add a self-referencing <link rel="canonical"> to absorb duplicate URL variants.',
  });
  add({
    id: 'robots-txt',
    category: 'indexability',
    label: 'robots.txt',
    weight: 2,
    status: !crawl.robotsTxt.found ? 'warn' : crawl.robotsTxt.blocksEverything ? 'fail' : 'pass',
    detail: !crawl.robotsTxt.found
      ? 'No robots.txt found at the site root.'
      : crawl.robotsTxt.blocksEverything
        ? 'robots.txt disallows all crawling for every user-agent.'
        : 'robots.txt found and does not block crawling.',
    fix: 'Publish a robots.txt that allows crawling and declares your sitemap.',
  });
  add({
    id: 'sitemap',
    category: 'indexability',
    label: 'XML sitemap',
    weight: 2,
    status: crawl.sitemap.found ? 'pass' : 'fail',
    detail: crawl.sitemap.found
      ? `Sitemap reachable at ${crawl.sitemap.url} (${crawl.sitemap.urlCount} URLs).`
      : 'No XML sitemap found via robots.txt or /sitemap.xml.',
    fix: 'Publish an XML sitemap and reference it from robots.txt.',
  });
  add({
    id: 'redirect',
    category: 'indexability',
    label: 'Redirects',
    weight: 1,
    status: facts.redirected ? 'warn' : 'pass',
    detail: facts.redirected
      ? `The requested URL redirected to ${facts.url}.`
      : 'Resolved without a redirect.',
    fix: 'Link to the final URL directly so no link equity is spent on hops.',
  });

  // ── Titles & meta ───────────────────────────────────────────────────
  const titleLength = facts.title.length;
  add({
    id: 'title-present',
    category: 'meta',
    label: 'Title tag present',
    weight: 3,
    status: facts.title ? 'pass' : 'fail',
    detail: facts.title ? `"${facts.title}"` : 'No <title> element.',
    fix: 'Every page needs a unique, descriptive title tag.',
  });
  add({
    id: 'title-length',
    category: 'meta',
    label: 'Title length',
    weight: 2,
    status: !facts.title
      ? 'fail'
      : titleLength >= 30 && titleLength <= 60
        ? 'pass'
        : titleLength >= 20 && titleLength <= 70
          ? 'warn'
          : 'fail',
    detail: `${titleLength} characters.`,
    fix: 'Target 30–60 characters so the title is not truncated in the SERP.',
  });
  const descLength = facts.metaDescription.length;
  add({
    id: 'desc-present',
    category: 'meta',
    label: 'Meta description present',
    weight: 3,
    status: facts.metaDescription ? 'pass' : 'fail',
    detail: facts.metaDescription || 'No meta description.',
    fix: 'Write a 120–158 character description with the target query in it.',
  });
  add({
    id: 'desc-length',
    category: 'meta',
    label: 'Description length',
    weight: 2,
    status: !facts.metaDescription
      ? 'fail'
      : descLength >= 120 && descLength <= 158
        ? 'pass'
        : descLength >= 70 && descLength <= 180
          ? 'warn'
          : 'fail',
    detail: `${descLength} characters.`,
    fix: 'Target 120–158 characters.',
  });
  add({
    id: 'viewport',
    category: 'meta',
    label: 'Mobile viewport',
    weight: 2,
    status: facts.viewport ? 'pass' : 'fail',
    detail: facts.viewport || 'No viewport meta tag.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  });
  add({
    id: 'lang',
    category: 'meta',
    label: 'Language declared',
    weight: 1,
    status: facts.lang ? 'pass' : 'warn',
    detail: facts.lang ? `lang="${facts.lang}"` : 'No lang attribute on <html>.',
    fix: 'Declare the page language on the <html> element.',
  });
  add({
    id: 'charset',
    category: 'meta',
    label: 'Charset declared',
    weight: 1,
    status: facts.charset ? 'pass' : 'warn',
    detail: facts.charset ? `charset ${facts.charset}` : 'No charset declaration.',
    fix: 'Add <meta charset="utf-8"> as the first element in <head>.',
  });
  add({
    id: 'favicon',
    category: 'meta',
    label: 'Favicon',
    weight: 1,
    status: facts.favicon ? 'pass' : 'warn',
    detail: facts.favicon || 'No favicon link found.',
    fix: 'Favicons appear beside your result on mobile SERPs.',
  });

  // ── Content & structure ─────────────────────────────────────────────
  add({
    id: 'h1',
    category: 'content',
    label: 'Single H1',
    weight: 3,
    status: facts.h1.length === 1 ? 'pass' : facts.h1.length === 0 ? 'fail' : 'warn',
    detail:
      facts.h1.length === 0
        ? 'No H1 on the page.'
        : facts.h1.length === 1
          ? `"${facts.h1[0]}"`
          : `${facts.h1.length} H1 elements found.`,
    fix: 'Use exactly one H1 that states the page topic.',
  });
  add({
    id: 'word-count',
    category: 'content',
    label: 'Content depth',
    weight: 3,
    status: facts.wordCount >= 600 ? 'pass' : facts.wordCount >= 300 ? 'warn' : 'fail',
    detail: `${facts.wordCount} words of body copy.`,
    fix: 'Thin pages rarely rank — expand to cover the query and its follow-ups.',
  });
  add({
    id: 'heading-structure',
    category: 'content',
    label: 'Heading hierarchy',
    weight: 2,
    status: facts.headingOrderJumps === 0 && facts.h2Count > 0 ? 'pass' : 'warn',
    detail:
      facts.h2Count === 0
        ? 'No H2 subheadings — the page has no scannable structure.'
        : facts.headingOrderJumps > 0
          ? `${facts.headingOrderJumps} skipped heading level(s).`
          : `${facts.h2Count} H2 subheadings, no skipped levels.`,
    fix: 'Nest headings sequentially (H1 → H2 → H3) without skipping levels.',
  });
  const altCoverage =
    facts.images.total === 0
      ? 1
      : (facts.images.total - facts.images.missingAlt) / facts.images.total;
  add({
    id: 'image-alt',
    category: 'content',
    label: 'Image alt text',
    weight: 2,
    status: facts.images.total === 0 ? 'info' : altCoverage >= 0.95 ? 'pass' : altCoverage >= 0.7 ? 'warn' : 'fail',
    detail:
      facts.images.total === 0
        ? 'No images on the page.'
        : `${facts.images.missingAlt} of ${facts.images.total} images have no alt attribute.`,
    fix: 'Describe every meaningful image; decorative images take alt="".',
  });
  add({
    id: 'internal-links',
    category: 'content',
    label: 'Internal linking',
    weight: 2,
    status: facts.links.internal >= 5 ? 'pass' : facts.links.internal >= 2 ? 'warn' : 'fail',
    detail: `${facts.links.internal} internal links, ${facts.links.external} external.`,
    fix: 'Link to at least 3–5 related internal pages with descriptive anchors.',
  });
  add({
    id: 'anchor-quality',
    category: 'content',
    label: 'Anchor text quality',
    weight: 1,
    status: facts.links.emptyAnchor === 0 ? 'pass' : 'warn',
    detail:
      facts.links.emptyAnchor === 0
        ? 'All links have anchor text or a labelled image.'
        : `${facts.links.emptyAnchor} links have no readable anchor text.`,
    fix: 'Give every link visible text or an aria-label.',
  });

  // ── Technical & delivery ────────────────────────────────────────────
  add({
    id: 'doctype',
    category: 'technical',
    label: 'HTML5 doctype',
    weight: 1,
    status: facts.hasDoctype ? 'pass' : 'warn',
    detail: facts.hasDoctype ? 'Declared.' : 'Missing <!DOCTYPE html>.',
    fix: 'Without it browsers fall back to quirks mode.',
  });
  add({
    id: 'ttfb',
    category: 'technical',
    label: 'Server response time',
    weight: 2,
    status: facts.ttfbMs <= 800 ? 'pass' : facts.ttfbMs <= 1800 ? 'warn' : 'fail',
    detail: `${facts.ttfbMs} ms to first byte from this crawler.`,
    fix: 'Cache HTML at the edge or reduce server work; target under 800 ms.',
  });
  add({
    id: 'page-weight',
    category: 'technical',
    label: 'HTML payload',
    weight: 2,
    status: facts.sizeBytes <= 150_000 ? 'pass' : facts.sizeBytes <= 500_000 ? 'warn' : 'fail',
    detail: `${(facts.sizeBytes / 1024).toFixed(0)} KB of HTML, ${(facts.inlineScriptBytes / 1024).toFixed(0)} KB inline script.`,
    fix: 'Move inline scripts to cacheable files and trim server-rendered payload.',
  });
  add({
    id: 'compression',
    category: 'technical',
    label: 'Compression',
    weight: 1,
    status: facts.headers['content-encoding'] ? 'pass' : 'warn',
    detail: facts.headers['content-encoding']
      ? `Content-Encoding: ${facts.headers['content-encoding']}`
      : 'No Content-Encoding header — HTML appears uncompressed.',
    fix: 'Enable Brotli or gzip at the server or CDN.',
  });
  add({
    id: 'request-count',
    category: 'technical',
    label: 'Blocking resources',
    weight: 1,
    status:
      facts.scriptCount + facts.stylesheetCount <= 20
        ? 'pass'
        : facts.scriptCount + facts.stylesheetCount <= 40
          ? 'warn'
          : 'fail',
    detail: `${facts.scriptCount} external scripts, ${facts.stylesheetCount} stylesheets.`,
    fix: 'Bundle, defer, and drop unused third-party tags.',
  });
  add({
    id: 'security-headers',
    category: 'technical',
    label: 'Security headers',
    weight: 1,
    status: facts.headers['strict-transport-security']
      ? 'pass'
      : facts.isHttps
        ? 'warn'
        : 'fail',
    detail: facts.headers['strict-transport-security']
      ? 'HSTS enabled.'
      : 'No Strict-Transport-Security header.',
    fix: 'Add HSTS so browsers never downgrade to HTTP.',
  });
  if (facts.hreflang.length) {
    const invalid = facts.hreflang.filter(
      (entry) => !/^([a-z]{2,3}(-[A-Za-z]{2,4})?|x-default)$/i.test(entry.hreflang),
    );
    add({
      id: 'hreflang',
      category: 'technical',
      label: 'Hreflang syntax',
      weight: 1,
      status: invalid.length === 0 ? 'pass' : 'fail',
      detail:
        invalid.length === 0
          ? `${facts.hreflang.length} hreflang annotations, all well-formed.`
          : `Invalid codes: ${invalid.map((entry) => entry.hreflang).join(', ')}`,
      fix: 'Use ISO 639-1 language plus optional ISO 3166-1 region, or x-default.',
    });
  }

  // ── Structured data & social ────────────────────────────────────────
  const brokenJsonLd = facts.jsonLd.filter((block) => block.error);
  add({
    id: 'structured-data',
    category: 'semantics',
    label: 'Structured data present',
    weight: 3,
    status: facts.jsonLd.length > 0 ? 'pass' : facts.microdataItems > 0 ? 'warn' : 'fail',
    detail:
      facts.jsonLd.length > 0
        ? `${facts.jsonLd.length} JSON-LD block(s): ${facts.schemaTypes.join(', ') || 'untyped'}`
        : facts.microdataItems > 0
          ? `Only microdata found (${facts.microdataItems} itemscope elements).`
          : 'No structured data found.',
    fix: 'Add JSON-LD for the entity this page represents to become rich-result eligible.',
  });
  add({
    id: 'structured-data-valid',
    category: 'semantics',
    label: 'Structured data parses',
    weight: 2,
    status: facts.jsonLd.length === 0 ? 'info' : brokenJsonLd.length === 0 ? 'pass' : 'fail',
    detail:
      facts.jsonLd.length === 0
        ? 'Nothing to validate.'
        : brokenJsonLd.length === 0
          ? 'All JSON-LD blocks are valid JSON.'
          : `${brokenJsonLd.length} block(s) failed to parse: ${brokenJsonLd[0].error}`,
    fix: 'Invalid JSON-LD is ignored entirely by Google — fix the syntax.',
  });
  const ogComplete = ['title', 'description', 'image'].filter((key) => facts.og[key]);
  add({
    id: 'open-graph',
    category: 'semantics',
    label: 'Open Graph tags',
    weight: 3,
    status: ogComplete.length === 3 ? 'pass' : ogComplete.length > 0 ? 'warn' : 'fail',
    detail: `${ogComplete.length}/3 core og tags present (${ogComplete.join(', ') || 'none'}).`,
    fix: 'Set og:title, og:description and og:image for shareable previews.',
  });
  add({
    id: 'twitter-card',
    category: 'semantics',
    label: 'Twitter card',
    weight: 2,
    status: facts.twitter.card ? 'pass' : 'warn',
    detail: facts.twitter.card ? `twitter:card = ${facts.twitter.card}` : 'No twitter:card tag.',
    fix: 'Use summary_large_image for a full-width preview.',
  });

  // ── Roll up ─────────────────────────────────────────────────────────
  const categories: CategoryScore[] = (Object.keys(CATEGORY_META) as CategoryKey[]).map((key) => {
    const categoryChecks = checks.filter((check) => check.category === key);
    let earned = 0;
    let possible = 0;
    const counts = { pass: 0, warn: 0, fail: 0 };
    for (const check of categoryChecks) {
      const value = STATUS_VALUE[check.status];
      if (check.status !== 'info') counts[check.status] += 1;
      if (value === null) continue;
      earned += value * check.weight;
      possible += check.weight;
    }
    return {
      key,
      ...CATEGORY_META[key],
      score: possible === 0 ? 100 : Math.round((earned / possible) * 100),
      counts,
      checks: categoryChecks,
    };
  });

  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
  let score = Math.round(
    categories.reduce((sum, category) => sum + category.score * category.weight, 0) / totalWeight,
  );

  // Real field/lab performance nudges the score when we have it, capped at ±6.
  if (vitals?.performance !== null && vitals?.performance !== undefined) {
    score = Math.round(score * 0.94 + vitals.performance * 0.06);
  }
  score = Math.max(0, Math.min(100, score));

  // ── Paste-ready suggestions, derived from this page's own content ────
  const brandGuess = facts.hostname
    .replace(/^www\./, '')
    .split('.')[0]
    .replace(/[-_]+/g, ' ')
    .replace(/\w/g, (character) => character.toUpperCase());
  const subject = facts.h1[0] || facts.title || brandGuess;
  const canonicalUrl = facts.canonical || facts.url;

  const suggestions: Record<string, { label: string; code: string }> = {
    'title-present': {
      label: 'Add to <head>',
      code: `<title>${subject.slice(0, 55)} | ${brandGuess}</title>`,
    },
    'title-length': {
      label: 'Replace the <title>',
      code: `<title>${subject.slice(0, 55)} | ${brandGuess}</title>`,
    },
    'desc-present': {
      label: 'Add to <head>',
      code: `<meta name="description" content="${(facts.firstParagraph || subject).slice(0, 150)}" />`,
    },
    'desc-length': {
      label: 'Replace the description',
      code: `<meta name="description" content="${(facts.firstParagraph || subject).slice(0, 150)}" />`,
    },
    canonical: {
      label: 'Add to <head>',
      code: `<link rel="canonical" href="${canonicalUrl}" />`,
    },
    viewport: {
      label: 'Add to <head>',
      code: '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    },
    lang: { label: 'Set on the <html> element', code: '<html lang="en">' },
    charset: {
      label: 'First element inside <head>',
      code: '<meta charset="utf-8" />',
    },
    favicon: {
      label: 'Add to <head>',
      code: '<link rel="icon" href="/favicon.ico" sizes="any" />',
    },
    noindex: {
      label: 'Replace the robots tag',
      code: '<meta name="robots" content="index, follow, max-image-preview:large" />',
    },
    'open-graph': {
      label: 'Add to <head>',
      code: [
        `<meta property="og:title" content="${subject.slice(0, 60)}" />`,
        `<meta property="og:description" content="${(facts.firstParagraph || subject).slice(0, 150)}" />`,
        `<meta property="og:image" content="${facts.origin}/og-image.png" />`,
        `<meta property="og:url" content="${canonicalUrl}" />`,
      ].join('\n'),
    },
    'twitter-card': {
      label: 'Add to <head>',
      code: '<meta name="twitter:card" content="summary_large_image" />',
    },
    'structured-data': {
      label: 'Add to <head>',
      code: `<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brandGuess,
    url: facts.origin,
    logo: `${facts.origin}/logo.png`,
  },
  null,
  2,
)}
</script>`,
    },
    sitemap: {
      label: 'Add to robots.txt',
      code: `Sitemap: ${facts.origin}/sitemap.xml`,
    },
    'security-headers': {
      label: 'Send this response header',
      code: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    },
    compression: {
      label: 'Enable at the server or CDN',
      code: [
        '# nginx',
        'gzip on;',
        'gzip_types text/html text/css application/javascript application/json;',
      ].join('\n'),
    },
    'image-alt': {
      label: 'Pattern for every meaningful image',
      code: '<img src="/photo.jpg" alt="Describe what the image shows" width="800" height="600" />',
    },
    h1: {
      label: 'One per page',
      code: `<h1>${subject.slice(0, 70)}</h1>`,
    },
  };

  for (const check of checks) {
    if (check.status === 'pass' || check.status === 'info') continue;
    const suggestion = suggestions[check.id];
    if (suggestion) check.suggestion = suggestion;
  }

  const severity: Record<CheckStatus, number> = { fail: 0, warn: 1, info: 2, pass: 3 };
  const priorityFixes = checks
    .filter((check) => check.status === 'fail' || check.status === 'warn')
    .sort((a, b) => severity[a.status] - severity[b.status] || b.weight - a.weight)
    .slice(0, 8);

  return {
    page: {
      url: facts.url,
      hostname: facts.hostname,
      status: facts.status,
      title: facts.title,
      sizeBytes: facts.sizeBytes,
      ttfbMs: facts.ttfbMs,
      wordCount: facts.wordCount,
      checkedAt: new Date().toISOString(),
    },
    score,
    grade: grade(score),
    verdict: verdictFor(score),
    categories,
    priorityFixes,
    crawl,
    vitals,
    vitalsNote,
  };
}
