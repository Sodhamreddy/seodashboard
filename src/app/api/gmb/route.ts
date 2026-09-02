import { NextResponse } from 'next/server';
import { getActiveDomain } from '@/lib/domain';
import { getGmbReviews, isGmbFailure, replyToGmbReview } from '@/lib/providers/gmb';
import { loadGmbRules, saveGmbRules, type GmbRules } from '@/lib/providers/gmb-automation';

export const runtime = 'nodejs';

/** Saves the reply templates for the active domain. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { rules?: GmbRules };
  if (!body.rules || !Array.isArray(body.rules.templates)) {
    return NextResponse.json({ error: 'A rules object with templates is required.' }, { status: 400 });
  }

  const domain = getActiveDomain();
  await saveGmbRules(domain, body.rules);
  return NextResponse.json({ ok: true, rules: await loadGmbRules(domain, body.rules.businessName) });
}

/**
 * Publishes one reply to Google.
 *
 * Separate verb from the rules save, and it takes the review's full resource
 * name rather than an index, so a stale UI cannot post a reply to the wrong
 * review after the list has been refetched.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    reviewName?: string;
    comment?: string;
  };

  if (!body.reviewName || !body.comment) {
    return NextResponse.json(
      { error: 'Both reviewName and comment are required.' },
      { status: 400 },
    );
  }

  // Guard against replying to a review that already has one: the API would
  // silently overwrite the published text.
  const domain = getActiveDomain();
  const report = await getGmbReviews(domain);
  if (!isGmbFailure(report)) {
    const target = report.reviews.find((review) => review.name === body.reviewName);
    if (!target) {
      return NextResponse.json(
        { error: 'That review is no longer in the current list — reload and try again.' },
        { status: 409 },
      );
    }
    if (target.reply) {
      return NextResponse.json(
        { error: 'That review already has a published reply. Edit it in Google Business Profile.' },
        { status: 409 },
      );
    }
  }

  const result = await replyToGmbReview(body.reviewName, String(body.comment));
  if (isGmbFailure(result)) {
    return NextResponse.json({ error: result.kind, detail: result }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
