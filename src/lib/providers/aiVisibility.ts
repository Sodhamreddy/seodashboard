import {
  AI_ENGINES,
  MAX_KEYWORDS,
  type AiEngine,
  type AiKeywordResult,
  type AiSource,
  type AiVisibilityRun,
  type AiVisibilityStore,
} from '../ai-visibility';
import { aiVisibilityPath, readJson, writeJson } from '../store';

/**
 * Runs an AI-visibility check and stores the result.
 *
 * The honest way to measure this is grounding, not the model's opinion:
 * Gemini is asked each keyword with Google Search switched on, and what gets
 * recorded is the sources it actually cited, in order. An ungrounded model
 * would produce a confident answer citing nothing, and scoring that would be
 * measuring a hallucination.
 *
 * Types and the engine list live in `lib/ai-visibility.ts` so the panel can
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

/**
 * Overridable because model ids move faster than this file does. A wrong id
 * comes back as a plain 404 from Google with the name in the message, which
 * is a fixable error rather than a mystery.
 */
function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

export function engineConfigured(engine: AiEngine) {
  const entry = AI_ENGINES.find((candidate) => candidate.id === engine);
  return Boolean(entry && process.env[entry.env]?.trim());
}

/** Bare registrable host: strips scheme, `www.`, path and trailing dot. */
function bareDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

type GroundingChunk = { web?: { uri?: string; title?: string; domain?: string } };

/**
 * One grounded question.
 *
 * Google's grounding chunks carry the source's domain in `title` (and, on
 * newer responses, `domain`); `uri` is a vertexaisearch redirect that does not
 * contain the publisher's host at all, so matching on the URL alone silently
 * finds nothing. All three are checked.
 */
async function askGemini(keyword: string, domain: string, apiKey: string): Promise<AiKeywordResult> {
  const model = geminiModel();

  const response = await fetch(`${API_ROOT}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: keyword }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text.slice(0, 300);
    try {
      message = JSON.parse(text)?.error?.message ?? message;
    } catch {
      /* not JSON — the raw body is the better message */
    }
    return {
      keyword,
      cited: false,
      position: null,
      mentioned: false,
      sources: [],
      error: `${response.status}: ${message}`,
    };
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: GroundingChunk[] };
    }[];
  };

  const candidate = payload.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join(' ');
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];

  // De-duplicated, order preserved: position means "nth distinct source".
  const seen = new Set<string>();
  const sources: AiSource[] = [];
  for (const chunk of chunks) {
    const raw = chunk.web?.domain || chunk.web?.title || '';
    const host = bareDomain(raw);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    sources.push({ domain: host, title: chunk.web?.title ?? host, uri: chunk.web?.uri ?? '' });
  }

  const target = bareDomain(domain);
  const index = sources.findIndex(
    (source) => source.domain === target || source.domain.endsWith(`.${target}`),
  );

  return {
    keyword,
    cited: index >= 0,
    position: index >= 0 ? index + 1 : null,
    mentioned: answer.toLowerCase().includes(target),
    sources,
  };
}

/** Runs the keyword set against one engine and summarises it. */
export async function runAiVisibility(
  domain: string,
  engine: AiEngine,
  keywords: string[],
): Promise<AiVisibilityRun | { error: string }> {
  const entry = AI_ENGINES.find((candidate) => candidate.id === engine);
  if (!entry) return { error: `Unknown engine "${engine}".` };

  const apiKey = process.env[entry.env]?.trim();
  if (!apiKey) {
    return {
      error: `${entry.label} is not configured. Set ${entry.env} in the server environment and restart.`,
    };
  }
  if (engine !== 'gemini') {
    return {
      error: `${entry.label} has a key but no adapter yet — only Gemini is wired.`,
    };
  }
  if (keywords.length === 0) {
    return { error: 'No ranking keywords to check for this client yet.' };
  }

  const picked = keywords.slice(0, MAX_KEYWORDS);

  /*
   * In parallel: five grounded calls run in about the time of the slowest one
   * rather than the sum, and one keyword failing must not lose the other four
   * — each result carries its own error instead.
   */
  const results = await Promise.all(
    picked.map((keyword) =>
      askGemini(keyword, domain, apiKey).catch((error: unknown) => ({
        keyword,
        cited: false,
        position: null,
        mentioned: false,
        sources: [],
        error: error instanceof Error ? error.message : 'Request failed',
      })),
    ),
  );

  const cited = results.filter((result) => result.cited);
  const run: AiVisibilityRun = {
    domain,
    engine,
    model: geminiModel(),
    at: new Date().toISOString(),
    results,
    summary: {
      checked: results.length,
      cited: cited.length,
      mentioned: results.filter((result) => result.mentioned).length,
      averagePosition: cited.length
        ? Number(
            (
              cited.reduce((sum, result) => sum + (result.position ?? 0), 0) / cited.length
            ).toFixed(1),
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

async function saveAiVisibility(domain: string, run: AiVisibilityRun) {
  const store = await loadAiVisibility(domain);
  await writeJson(aiVisibilityPath(domain), { ...store, [run.engine]: run });
}
