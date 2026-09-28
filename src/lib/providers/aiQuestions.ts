import { MAX_QUESTIONS, type AiQuestion, type AiQuestionSet } from '../ai-visibility';
import { aiQuestionsPath, readJson, writeJson } from '../store';
import { askGeminiGrounded, bareDomain, brandTerms, geminiModel } from './aiVisibility';

/**
 * Buyer questions, generated from the business itself.
 *
 * Nobody can see what people type into ChatGPT or Gemini — those transcripts
 * are private and no API publishes them. So these are modelled, not observed:
 * Gemini researches the site with Search grounding, works out what the
 * business sells and where, and writes the questions a prospective customer
 * in that category would ask an assistant. The page labels them as generated
 * and shows what the model understood the business to be, so a wrong reading
 * is caught before it is tracked.
 *
 * One rule matters more than the rest: a question must never name the client.
 * The point is to learn whether the assistant recommends them *unprompted*.
 * Asking "is Assured Home Nursing any good?" guarantees a mention and measures
 * nothing — so named questions are rejected here even if the model writes one.
 */

function prompt(domain: string) {
  return `Research the business that runs the website ${domain}. Use Google Search to find what it actually sells, what it is called, and where it operates.

Reply with ONLY a JSON object — no prose before or after it, no code fence:
{
  "name": "the business's trading name",
  "business": "one sentence describing what the business is",
  "location": "the city or region it serves, or \\"\\" if it is not a local business",
  "services": ["up to 6 services it offers"],
  "questions": [{ "question": "...", "topic": "one of the services above" }]
}

Write exactly ${MAX_QUESTIONS} questions. Each is something a prospective customer would type into ChatGPT or Gemini while choosing a provider in this category: how to choose, what it costs, what to look for, how options compare, who is best near them.

Rules:
- Never name this business, its brand, or its domain in a question.
- If the business serves a local area, put the location into the questions a local buyer would localise.
- Spread the questions across the services.
- Plain questions, as a person would type them. No numbering.`;
}

/** Pulls the first JSON object out of a reply that may carry prose or a fence. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function newId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export async function loadQuestions(domain: string): Promise<AiQuestionSet | null> {
  return readJson<AiQuestionSet | null>(aiQuestionsPath(domain), null);
}

async function saveQuestions(set: AiQuestionSet) {
  await writeJson(aiQuestionsPath(set.domain), set);
}

/**
 * Researches the business and replaces the question set.
 *
 * Replacing rather than appending: a regeneration usually follows a wrong
 * reading of the business, and mixing the corrected questions with the ones
 * built on the mistake would leave half the tracking about the wrong thing.
 */
export async function generateQuestions(
  domain: string,
  clientName?: string,
): Promise<AiQuestionSet | { error: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { error: 'Gemini is not configured. Set GEMINI_API_KEY in the server environment and restart.' };
  }

  let parsed: {
    name?: string;
    business?: string;
    location?: string;
    services?: unknown[];
    questions?: { question?: unknown; topic?: unknown }[];
  };
  try {
    const answer = await askGeminiGrounded(prompt(bareDomain(domain)), apiKey);
    parsed = extractJson(answer.text) as typeof parsed;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Question generation failed.' };
  }

  const services = (parsed.services ?? [])
    .map((service) => String(service).trim())
    .filter(Boolean)
    .slice(0, 6);

  const terms = brandTerms(domain, [clientName, parsed.name]);
  const named = (question: string) =>
    terms.some((term) => question.toLowerCase().includes(term.toLowerCase()));

  const seen = new Set<string>();
  const now = new Date().toISOString();
  const questions: AiQuestion[] = [];
  for (const entry of parsed.questions ?? []) {
    const question = String(entry.question ?? '').trim().replace(/^\d+[.)]\s*/, '');
    const key = question.toLowerCase();
    // Too short to be a real question, a duplicate, or one that names the client.
    if (question.length < 12 || seen.has(key) || named(question)) continue;
    seen.add(key);
    questions.push({
      id: newId(),
      question: question.slice(0, 240),
      topic: String(entry.topic ?? '').trim() || services[0] || 'General',
      addedAt: now,
    });
    if (questions.length >= MAX_QUESTIONS) break;
  }

  if (questions.length === 0) {
    return { error: 'The model returned no usable questions. Try again.' };
  }

  const set: AiQuestionSet = {
    domain,
    business: String(parsed.business ?? '').trim() || 'Not identified',
    services,
    location: String(parsed.location ?? '').trim() || undefined,
    generatedAt: now,
    model: geminiModel(),
    questions,
  };
  await saveQuestions(set);
  return set;
}

/** Drops one question — a bad generation should not need a full regenerate. */
export async function removeQuestion(domain: string, id: string) {
  const set = await loadQuestions(domain);
  if (!set) return null;
  const next = { ...set, questions: set.questions.filter((question) => question.id !== id) };
  await saveQuestions(next);
  return next;
}
