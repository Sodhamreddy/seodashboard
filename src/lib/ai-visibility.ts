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
};

export type AiVisibilityRun = {
  domain: string;
  engine: AiEngine;
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

/** Last run per engine, keyed by engine id. */
export type AiVisibilityStore = Partial<Record<AiEngine, AiVisibilityRun>>;

/*
 * A grounded call is a few seconds and real quota, so a run is deliberately
 * small and explicit: the operator presses a button, it checks the top
 * handful of keywords, and the result is stored and shown with its timestamp
 * until they press it again.
 */
export const MAX_KEYWORDS = 5;
