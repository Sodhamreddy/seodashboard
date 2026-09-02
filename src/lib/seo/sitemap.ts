import * as cheerio from 'cheerio';
import { fetchText, normalizeUrl } from '../fetch-page';
import { readJson, sitemapSnapshotPath, writeJson } from '../store';

const MAX_URLS = 5000;
const MAX_CHILD_SITEMAPS = 25;
const SPOT_CHECK_COUNT = 8;

export type SitemapEntry = {
  loc: string;
  lastmod: string | null;
  changefreq: string | null;
  priority: string | null;
  /** Which child sitemap the entry came from. */
  source: string;
};

export type SitemapSnapshot = {
  domain: string;
  takenAt: string;
  entries: { loc: string; lastmod: string | null }[];
};

export type SitemapDiff = {
  hasBaseline: boolean;
  baselineTakenAt: string | null;
  added: string[];
  removed: string[];
  updated: { loc: string; from: string | null; to: string | null }[];
};

export type SpotCheck = { loc: string; status: number; ok: boolean };

export type SitemapAudit = {
  domain: string;
  origin: string;
  robots: {
    found: boolean;
    url: string;
    declaredSitemaps: string[];
    blocksEverything: boolean;
  };
  sitemaps: { url: string; kind: 'index' | 'urlset'; entryCount: number; error?: string }[];
  entries: SitemapEntry[];
  truncated: boolean;
  stats: {
    total: number;
    withLastmod: number;
    staleOver180Days: number;
    updatedLast7Days: number;
    maxDepth: number;
    byDepth: { depth: number; count: number }[];
    byLastmodMonth: { month: string; count: number }[];
  };
  diff: SitemapDiff;
  spotChecks: SpotCheck[];
  generatedXml: string;
  errors: string[];
};

function parseSitemapXml(xml: string, sourceUrl: string) {
  const $ = cheerio.load(xml, { xmlMode: true });

  const childSitemaps: string[] = [];
  $('sitemapindex > sitemap > loc').each((_, element) => {
    const loc = $(element).text().trim();
    if (loc) childSitemaps.push(loc);
  });

  const entries: SitemapEntry[] = [];
  $('urlset > url').each((_, element) => {
    const node = $(element);
    const loc = node.find('loc').first().text().trim();
    if (!loc) return;
    entries.push({
      loc,
      lastmod: node.find('lastmod').first().text().trim() || null,
      changefreq: node.find('changefreq').first().text().trim() || null,
      priority: node.find('priority').first().text().trim() || null,
      source: sourceUrl,
    });
  });

  return { childSitemaps, entries };
}

function depthOf(loc: string) {
  try {
    return new URL(loc).pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function generateSitemapXml(entries: SitemapEntry[]) {
  const rows = entries
    .slice(0, MAX_URLS)
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`);
      if (entry.priority) parts.push(`    <priority>${escapeXml(entry.priority)}</priority>`);
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function spotCheck(entries: SitemapEntry[]): Promise<SpotCheck[]> {
  if (entries.length === 0) return [];

  // Even stride across the list rather than the first N, so deep URLs get sampled.
  const stride = Math.max(1, Math.floor(entries.length / SPOT_CHECK_COUNT));
  const sample: SitemapEntry[] = [];
  for (let i = 0; i < entries.length && sample.length < SPOT_CHECK_COUNT; i += stride) {
    sample.push(entries[i]);
  }

  return Promise.all(
    sample.map(async (entry) => {
      try {
        const response = await fetch(entry.loc, {
          method: 'HEAD',
          redirect: 'follow',
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
          headers: { 'user-agent': 'SEO-Premium-Dashboard/1.0 (sitemap spot check)' },
        });
        return { loc: entry.loc, status: response.status, ok: response.ok };
      } catch {
        return { loc: entry.loc, status: 0, ok: false };
      }
    }),
  );
}

export function diffSnapshots(
  previous: SitemapSnapshot | null,
  entries: SitemapEntry[],
): SitemapDiff {
  if (!previous) {
    return {
      hasBaseline: false,
      baselineTakenAt: null,
      added: [],
      removed: [],
      updated: [],
    };
  }

  const before = new Map(previous.entries.map((entry) => [entry.loc, entry.lastmod]));
  const after = new Map(entries.map((entry) => [entry.loc, entry.lastmod]));

  const added: string[] = [];
  const updated: SitemapDiff['updated'] = [];
  for (const [loc, lastmod] of after) {
    if (!before.has(loc)) {
      added.push(loc);
    } else if ((before.get(loc) || null) !== (lastmod || null)) {
      updated.push({ loc, from: before.get(loc) ?? null, to: lastmod });
    }
  }
  const removed = [...before.keys()].filter((loc) => !after.has(loc));

  return {
    hasBaseline: true,
    baselineTakenAt: previous.takenAt,
    added,
    removed,
    updated,
  };
}

export async function runSitemapAudit(
  domainInput: string,
  options: { saveSnapshot?: boolean; sitemapUrl?: string } = {},
): Promise<SitemapAudit> {
  const url = normalizeUrl(domainInput);
  const origin = url.origin;
  const domain = url.hostname.replace(/^www\./, '');
  const errors: string[] = [];

  // ── robots.txt ──────────────────────────────────────────────────────
  const robotsResponse = await fetchText(`${origin}/robots.txt`);
  const declaredSitemaps: string[] = [];
  let blocksEverything = false;

  if (robotsResponse.ok && robotsResponse.text) {
    for (const line of robotsResponse.text.split('\n')) {
      const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
      if (match) declaredSitemaps.push(match[1].trim());
    }
    // Only a `User-agent: *` group with a bare `Disallow: /` blocks everything.
    const groups = robotsResponse.text.split(/^\s*user-agent\s*:/im).slice(1);
    blocksEverything = groups.some((group) => {
      const [agentLine, ...rest] = group.split('\n');
      if (agentLine.trim() !== '*') return false;
      return rest.some((line) => /^\s*disallow\s*:\s*\/\s*$/i.test(line));
    });
  }

  // ── Crawl sitemaps ──────────────────────────────────────────────────
  const roots = options.sitemapUrl?.trim()
    ? [options.sitemapUrl.trim()]
    : declaredSitemaps.length
      ? declaredSitemaps
      : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap-index.xml`];

  const sitemaps: SitemapAudit['sitemaps'] = [];
  const entries: SitemapEntry[] = [];
  const seenSitemaps = new Set<string>();
  const queue = [...roots];
  let truncated = false;

  while (queue.length > 0 && seenSitemaps.size < MAX_CHILD_SITEMAPS) {
    const target = queue.shift() as string;
    if (seenSitemaps.has(target)) continue;
    seenSitemaps.add(target);

    const response = await fetchText(target);
    if (!response.ok || !response.text.trim()) {
      // A missing default guess is expected; a declared sitemap failing is not.
      if (options.sitemapUrl || declaredSitemaps.includes(target)) {
        sitemaps.push({
          url: target,
          kind: 'urlset',
          entryCount: 0,
          error: `HTTP ${response.status || 'unreachable'}`,
        });
      }
      continue;
    }

    const parsed = parseSitemapXml(response.text, target);
    if (parsed.childSitemaps.length > 0) {
      sitemaps.push({ url: target, kind: 'index', entryCount: parsed.childSitemaps.length });
      queue.push(...parsed.childSitemaps);
    } else {
      sitemaps.push({ url: target, kind: 'urlset', entryCount: parsed.entries.length });
    }

    for (const entry of parsed.entries) {
      if (entries.length >= MAX_URLS) {
        truncated = true;
        break;
      }
      entries.push(entry);
    }
  }

  if (sitemaps.length === 0) {
    errors.push(
      `No XML sitemap found for ${domain}. Checked robots.txt plus /sitemap.xml, /sitemap_index.xml and /sitemap-index.xml.`,
    );
  }
  if (queue.length > 0) {
    errors.push(
      `Stopped after ${MAX_CHILD_SITEMAPS} child sitemaps — ${queue.length} more were not crawled.`,
    );
  }

  // ── Stats ───────────────────────────────────────────────────────────
  const now = Date.now();
  const depthCounts = new Map<number, number>();
  const monthCounts = new Map<string, number>();
  let withLastmod = 0;
  let staleOver180Days = 0;
  let updatedLast7Days = 0;
  let maxDepth = 0;

  for (const entry of entries) {
    const depth = depthOf(entry.loc);
    maxDepth = Math.max(maxDepth, depth);
    depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);

    if (!entry.lastmod) continue;
    const stamp = new Date(entry.lastmod).getTime();
    if (Number.isNaN(stamp)) continue;

    withLastmod += 1;
    const ageDays = (now - stamp) / 86_400_000;
    if (ageDays > 180) staleOver180Days += 1;
    if (ageDays <= 7) updatedLast7Days += 1;

    const month = new Date(entry.lastmod).toISOString().slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  // ── Diff against the stored baseline ────────────────────────────────
  const snapshotPath = sitemapSnapshotPath(domain);
  const previous = await readJson<SitemapSnapshot | null>(snapshotPath, null);
  const diff = diffSnapshots(previous, entries);

  if (options.saveSnapshot && entries.length > 0) {
    const snapshot: SitemapSnapshot = {
      domain,
      takenAt: new Date().toISOString(),
      entries: entries.map((entry) => ({ loc: entry.loc, lastmod: entry.lastmod })),
    };
    await writeJson(snapshotPath, snapshot);
  }

  return {
    domain,
    origin,
    robots: {
      found: robotsResponse.ok,
      url: `${origin}/robots.txt`,
      declaredSitemaps,
      blocksEverything,
    },
    sitemaps,
    entries: entries.slice(0, 500),
    truncated,
    stats: {
      total: entries.length,
      withLastmod,
      staleOver180Days,
      updatedLast7Days,
      maxDepth,
      byDepth: [...depthCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([depth, count]) => ({ depth, count })),
      byLastmodMonth: [...monthCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([month, count]) => ({ month, count })),
    },
    diff,
    spotChecks: await spotCheck(entries),
    generatedXml: generateSitemapXml(entries),
    errors,
  };
}

/** Lightweight version used by the SEO Score Checker's crawl context. */
export async function quickSitemapProbe(origin: string) {
  const robots = await fetchText(`${origin}/robots.txt`);
  const declared: string[] = [];
  if (robots.ok) {
    for (const line of robots.text.split('\n')) {
      const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
      if (match) declared.push(match[1].trim());
    }
  }

  const blocksEverything =
    robots.ok &&
    robots.text
      .split(/^\s*user-agent\s*:/im)
      .slice(1)
      .some((group) => {
        const [agentLine, ...rest] = group.split('\n');
        return (
          agentLine.trim() === '*' && rest.some((line) => /^\s*disallow\s*:\s*\/\s*$/i.test(line))
        );
      });

  for (const candidate of [...declared, `${origin}/sitemap.xml`]) {
    const response = await fetchText(candidate, 10_000);
    if (!response.ok || !response.text.trim()) continue;
    const parsed = parseSitemapXml(response.text, candidate);
    const count = parsed.entries.length || parsed.childSitemaps.length;
    if (count > 0) {
      return {
        robotsTxt: { found: robots.ok, url: `${origin}/robots.txt`, blocksEverything, sitemaps: declared },
        sitemap: { found: true, url: candidate, urlCount: count },
      };
    }
  }

  return {
    robotsTxt: { found: robots.ok, url: `${origin}/robots.txt`, blocksEverything, sitemaps: declared },
    sitemap: { found: false, url: '', urlCount: 0 },
  };
}
