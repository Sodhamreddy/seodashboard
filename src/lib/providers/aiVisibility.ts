import {
  AI_ENGINES,
  MAX_HISTORY,
  MAX_KEYWORDS,
  type AiEngine,
  type AiKeywordResult,
  type AiRunMode,
  type AiRunPoint,
  type AiSource,
  type AiVisibilityRun,
  type AiVisibilityStore,
} from '../ai-visibility';
import { aiVisibilityPath, readJson, writeJson } from '../store';

/**
 * Runs an AI-visibility check and stores the result.
 *
 * The honest way to measure this is grounding, not the model's opinion:
 * Gemini is asked each prompt with Google Search switched on, and what gets
 * recorded is the sources it actually cited, in order. An ungrounded model
 * would produce a confident answer citing nothing, and scoring that would be
 * measuring a hallucination.
 *
 * Types and the engine list live in `lib/ai-visibility.ts` so the panels can
 * import them without pulling the filesystem into the browser bundle.
 */

export {
  AI_ENGINES,
  MAX_KEYWORDS,
  type AiEngine,
  type AiKeywordResult,
  type AiSource,
  type AiVisibilityRun,
  type AiVisibilityStore,
};

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/*
 * One call at a time. The free Gemini tier allows five requests a minute, so
 * parallel calls buy nothing but a burst of 429s; sequential calls that wait
 * out Google's stated retry delay get every answer, and on a paid tier the
 * same loop simply never waits.
 */
const MAX_RETRIES = 3;

/** Thrown on a 429, carrying how long Google says to wait. */
export class GeminiRateLimit extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
    /**
     * The day's allowance is spent, not the minute's. Waiting a minute and
     * retrying cannot help, so these fail at once instead of burning three
     * minutes per question on retries that were never going to succeed.
     */
    readonly daily: boolean,
  ) {
    super(message);
  }
}

/**
 * The part of a quota error worth showing: the first sentence, plus which
 * limit was hit ("…free_tier_requests, limit: 20") when Google names it —
 * the difference between "try again in a minute" and "try again tomorrow".
 */
function quotaReason(message: string) {
  const first = message.split('. ')[0];
  const metric = /metric: [^\s,]*?([a-z_]+), limit: (\d+)/i.exec(message);
  return metric ? `${first} (${metric[1]}, limit ${metric[2]})` : first;
}

/**
 * Google states the wait twice — a RetryInfo detail ("53s") and the prose
 * ("Please retry in 53.7s"). Either will do; a small margin is added so the
 * retry does not land a hair before the window reopens.
 */
function retryDelayMs(body: string) {
  try {
    const details = JSON.parse(body)?.error?.details as { retryDelay?: string }[] | undefined;
    const stated = details?.find((detail) => detail.retryDelay)?.retryDelay;
    if (stated) return Math.ceil(parseFloat(stated) * 1000) + 1500;
  } catch {
    /* fall through to the prose */
  }
  const match = /retry in ([\d.]+)s/i.exec(body);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) + 1500 : 30_000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Overridable because model ids move faster than this file does. A wrong id
 * comes back as a plain 404 from Google with the name in the message, which
 * is a fixable error rather than a mystery.
 */
export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

/**
 * The key for an engine, read at call time.
 *
 * Gemini also accepts GOOGLE_API_KEY, the name Google's own Gemini SDKs read —
 * a key saved under that name is not a misconfiguration worth a "not
 * configured" banner. GEMINI_API_KEY wins when both are set, so a key scoped
 * to Gemini can sit beside a broader Google one.
 */
export function engineKey(engine: AiEngine) {
  const entry = AI_ENGINES.find((candidate) => candidate.id === engine);
  if (!entry) return '';
  const primary = process.env[entry.env]?.trim();
  if (primary) return primary;
  return engine === 'gemini' ? (process.env.GOOGLE_API_KEY?.trim() ?? '') : '';
}

export function engineConfigured(engine: AiEngine) {
  return engineKey(engine).length > 0;
}

/** Bare registrable host: strips scheme, `www.`, path and trailing dot. */
export function bareDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The words that count as the client being *named* in an answer.
 *
 * The domain alone misses almost every real mention: an assistant says
 * "Assured Home Nursing", not "myassuredhomenursing.com". So the roster name,
 * the trading name and the domain's label all count, matched on word
 * boundaries so a four-letter acronym does not fire inside a longer word.
 * Anything under four characters is dropped as too likely to collide.
 */
export function brandTerms(domain: string, names: (string | undefined)[]) {
  const host = bareDomain(domain);
  const label = host.split('.')[0];
  return [...new Set([host, label, ...names].map((term) => (term ?? '').trim()).filter(Boolean))]
    .filter((term) => term.length >= 4);
}

function namesBrand(text: string, terms: string[]) {
  const haystack = text.toLowerCase();
  return terms.some((term) =>
    new RegExp(`(^|[^a-z0-9])${escapeRegExp(term.toLowerCase())}($|[^a-z0-9])`).test(haystack),
  );
}

type GroundingChunk = { web?: { uri?: string; title?: string; domain?: string } };

export type GeminiAnswer = {
  text: string;
  sources: AiSource[];
};

/**
 * One grounded Gemini call, shared by the visibility check and the question
 * generator.
 *
 * Google's grounding chunks carry the source's domain in `title` (and, on
 * newer responses, `domain`); `uri` is a vertexaisearch redirect that does not
 * contain the publisher's host at all, so matching on the URL alone silently
 * finds nothing.
 */
export async function askGeminiGrounded(prompt: string, apiKey: string): Promise<GeminiAnswer> {
  const response = await fetch(`${API_ROOT}/${geminiModel()}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body.slice(0, 300);
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {
      /* not JSON — the raw body is the better message */
    }
    if (response.status === 429) {
      throw new GeminiRateLimit(`429: ${quotaReason(message)}`, retryDelayMs(body), /PerDay/i.test(body));
    }
    throw new Error(`${response.status}: ${message}`);
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: GroundingChunk[] };
    }[];
  };

  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join(' ');

  // De-duplicated, order preserved: position means "nth distinct source".
  const seen = new Set<string>();
  const sources: AiSource[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const host = bareDomain(chunk.web?.domain || chunk.web?.title || '');
    if (!host || seen.has(host)) continue;
    seen.add(host);
    sources.push({ domain: host, title: chunk.web?.title ?? host, uri: chunk.web?.uri ?? '' });
  }

  return { text, sources };
}

export type ProgressFn = (update: { done: number; total: number; note?: string }) => void;

async function checkOne(
  item: { text: string; topic?: string },
  domain: string,
  terms: string[],
  apiKey: string,
  onWait: (ms: number) => void,
): Promise<AiKeywordResult> {
  try {
    let answer: GeminiAnswer | null = null;
    for (let attempt = 0; answer === null; attempt += 1) {
      try {
        answer = await askGeminiGrounded(item.text, apiKey);
      } catch (error) {
        if (!(error instanceof GeminiRateLimit) || error.daily || attempt >= MAX_RETRIES) throw error;
        onWait(error.retryAfterMs);
        await sleep(Math.min(error.retryAfterMs, 90_000));
      }
    }
    const target = bareDomain(domain);
    const index = answer.sources.findIndex(
      (source) => source.domain === target || source.domain.endsWith(`.${target}`),
    );
    return {
      keyword: item.text,
      topic: item.topic,
      cited: index >= 0,
      position: index >= 0 ? index + 1 : null,
      mentioned: namesBrand(answer.text, terms),
      sources: answer.sources,
    };
  } catch (error) {
    return {
      keyword: item.text,
      topic: item.topic,
      cited: false,
      position: null,
      mentioned: false,
      sources: [],
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/** Runs one prompt set against one engine and stores it. */
export async function runAiVisibility(
  domain: string,
  engine: AiEngine,
  items: { text: string; topic?: string }[],
  mode: AiRunMode,
  terms: string[],
  onProgress?: ProgressFn,
): Promise<AiVisibilityRun | { error: string }> {
  const entry = AI_ENGINES.find((candidate) => candidate.id === engine);
  if (!entry) return { error: `Unknown engine "${engine}".` };

  const apiKey = engineKey(engine);
  if (!apiKey) {
    return {
      error: `${entry.label} is not configured. Set ${entry.env} in the server environment and restart.`,
    };
  }
  if (engine !== 'gemini') {
    return { error: `${entry.label} has a key but no adapter yet — only Gemini is wired.` };
  }
  if (items.length === 0) {
    return {
      error:
        mode === 'questions'
          ? 'No questions to check yet — generate them from the business first.'
          : 'No ranking keywords to check for this client yet.',
    };
  }

  const results: AiKeywordResult[] = [];
  for (const item of items) {
    onProgress?.({ done: results.length, total: items.length });
    results.push(
      await checkOne(item, domain, terms, apiKey, (ms) =>
        onProgress?.({
          done: results.length,
          total: items.length,
          note: `Rate limit — resuming in ${Math.ceil(ms / 1000)}s`,
        }),
      ),
    );
  }
  onProgress?.({ done: results.length, total: items.length });

  /*
   * Rates are over the answers that came back. A failed call is not "not
   * mentioned" — counting it as one understated the result: four rate-limited
   * questions turned 0 of 8 into 0 of 12.
   */
  const answered = results.filter((result) => !result.error);
  const cited = answered.filter((result) => result.cited);
  const run: AiVisibilityRun = {
    domain,
    engine,
    mode,
    model: geminiModel(),
    at: new Date().toISOString(),
    results,
    summary: {
      checked: answered.length,
      failed: results.length - answered.length,
      cited: cited.length,
      mentioned: answered.filter((result) => result.mentioned).length,
      averagePosition: cited.length
        ? Number(
            (cited.reduce((sum, result) => sum + (result.position ?? 0), 0) / cited.length).toFixed(1),
          )
        : null,
    },
  };

  await saveAiVisibility(domain, run);
  return run;
}

export async function loadAiVisibility(domain: string): Promise<AiVisibilityStore> {
  return readJson<AiVisibilityStore>(aiVisibilityPath(domain), {});
}

/**
 * Keyword runs keep their old top-level slot so files written before question
 * tracking still read; question runs get their own; every run's summary is
 * appended to the history, which is what makes this *tracking* rather than a
 * snapshot that the next run overwrites.
 */
async function saveAiVisibility(domain: string, run: AiVisibilityRun) {
  const store = await loadAiVisibility(domain);
  const mode = run.mode ?? 'keywords';

  const point: AiRunPoint = {
    at: run.at,
    engine: run.engine,
    mode,
    checked: run.summary.checked,
    cited: run.summary.cited,
    mentioned: run.summary.mentioned,
    averagePosition: run.summary.averagePosition,
  };

  const next: AiVisibilityStore =
    mode === 'questions'
      ? { ...store, questions: { ...store.questions, [run.engine]: run } }
      : { ...store, [run.engine]: run };

  next.history = [...(store.history ?? []), point].slice(-MAX_HISTORY);
  await writeJson(aiVisibilityPath(domain), next);
}
