import {
  type Automation,
  type AutomationCategory,
  type AutomationRegistry,
  type AutomationRun,
  type AutomationRunLog,
} from '../automations';
import { AUTOMATION_RUNS_PATH, AUTOMATIONS_PATH, readJson, writeJson } from '../store';

/**
 * The automation registry's store.
 *
 * Every agent, workflow and dashboard tool the team runs for clients, in one
 * list. Roughly half of these are pages in this app; the rest run in a separate
 * automation framework, and before this the only record of what existed, what
 * state it was in and how many clients it covered was a spreadsheet nobody
 * could see from the dashboard.
 *
 * Two things are deliberately separate:
 *
 *  - **The catalogue** (`Automation`) — names, descriptions, status, client
 *    counts, schedules. Edited by a human in the UI and persisted under
 *    `.data/automations/registry.json`.
 *  - **The run log** (`AutomationRun`) — what actually happened, pushed in by
 *    whatever runs the automation via `POST /api/automations/runs`. Push rather
 *    than pull, because the runners are not one system with one API, and a
 *    dashboard that polled half of them would report "unknown" for the other
 *    half while looking like it knew.
 *
 * Nothing here invents run data. An automation with no reported runs says so.
 *
 * The types and category list live in `lib/automations.ts` so the editor, which
 * is a client component, can import them without dragging `node:fs/promises`
 * into the browser bundle.
 */

export type {
  Automation,
  AutomationCategory,
  AutomationRegistry,
  AutomationRun,
  AutomationRunLog,
} from '../automations';

/** Runs kept per automation. Enough for a trend, small enough to stay a file. */
const RUN_HISTORY_LIMIT = 20;

/*
 * The seed catalogue, from the team's own inventory. Client counts are the
 * "implemented clients" column; a blank there means none yet rather than
 * unknown, which is why they are numbers and not optional.
 */
const SEED: Automation[] = [
  /* ── Agents ──────────────────────────────────────────────────────── */
  {
    id: 'serp-agent',
    name: 'SERP Agent',
    category: 'Agents',
    description:
      'Monitors target keywords in Google Search and tracks the site’s ranking position automatically, replacing the daily manual check with a ranking report.',
    status: 'live',
    clients: 4,
    schedule: 'Daily',
  },
  {
    id: 'website-testing-agent',
    name: 'Website Testing Agent',
    category: 'Agents',
    description:
      'End-to-end pre-launch testing: every page, form and button across devices and browsers, surfacing bugs, broken links, UI issues, speed problems and functional errors before users meet them.',
    status: 'live',
    clients: 7,
    schedule: 'On demand',
  },
  {
    id: 'backlinks-agent',
    name: 'Backlinks Agent',
    category: 'Agents',
    description:
      'Discovers new backlink opportunities — high-authority profile listings and trusted sites — then de-duplicates against everything already collected so only fresh prospects come back.',
    status: 'live',
    clients: 1,
    schedule: 'Weekly',
  },
  {
    id: 'chatbot',
    name: 'Chatbot Workflow',
    category: 'Agents',
    description:
      'Answers visitor questions from the client’s own site content (or a dedicated database) using the Gemini API and replies to the user.',
    status: 'planned',
    clients: 0,
    schedule: 'Always on',
  },

  /* ── Workflows ───────────────────────────────────────────────────── */
  {
    id: 'social-insights',
    name: 'Social Media Insights (v1)',
    category: 'Workflows',
    description:
      'Retrieves post-level insights from Facebook, Instagram, X and LinkedIn and presents them in one dashboard in chronological order.',
    status: 'live',
    clients: 2,
    schedule: 'Daily',
  },
  {
    id: 'social-timeline',
    name: 'Social Media Timeline',
    category: 'Workflows',
    description:
      'Generates a social calendar for the client’s business and location, including the major holidays and special days that matter to that sector.',
    status: 'live',
    clients: 3,
    schedule: 'Monthly',
  },
  {
    id: 'google-indexing',
    name: 'Google Indexing Workflow',
    category: 'Workflows',
    description:
      'Checks every page for index status, notifies which are missing, submits those to Search Console automatically, then notifies again with what was submitted.',
    status: 'live',
    clients: 0,
    schedule: 'Daily 09:30',
  },
  {
    id: 'performance-monitoring',
    name: 'Website Performance Monitoring',
    category: 'Workflows',
    description:
      'Checks site performance daily and notifies the team when it drops below the agreed threshold.',
    status: 'live',
    clients: 0,
    schedule: 'Daily',
  },
  {
    id: 'domain-expiry',
    name: 'Domain Expiry Alerts',
    category: 'Workflows',
    description:
      'Watches domain expiry dates and alerts at three intervals: 30 days out, 15 days out, and the day before.',
    status: 'live',
    clients: 0,
    schedule: 'Daily',
  },
  {
    id: 'blog-social-posting',
    name: 'Blogs & Social Auto-posting (v1)',
    category: 'Workflows',
    description:
      'Generates topics for the client’s business and location into a sheet; on approval it writes the full blog to the DM and content team’s conditions, and once the design team drops in the image link and everyone approves, publishes to WordPress.',
    status: 'live',
    clients: 0,
    schedule: 'On approval',
  },
  {
    id: 'website-backup',
    name: 'Website Backup Workflow',
    category: 'Workflows',
    description:
      'Takes a monthly backup, pushes it to GitHub, and prunes anything older than three months.',
    status: 'live',
    clients: 0,
    schedule: 'Monthly',
  },
  {
    id: 'website-down-alerts',
    name: 'Website Down Alerts',
    category: 'Workflows',
    description:
      'Polls the URL at the configured frequency, confirms an outage before crying wolf, notifies by email or Slack, and keeps a downtime history.',
    status: 'live',
    clients: 0,
    schedule: 'Continuous',
  },
  {
    id: 'broken-link-workflow',
    name: 'Broken Link Checker Workflow',
    category: 'Workflows',
    description:
      'Crawls the whole site for broken links and alerts the team. The dashboard tool covers the same ground on demand.',
    status: 'live',
    clients: 0,
    schedule: 'Weekly',
    href: '/broken-links',
  },

  /* ── Dashboard tools ─────────────────────────────────────────────── */
  {
    id: 'seo-score',
    name: 'SEO Score Checker',
    category: 'Dashboard tools',
    description:
      'Scores any URL across 30 weighted checks and returns a prioritised list of fixes.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/seo-score',
  },
  {
    id: 'meta-tags',
    name: 'Meta Tag Generator',
    category: 'Dashboard tools',
    description:
      'Generates SEO-friendly titles, descriptions and Open Graph tags for a page.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/meta-tags',
  },
  {
    id: 'schema',
    name: 'Schema Markup Generator',
    category: 'Dashboard tools',
    description: 'Builds and validates JSON-LD structured data for a page.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/schema',
  },
  {
    id: 'sitemap',
    name: 'XML Sitemap Automation',
    category: 'Dashboard tools',
    description:
      'Detects new and changed pages, regenerates the XML sitemap and submits it to Search Console.',
    status: 'live',
    clients: 0,
    schedule: 'On change',
    href: '/sitemap',
  },
  {
    id: 'backlink-tracker',
    name: 'Backlink Tracker',
    category: 'Dashboard tools',
    description:
      'Tracks existing backlinks, diffs against the previous pull for new and lost links, checks DA/PA and shows growth over time.',
    status: 'live',
    clients: 0,
    schedule: 'Daily',
    href: '/backlinks',
  },
  {
    id: 'robots',
    name: 'robots.txt',
    category: 'Dashboard tools',
    description:
      'Scans the live robots.txt, flags SEO issues in the allow/disallow rules, and generates a corrected file.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/robots',
  },
  {
    id: 'llms',
    name: 'llms.txt',
    category: 'Dashboard tools',
    description:
      'Crawls the important content, identifies the key pages and generates an llms.txt for review and publication.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/llms',
  },
  {
    id: 'traffic',
    name: 'Website Traffic',
    category: 'Dashboard tools',
    description:
      'GA4 users, sessions, pageviews and engagement by window, with channel mix, top landing pages and Search Console clicks and CTR per page.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/traffic',
  },
  {
    id: 'keywords',
    name: 'Keyword Monitoring',
    category: 'Dashboard tools',
    description:
      'Tracks keyword positions and reports movement, visibility and trend over time.',
    status: 'live',
    clients: 0,
    schedule: 'Daily',
    href: '/keywords',
  },
  {
    id: 'google-ads',
    name: 'Google Ads Performance',
    category: 'Dashboard tools',
    description:
      'Campaign performance, CTR, conversions and ROAS for the selected window, with a budget-limited filter.',
    status: 'live',
    clients: 0,
    schedule: 'On demand',
    href: '/google-ads',
  },
  {
    id: 'budget-alerts',
    name: 'Budget Alert System — Google',
    category: 'Dashboard tools',
    description:
      'Watches month-to-date Google Ads spend against a set budget and fires at each threshold percentage.',
    status: 'live',
    clients: 0,
    schedule: 'Daily',
    href: '/budget-alerts',
  },
  {
    id: 'gmb-reviews',
    name: 'GMB Reviews Alert',
    category: 'Dashboard tools',
    description:
      'Monitors Business Profile reviews and drafts replies by rating. Gated on Google approving Business Profile API access, and the dashboard tab is hidden until then.',
    status: 'paused',
    clients: 0,
    schedule: 'Daily',
    notes: 'Tab removed from the sidebar; page still exists at /gmb-reviews.',
  },
];

export function seedAutomations(): Automation[] {
  return SEED.map((entry) => ({ ...entry }));
}

/**
 * The catalogue, stored values winning over the seed.
 *
 * Merged rather than replaced so a new entry added to the seed in a release
 * shows up for an install that already has a saved registry, and an entry the
 * team edited keeps its edits.
 */
export async function loadAutomations(): Promise<Automation[]> {
  const stored = await readJson<AutomationRegistry | null>(AUTOMATIONS_PATH, null);
  const seeds = seedAutomations();
  if (!stored?.automations?.length) return seeds;

  const byId = new Map(stored.automations.map((entry) => [entry.id, entry]));
  const merged = seeds.map((seed) => {
    const override = byId.get(seed.id);
    byId.delete(seed.id);
    // Description and category stay with the code; status, counts, schedule and
    // notes are the operator's to own.
    return override
      ? { ...seed, ...override, name: override.name, description: seed.description }
      : seed;
  });

  // Anything stored that the seed no longer knows about was added by hand, so
  // it is kept rather than silently dropped.
  return [...merged, ...byId.values()];
}

export async function saveAutomations(automations: Automation[]) {
  const registry: AutomationRegistry = {
    updatedAt: new Date().toISOString(),
    automations,
  };
  await writeJson(AUTOMATIONS_PATH, registry);
  return registry;
}

export async function loadRunLog(): Promise<AutomationRunLog> {
  return readJson<AutomationRunLog>(AUTOMATION_RUNS_PATH, {});
}

/** Appends a reported run, newest first, capped per automation. */
export async function recordRun(id: string, run: AutomationRun) {
  const log = await loadRunLog();
  const history = [run, ...(log[id] ?? [])].slice(0, RUN_HISTORY_LIMIT);
  const next: AutomationRunLog = { ...log, [id]: history };
  await writeJson(AUTOMATION_RUNS_PATH, next);
  return history;
}
