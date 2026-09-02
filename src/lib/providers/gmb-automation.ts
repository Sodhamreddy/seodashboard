import { gmbRulesPath, readJson, writeJson } from '../store';
import type { GmbReview } from './gmb';

/**
 * Review reply automation.
 *
 * What is automated is the *drafting*, not the publishing. Every draft here is
 * generated locally from a template the operator wrote, and posting it to the
 * client's public Google listing always takes a human action — see the note on
 * `replyToGmbReview`. There is deliberately no "auto-publish" switch: a reply
 * signed by the business, visible to every future customer, and wrong, is not
 * something a rule engine should be able to do unattended.
 *
 * Templates are per-domain JSON under `.data/gmb/`, the same shape as the
 * budget-alert rules.
 */

export type ReplyTemplate = {
  id: string;
  label: string;
  /** Inclusive star range this template covers. */
  minRating: number;
  maxRating: number;
  /**
   * Reply body. Supports `{{reviewer}}`, `{{business}}` and `{{rating}}`.
   * Anything else in double braces is left alone rather than blanked, so a typo
   * is visible instead of silently deleting text.
   */
  body: string;
  /** Only apply when the review text matches, case-insensitive. Optional. */
  keyword?: string;
};

export type GmbRules = {
  domain: string;
  businessName: string;
  templates: ReplyTemplate[];
  /** Draft replies for 4–5 star reviews too, not just the ones that need care. */
  includePositive: boolean;
  updatedAt: string;
};

/**
 * Starting templates.
 *
 * Written to be edited, not used verbatim — a review reply that reads as
 * boilerplate is worse than none. The 1–2 star template deliberately does not
 * apologise for anything specific or admit fault, because a public reply is the
 * wrong venue for either.
 */
const DEFAULT_TEMPLATES: ReplyTemplate[] = [
  {
    id: 't_critical',
    label: '1–2 stars · take it offline',
    minRating: 1,
    maxRating: 2,
    body:
      'Thank you for telling us about this, {{reviewer}}. This is not the standard we hold ourselves to, and we would like to understand what happened. Please contact us directly so we can look into it properly and put things right.',
  },
  {
    id: 't_neutral',
    label: '3 stars · ask what would have helped',
    minRating: 3,
    maxRating: 3,
    body:
      'Thank you for the honest feedback, {{reviewer}}. We would genuinely like to know what would have made your experience better — please get in touch and let us know so we can act on it.',
  },
  {
    id: 't_positive',
    label: '4–5 stars · thank and reinforce',
    minRating: 4,
    maxRating: 5,
    body:
      'Thank you so much, {{reviewer}} — this means a great deal to our team at {{business}}. We are glad we could help, and we are here whenever you need us.',
  },
];

export function defaultRules(domain: string, businessName: string): GmbRules {
  return {
    domain,
    businessName,
    templates: DEFAULT_TEMPLATES,
    includePositive: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadGmbRules(domain: string, businessName: string): Promise<GmbRules> {
  const stored = await readJson<GmbRules | null>(gmbRulesPath(domain), null);
  if (!stored || !Array.isArray(stored.templates) || stored.templates.length === 0) {
    return defaultRules(domain, businessName);
  }
  // The business name follows the resolved location rather than the saved copy,
  // so renaming the listing in Google does not leave stale text in drafts.
  return { ...stored, businessName: businessName || stored.businessName };
}

export async function saveGmbRules(domain: string, rules: GmbRules) {
  await writeJson(gmbRulesPath(domain), { ...rules, domain, updatedAt: new Date().toISOString() });
}

/** Substitutes the supported placeholders, leaving unknown ones visible. */
export function renderTemplate(
  body: string,
  values: { reviewer: string; business: string; rating: number },
) {
  return body
    .replace(/\{\{\s*reviewer\s*\}\}/gi, values.reviewer)
    .replace(/\{\{\s*business\s*\}\}/gi, values.business)
    .replace(/\{\{\s*rating\s*\}\}/gi, String(values.rating));
}

export type ReviewDraft = {
  review: GmbReview;
  /** Null when no template matched, or the review already has a reply. */
  template: ReplyTemplate | null;
  draft: string;
  /** Why this review is in the queue, shown beside the draft. */
  reason: string;
};

/**
 * Pairs unreplied reviews with the template that fits them.
 *
 * A keyword template wins over a plain rating template covering the same stars,
 * because it is the more specific rule. Already-replied reviews are excluded
 * entirely — overwriting a published reply is destructive and this never
 * proposes it.
 */
export function buildDrafts(reviews: GmbReview[], rules: GmbRules): ReviewDraft[] {
  const queue = reviews.filter((review) => !review.reply);

  return queue
    .filter((review) => rules.includePositive || review.rating <= 3)
    .map((review) => {
      const inRange = rules.templates.filter(
        (template) => review.rating >= template.minRating && review.rating <= template.maxRating,
      );

      const keywordMatch = inRange.find(
        (template) =>
          template.keyword &&
          review.comment.toLowerCase().includes(template.keyword.trim().toLowerCase()),
      );
      const template = keywordMatch ?? inRange.find((entry) => !entry.keyword) ?? null;

      return {
        review,
        template,
        draft: template
          ? renderTemplate(template.body, {
              reviewer: review.reviewer,
              business: rules.businessName,
              rating: review.rating,
            })
          : '',
        reason: !template
          ? `No template covers ${review.rating} stars`
          : keywordMatch
            ? `Matched "${keywordMatch.keyword}" in the review text`
            : `${review.rating}-star review, unanswered`,
      };
    })
    .sort((a, b) => {
      // Lowest ratings first: those are the ones costing the business money.
      if (a.review.rating !== b.review.rating) return a.review.rating - b.review.rating;
      return b.review.updatedAt.localeCompare(a.review.updatedAt);
    });
}
