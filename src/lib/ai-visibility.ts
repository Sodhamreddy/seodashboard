/**
 * AI-visibility types and engine list.
 *
 * Split from `providers/aiVisibility.ts` for the same reason `score-band.ts`
 * is split from `data.tsx`: the panel is a client component, and importing a
 * *value* — the engine list — from the provider would drag `store.ts`, and so
 * `node:fs/promises`, into the browser bundle. The failure is a runtime
 * "is not a function" during SSR, with no type error to catch it first.
 */

/**
 * Whether an AI assistant cites this site when asked what it ranks for.
 *
 * Search Console answers "where do we rank on Google". It says nothing about
 * the answer engines people increasingly ask instead, where there is no blue
 * link to hold a position — a site is either cited as a source or it is not.
 *
 * The honest way to measure that is grounding, not the model's opinion. Gemini
 * is asked each keyword with Google Search grounding switched on, and what
 * gets recorded is the list of sources it actually cited, in the order it
 * cited them. An ungrounded model would happily produce a confident answer
 * with no sources at all, and scoring that would be measuring a hallucination.
 *
 * ChatGPT and Claude are the same shape of question with different clients;
 * the engine list below is deliberately open so they slot in without the
 * stored runs or the UI changing.
 */

export type AiEngine = 'gemini' | 'chatgpt' | 'claude';

export const AI_ENGINES: { id: AiEngine; label: string; env: string }[] = [
  { id: 'gemini', label: 'Gemini', env: 'GEMINI_API_KEY' },
  { id: 'chatgpt', label: 'ChatGPT', env: 'OPENAI_API_KEY' },
  { id: 'claude', label: 'Claude', env: 'ANTHROPIC_API_KEY' },
];

export type AiSource = { domain: string; title: string; uri: string };

export type AiKeywordResult = {
  keyword: string;
  /** The site appeared in the answer's cited sources. */
  cited: boolean;
  /** 1-based rank among the unique domains cited; null when not cited. */
  position: number | null;
  /** Named in the prose, whether or not it was cited as a source. */
  mentioned: boolean;
  /** Every unique domain the answer cited, in the order given. */
  sources: AiSource[];
  /** Set when this one keyword failed; the rest of the run still stands. */
  error?: string;
  /** For a question run: the service the question belongs to. */
  topic?: string;
};

/**
 * What was asked. 'keywords' are the terms the site already ranks for in
 * Search Console; 'questions' are buyer questions generated from the business.
 * They measure different things — whether the engine cites you where you
 * already win, versus whether it recommends you when someone shops the
 * category — so they are stored and trended separately.
 */
export type AiRunMode = 'keywords' | 'questions';

export type AiVisibilityRun = {
  domain: string;
  engine: AiEngine;
  /** Absent on runs stored before question tracking existed: those were keyword runs. */
  mode?: AiRunMode;
  model: string;
  at: string;
  results: AiKeywordResult[];
  summary: {
    checked: number;
    cited: number;
    mentioned: number;
    /** Mean position across the keywords where the site was cited. */
    averagePosition: number | null;
  };
};

/** One run reduced to its summary — the series behind the trend. */
export type AiRunPoint = {
  at: string;
  engine: AiEngine;
  mode: AiRunMode;
  checked: number;
  cited: number;
  mentioned: number;
  averagePosition: number | null;
};

/**
 * Latest keyword run per engine at the top level — the shape stored before
 * question tracking, kept so existing files still read — plus the latest
 * question run per engine and a capped history of every run's summary.
 */
export type AiVisibilityStore = Partial<Record<AiEngine, AiVisibilityRun>> & {
  questions?: Partial<Record<AiEngine, AiVisibilityRun>>;
  history?: AiRunPoint[];
};

/* ── Buyer questions ─────────────────────────────────────────────── */

export type AiQuestion = {
  id: string;
  question: string;
  /** The service it belongs to, so the list and the results group by it. */
  topic: string;
  addedAt: string;
};

/**
 * The questions tracked for one client, generated from the business itself.
 *
 * `business` and `services` are what the model understood the site to be.
 * They are stored and shown so a wrong reading is caught before a month of
 * tracking is spent on questions about a business the client does not run.
 */
export type AiQuestionSet = {
  domain: string;
  business: string;
  services: string[];
  /** Where the business operates, when it serves a local area. */
  location?: string;
  generatedAt: string;
  model: string;
  questions: AiQuestion[];
};

/** Questions generated per set. A run checks all of them. */
export const MAX_QUESTIONS = 12;

/** Summaries kept in the history — a year of weekly runs across both modes. */
export const MAX_HISTORY = 100;

/**
 * Who else the answers cited, across a whole question run.
 *
 * This is the competitor list that matters in answer engines: not who ranks
 * near you on Google, but whose pages the model reached for when a buyer asked
 * about your category.
 */
export function sourceLeaderboard(run: AiVisibilityRun | undefined, limit = 10) {
  if (!run) return [];
  const counts = new Map<string, number>();
  for (const result of run.results) {
    for (const source of result.sources) {
      counts.set(source.domain, (counts.get(source.domain) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, answers]) => ({ domain, answers, share: answers / Math.max(1, run.results.length) }))
    .sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

/*
 * A grounded call is a few seconds and real quota, so a run is deliberately
 * small and explicit: the operator presses a button, it checks the top
 * handful of keywords, and the result is stored and shown with its timestamp
 * until they press it again.
 */
export const MAX_KEYWORDS = 5;
