import { fetchPage, fetchText, normalizeUrl } from '../fetch-page';
import { extractPageFacts } from './extract';
import { runSitemapAudit } from './sitemap';

/**
 * llms.txt — fetch, validate and generate.
 *
 * IMPORTANT CONTEXT: llms.txt is a community proposal (llmstxt.org), not a
 * standard the major AI crawlers have committed to honouring the way they
 * honour robots.txt. It costs nothing to publish and some tools do read it,
 * but it should be presented as forward-looking, not as a ranking factor.
 *
 * The format is plain markdown with a fixed shape:
 *   # Site name                  (required, exactly one H1)
 *   > One-line summary           (optional blockquote)
 *   Free prose                   (optional)
 *   ## Section                   (repeatable)
 *   - [Title](url): note         (link list under each section)
 *   ## Optional                  (a section named "Optional" may be skipped
 *                                 by consumers with a limited context budget)
 */

export type LlmsSection = { heading: string; links: { title: string; url: string; note: string }[] };

export type LlmsIssue = {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  fix?: string;
};

export type LlmsAudit = {
  domain: string;
  origin: string;
  url: string;
  fullUrl: string;
  found: boolean;
  status: number;
  raw: string;
  /** /llms-full.txt is the companion convention holding expanded content. */
  fullFound: boolean;
  parsed: {
    title: string;
    summary: string;
    sections: LlmsSection[];
    linkCount: number;
  };
  issues: LlmsIssue[];
  generated: string;
  generatedFrom: { source: 'sitemap' | 'homepage'; urlsConsidered: number; note: string };
};

export function parseLlms(raw: string) {
  const lines = raw.split(/\r?\n/);
  let title = '';
  let summary = '';
  const sections: LlmsSection[] = [];
  let current: LlmsSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const h1 = /^#\s+(.*)$/.exec(trimmed);
    if (h1 && !title) {
      title = h1[1].trim();
      continue;
    }

    const h2 = /^##\s+(.*)$/.exec(trimmed);
    if (h2) {
      current = { heading: h2[1].trim(), links: [] };
      sections.push(current);
      continue;
    }

    if (trimmed.startsWith('>') && !summary) {
      summary = trimmed.replace(/^>\s*/, '').trim();
      continue;
    }

    // - [Title](url): optional note
    const link = /^[-*]\s*\[([^\]]*)\]\(([^)]+)\)\s*:?\s*(.*)$/.exec(trimmed);
    if (link) {
      if (!current) {
        current = { heading: '(no section)', links: [] };
        sections.push(current);
      }
      current.links.push({ title: link[1].trim(), url: link[2].trim(), note: link[3].trim() });
    }
  }

  return {
    title,
    summary,
    sections,
    linkCount: sections.reduce((sum, section) => sum + section.links.length, 0),
  };
}

/** "/services/in-home-care" -> "In Home Care" */
function titleFromPath(path: string) {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  const cleaned = decodeURIComponent(last)
    .replace(/\.(html?|php|aspx)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned ? cleaned.replace(/\b\w/g, (character) => character.toUpperCase()) : 'Home';
}

/** Group URLs by their first path segment — a decent proxy for site sections. */
function sectionNameFor(path: string) {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return 'Main pages';
  return segments[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateLlms(input: {
  siteName: string;
  summary: string;
  origin: string;
  urls: string[];
  maxPerSection?: number;
}) {
  const maxPerSection = input.maxPerSection ?? 12;
  const bySection = new Map<string, { title: string; url: string }[]>();

  for (const url of input.urls) {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      continue;
    }
    const section = sectionNameFor(path);
    const list = bySection.get(section) ?? [];
    if (list.length < maxPerSection) list.push({ title: titleFromPath(path), url });
    bySection.set(section, list);
  }

  // Root pages first, then the largest sections — most useful content up top,
  // since consumers with a small context budget read from the beginning.
  const ordered = [...bySection.entries()].sort((a, b) => {
    if (a[0] === 'Main pages') return -1;
    if (b[0] === 'Main pages') return 1;
    return b[1].length - a[1].length;
  });

  const lines: string[] = [`# ${input.siteName}`, ''];
  if (input.summary) lines.push(`> ${input.summary}`, '');

  for (const [section, links] of ordered) {
    lines.push(`## ${section}`, '');
    for (const link of links) lines.push(`- [${link.title}](${link.url})`);
    lines.push('');
  }

  if (ordered.length === 0) {
    lines.push('## Main pages', '', `- [Home](${input.origin}/)`, '');
  }

  return lines.join('\n');
}

export async function runLlmsAudit(domainInput: string): Promise<LlmsAudit> {
  const url = normalizeUrl(domainInput);
  const origin = url.origin;
  const llmsUrl = `${origin}/llms.txt`;
  const fullUrl = `${origin}/llms-full.txt`;

  const [response, fullResponse] = await Promise.all([fetchText(llmsUrl), fetchText(fullUrl)]);
  const raw = response.text ?? '';
  const parsed = parseLlms(raw);
  const issues: LlmsIssue[] = [];

  // ── Validate what exists ────────────────────────────────────────────
  if (!response.ok) {
    issues.push({
      severity: 'info',
      title: 'No llms.txt published',
      detail: `${llmsUrl} returned ${response.status || 'no response'}. This is not an error — llms.txt is an emerging convention, not a requirement.`,
      fix: 'Publish the generated file at your site root if you want AI tools to have a curated map of your content.',
    });
  } else {
    if (!parsed.title) {
      issues.push({
        severity: 'critical',
        title: 'Missing H1 title',
        detail: 'The spec requires exactly one H1 (`# Site name`) as the first heading.',
        fix: 'Add a single `# Your site name` line at the top.',
      });
    }
    if ((raw.match(/^#\s+/gm) ?? []).length > 1) {
      issues.push({
        severity: 'warning',
        title: 'More than one H1',
        detail: 'Only the first H1 is treated as the site name; later ones are ambiguous.',
        fix: 'Demote additional H1s to `##` section headings.',
      });
    }
    if (!parsed.summary) {
      issues.push({
        severity: 'warning',
        title: 'No summary blockquote',
        detail:
          'A `> one-line summary` immediately after the title is how a model learns what the site is in one read.',
      });
    }
    if (parsed.linkCount === 0) {
      issues.push({
        severity: 'critical',
        title: 'No links found',
        detail:
          'The file has no `- [Title](url)` entries, so it gives a model nothing to follow.',
        fix: 'List your key pages under `##` section headings.',
      });
    }

    const relative = parsed.sections
      .flatMap((section) => section.links)
      .filter((link) => !/^https?:\/\//i.test(link.url));
    if (relative.length > 0) {
      issues.push({
        severity: 'warning',
        title: `${relative.length} relative link(s)`,
        detail: `e.g. "${relative[0].url}". Consumers may fetch this file out of context, so links should be absolute.`,
        fix: 'Use full https:// URLs.',
      });
    }

    if (issues.length === 0) {
      issues.push({
        severity: 'info',
        title: 'Valid llms.txt',
        detail: `Title, summary and ${parsed.linkCount} link(s) across ${parsed.sections.length} section(s) all parse correctly.`,
      });
    }
  }

  if (!fullResponse.ok) {
    issues.push({
      severity: 'info',
      title: 'No llms-full.txt',
      detail:
        'The optional companion file holds your expanded content inline, for tools that want the text rather than links to fetch.',
    });
  }

  // ── Build a suggested file from the site's own URLs ──────────────────
  let siteName = url.hostname.replace(/^www\./, '');
  let summary = '';
  let urls: string[] = [];
  let source: 'sitemap' | 'homepage' = 'homepage';
  let note = '';

  try {
    const facts = extractPageFacts(await fetchPage(origin));
    siteName = facts.og.site_name || facts.h1[0] || facts.title || siteName;
    summary = facts.metaDescription || facts.firstParagraph.slice(0, 180);
  } catch {
    note = 'Could not read the home page, so the title falls back to the hostname.';
  }

  try {
    const audit = await runSitemapAudit(origin);
    urls = audit.entries.map((entry) => entry.loc);
    if (urls.length > 0) {
      source = 'sitemap';
    } else {
      note = note || 'No sitemap URLs found, so only the home page is listed.';
    }
  } catch {
    note = note || 'Sitemap could not be read, so only the home page is listed.';
  }

  if (urls.length === 0) urls = [`${origin}/`];

  return {
    domain: url.hostname.replace(/^www\./, ''),
    origin,
    url: llmsUrl,
    fullUrl,
    found: response.ok,
    status: response.status,
    raw,
    fullFound: fullResponse.ok,
    parsed,
    issues,
    generated: generateLlms({ siteName, summary, origin, urls }),
    generatedFrom: { source, urlsConsidered: urls.length, note },
  };
}
