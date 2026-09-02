import { fetchText, normalizeUrl } from '../fetch-page';

/**
 * robots.txt fetch, parse, validate and generate.
 *
 * Parsing follows the REP as Google implements it: directives are grouped by
 * consecutive `User-agent` lines, matching is case-sensitive on the path, and
 * for Allow/Disallow conflicts the *longest* matching rule wins.
 */

export type RobotsRule = { directive: 'allow' | 'disallow'; path: string };

export type RobotsGroup = {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
};

export type RobotsIssue = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  fix?: string;
};

export type RobotsAudit = {
  domain: string;
  origin: string;
  url: string;
  found: boolean;
  status: number;
  raw: string;
  sizeBytes: number;
  lineCount: number;
  groups: RobotsGroup[];
  sitemaps: string[];
  /** User-agents given an explicit group, for the "who is addressed" summary. */
  addressedAgents: string[];
  blocksEverything: boolean;
  aiCrawlers: { agent: string; label: string; blocked: boolean }[];
  issues: RobotsIssue[];
  generated: string;
};

/**
 * Known AI/LLM crawler user-agents.
 *
 * `Google-Extended` is the odd one out: it does not crawl at all, it is a
 * training/grounding opt-out token for Gemini. Blocking it does NOT affect
 * Google Search crawling, which is a distinction people get wrong constantly.
 */
export const AI_CRAWLERS: { agent: string; label: string }[] = [
  { agent: 'GPTBot', label: 'OpenAI — model training' },
  { agent: 'OAI-SearchBot', label: 'OpenAI — ChatGPT search index' },
  { agent: 'ChatGPT-User', label: 'OpenAI — user-initiated browsing' },
  { agent: 'ClaudeBot', label: 'Anthropic — crawler' },
  { agent: 'Claude-User', label: 'Anthropic — user-initiated fetch' },
  { agent: 'Claude-SearchBot', label: 'Anthropic — search indexing' },
  { agent: 'Claude-Web', label: 'Anthropic — legacy token, still seen in the wild' },
  { agent: 'anthropic-ai', label: 'Anthropic — legacy token, still seen in the wild' },
  { agent: 'PerplexityBot', label: 'Perplexity — search index' },
  { agent: 'Perplexity-User', label: 'Perplexity — user-initiated fetch' },
  { agent: 'Google-Extended', label: 'Google — Gemini training opt-out (not Search)' },
  { agent: 'Applebot-Extended', label: 'Apple — training opt-out' },
  { agent: 'meta-externalagent', label: 'Meta — crawler' },
  { agent: 'CCBot', label: 'Common Crawl — feeds many models' },
  { agent: 'Bytespider', label: 'ByteDance — crawler' },
  { agent: 'Amazonbot', label: 'Amazon — crawler' },
];

/** Google stops parsing after 500 KiB. */
const MAX_PARSED_BYTES = 500 * 1024;

export function parseRobots(raw: string) {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive User-agent lines share one rule block; a rule line closes it.
  let expectingMoreAgents = false;

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.split('#')[0].trim();
    if (!withoutComment) continue;

    const separator = withoutComment.indexOf(':');
    if (separator === -1) continue;

    const field = withoutComment.slice(0, separator).trim().toLowerCase();
    const value = withoutComment.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !expectingMoreAgents) {
        current = { userAgents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.userAgents.push(value);
      expectingMoreAgents = true;
      continue;
    }

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }

    if (!current) {
      // Rules before any User-agent line are orphaned; keep them visible.
      current = { userAgents: ['(none declared)'], rules: [], crawlDelay: null };
      groups.push(current);
    }
    expectingMoreAgents = false;

    if (field === 'allow' || field === 'disallow') {
      current.rules.push({ directive: field, path: value });
    } else if (field === 'crawl-delay') {
      const parsed = Number(value);
      current.crawlDelay = Number.isFinite(parsed) ? parsed : null;
    }
  }

  return { groups, sitemaps };
}

function groupFor(groups: RobotsGroup[], agent: string) {
  const target = agent.toLowerCase();
  return (
    groups.find((group) => group.userAgents.some((ua) => ua.toLowerCase() === target)) ?? null
  );
}

/** True when the group's rules block the site root for everything. */
function blocksAll(group: RobotsGroup | null) {
  if (!group) return false;
  const disallowRoot = group.rules.some(
    (rule) => rule.directive === 'disallow' && rule.path === '/',
  );
  if (!disallowRoot) return false;
  // An Allow that is longer than "/" carves an exception out of the block.
  return !group.rules.some((rule) => rule.directive === 'allow' && rule.path.length > 1);
}

export type RobotsPreset = 'standard' | 'block-ai' | 'wordpress' | 'staging';

export function generateRobots(
  origin: string,
  preset: RobotsPreset,
  sitemaps: string[],
): string {
  const sitemapLines = (sitemaps.length ? sitemaps : [`${origin}/sitemap.xml`]).map(
    (url) => `Sitemap: ${url}`,
  );

  if (preset === 'staging') {
    return [
      '# Staging / pre-production — block all crawling.',
      '# Remove this file (or replace it) before going live.',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  const lines: string[] = ['User-agent: *', 'Allow: /'];

  if (preset === 'wordpress') {
    lines.push(
      'Disallow: /wp-admin/',
      '# admin-ajax.php is used by the front end, so it stays crawlable.',
      'Allow: /wp-admin/admin-ajax.php',
      'Disallow: /?s=',
      'Disallow: /search/',
    );
  }

  if (preset === 'block-ai') {
    lines.push('', '# Opt out of AI training and AI answer engines.');
    for (const crawler of AI_CRAWLERS) {
      lines.push('', `# ${crawler.label}`, `User-agent: ${crawler.agent}`, 'Disallow: /');
    }
  }

  return [...lines, '', ...sitemapLines, ''].join('\n');
}

export async function runRobotsAudit(
  domainInput: string,
  preset: RobotsPreset = 'standard',
): Promise<RobotsAudit> {
  const url = normalizeUrl(domainInput);
  const origin = url.origin;
  const robotsUrl = `${origin}/robots.txt`;

  const response = await fetchText(robotsUrl);
  const raw = response.text ?? '';
  const sizeBytes = new TextEncoder().encode(raw).length;
  const { groups, sitemaps } = parseRobots(raw);

  const wildcard = groupFor(groups, '*');
  const blocksEverything = blocksAll(wildcard);
  const issues: RobotsIssue[] = [];

  // ── Reachability ────────────────────────────────────────────────────
  if (!response.ok) {
    issues.push({
      severity: 'warning',
      title: 'No robots.txt found',
      detail: `${robotsUrl} returned ${response.status || 'no response'}. Crawlers treat a 404 as "crawl everything", which is usually fine — but you also lose the Sitemap directive.`,
      fix: 'Publish the generated file at your site root.',
    });
  }

  if (response.ok && !raw.trim()) {
    issues.push({
      severity: 'warning',
      title: 'robots.txt is empty',
      detail: 'An empty file behaves like "allow everything" but declares no sitemap.',
    });
  }

  // ── The catastrophic one ────────────────────────────────────────────
  if (blocksEverything) {
    issues.push({
      severity: 'critical',
      title: 'All crawling is blocked',
      detail:
        'The User-agent: * group contains Disallow: / with no narrower Allow. No search engine will crawl this site.',
      fix: 'Remove Disallow: / unless this host is intentionally private.',
    });
  }

  // ── Sitemap ─────────────────────────────────────────────────────────
  if (response.ok && sitemaps.length === 0) {
    issues.push({
      severity: 'warning',
      title: 'No Sitemap directive',
      detail:
        'robots.txt is the one place every crawler checks for your sitemap. Without it, discovery relies on guessing /sitemap.xml.',
      fix: `Add: Sitemap: ${origin}/sitemap.xml`,
    });
  }
  for (const sitemap of sitemaps) {
    if (!/^https?:\/\//i.test(sitemap)) {
      issues.push({
        severity: 'warning',
        title: 'Sitemap URL is not absolute',
        detail: `"${sitemap}" is relative. The Sitemap directive requires a full absolute URL.`,
        fix: `Use ${origin}${sitemap.startsWith('/') ? '' : '/'}${sitemap}`,
      });
    }
  }

  // ── Directives Google ignores ───────────────────────────────────────
  if (/^\s*noindex\s*:/im.test(raw)) {
    issues.push({
      severity: 'critical',
      title: 'noindex in robots.txt does nothing',
      detail:
        'Google stopped supporting the unofficial noindex directive in robots.txt in September 2019. Pages relying on it are still indexable.',
      fix: 'Use a <meta name="robots" content="noindex"> tag or an X-Robots-Tag header on the page instead.',
    });
  }
  const wildcardDelay = wildcard?.crawlDelay;
  if (wildcardDelay !== null && wildcardDelay !== undefined) {
    issues.push({
      severity: 'info',
      title: 'Crawl-delay is ignored by Google',
      detail: `Crawl-delay: ${wildcardDelay} is honoured by Bing and Yandex but not by Google, which sets its own crawl rate.`,
    });
  }

  // ── Render-blocking ─────────────────────────────────────────────────
  const wildcardRules = wildcard?.rules ?? [];
  const disallowed = wildcardRules.filter((rule) => rule.directive === 'disallow');

  /*
   * Two tiers, deliberately. Blocking a whole build-output or asset directory
   * genuinely breaks rendering. Blocking /wp-includes/ is a WordPress default
   * shipped for two decades: some core scripts (jQuery) live there, but every
   * front-end theme and plugin asset is under /wp-content, which stays
   * crawlable. Flagging the latter as "critical" would train people to ignore
   * this panel, so it is a warning with accurate wording.
   */
  /*
   * Precision matters here. A naive /\.js/ test matches the ".js" inside
   * ".json" (real example: nytimes.com blocks /athletic/pv.json), and blocking
   * one named stylesheet is not the same as blocking all CSS. So:
   *
   *   critical — a whole asset directory, or a wildcard extension block
   *   info     — a single named .css/.js file, which does not break rendering
   */
  const ASSET_DIRECTORY = /\/(assets|static|_next|dist|build)(\/|$)/i;
  const WILDCARD_ASSET = /\*[^/]*\.(css|js)\$?$/i;
  const SINGLE_ASSET_FILE = /\.(css|js)\$?$/i;

  const breaksRendering = disallowed.filter(
    (rule) => ASSET_DIRECTORY.test(rule.path) || WILDCARD_ASSET.test(rule.path),
  );
  const singleFiles = disallowed.filter(
    (rule) => !breaksRendering.includes(rule) && SINGLE_ASSET_FILE.test(rule.path),
  );
  const wpIncludes = disallowed.filter((rule) => /\/wp-includes/i.test(rule.path));

  if (breaksRendering.length > 0) {
    issues.push({
      severity: 'critical',
      title: 'CSS or JavaScript is blocked',
      detail: `Blocked: ${breaksRendering.map((rule) => rule.path).join(', ')}. Google renders pages before ranking them, so blocking a stylesheet or script directory makes your page look broken to the crawler.`,
      fix: 'Allow these paths — there is no SEO benefit to hiding assets.',
    });
  }

  if (singleFiles.length > 0) {
    issues.push({
      severity: 'info',
      title: 'Individual asset files blocked',
      detail: `${singleFiles.map((rule) => rule.path).join(', ')} — single named files, not whole directories. Usually deliberate (a no-JS fallback stylesheet, a tracking payload) and harmless to rendering.`,
    });
  }

  if (wpIncludes.length > 0) {
    issues.push({
      severity: 'warning',
      title: 'WordPress core directory blocked',
      detail:
        'Disallow: /wp-includes/ is a long-standing WordPress default. Some core scripts such as jQuery live there, though theme and plugin assets under /wp-content stay crawlable, so rendering usually still works.',
      fix: 'Safe to remove. Modern guidance is to let Google fetch every asset it needs to render the page.',
    });
  }

  // ── Size and syntax ─────────────────────────────────────────────────
  if (sizeBytes > MAX_PARSED_BYTES) {
    issues.push({
      severity: 'warning',
      title: 'robots.txt exceeds 500 KiB',
      detail: `The file is ${(sizeBytes / 1024).toFixed(0)} KiB. Google parses only the first 500 KiB; anything after that is ignored.`,
    });
  }
  if (groups.some((group) => group.userAgents.includes('(none declared)'))) {
    issues.push({
      severity: 'warning',
      title: 'Rules before any User-agent line',
      detail:
        'Allow/Disallow lines that appear before the first User-agent are not part of any group and are ignored.',
      fix: 'Move them under an explicit User-agent line.',
    });
  }
  if (response.ok && raw.trim() && groups.length === 0) {
    issues.push({
      severity: 'info',
      title: 'No crawl rules declared',
      detail:
        'The file contains no User-agent groups, so nothing is restricted — every crawler may fetch everything. That is valid and often intentional.',
    });
  }
  if (response.ok && groups.length > 0 && !wildcard) {
    issues.push({
      severity: 'info',
      title: 'No User-agent: * group',
      detail:
        'Only named crawlers have rules. Any crawler not named here has no restrictions, which may be intentional.',
    });
  }

  if (issues.length === 0 && response.ok) {
    issues.push({
      severity: 'info',
      title: 'No problems found',
      detail: 'The file parses cleanly, declares a sitemap, and does not block crawling or assets.',
    });
  }

  return {
    domain: url.hostname.replace(/^www\./, ''),
    origin,
    url: robotsUrl,
    found: response.ok,
    status: response.status,
    raw,
    sizeBytes,
    lineCount: raw ? raw.split(/\r?\n/).length : 0,
    groups,
    sitemaps,
    addressedAgents: Array.from(new Set(groups.flatMap((group) => group.userAgents))),
    blocksEverything,
    aiCrawlers: AI_CRAWLERS.map((crawler) => ({
      ...crawler,
      blocked: blocksAll(groupFor(groups, crawler.agent)),
    })),
    issues,
    generated: generateRobots(origin, preset, sitemaps),
  };
}
