import { providerIdsFor } from '../client-config';
import { getGoogleAccessToken } from './googleAuth';

/**
 * Google Business Profile — reviews.
 *
 * Three API families are involved, and the split is not obvious:
 *   • Account Management  (mybusinessaccountmanagement.googleapis.com/v1)
 *       — which accounts the signed-in user manages.
 *   • Business Information (mybusinessbusinessinformation.googleapis.com/v1)
 *       — the locations under an account.
 *   • Reviews              (mybusiness.googleapis.com/v4)
 *       — reviews and replies. Reviews were never migrated to the v1 API
 *         family, so this one legacy endpoint is still the only way to read or
 *         answer them.
 *
 * Access is gated twice over, which is why this adapter reports its failures so
 * specifically:
 *   1. The `business.manage` OAuth scope must be granted.
 *   2. **The Google Cloud project must be allowlisted by Google.** Unlike GA4 or
 *      Search Console, enabling the API is not enough — Business Profile access
 *      requires an approved application, and until it is granted every call
 *      returns 403 with "has not been used in project" or a PERMISSION_DENIED.
 *      No amount of code works around that.
 */

const ACCOUNTS_ROOT = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFO_ROOT = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_ROOT = 'https://mybusiness.googleapis.com/v4';

/* 5 minutes — see the note in providers/ads.ts. */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export type GmbFailure =
  | { kind: 'not-connected' }
  | { kind: 'scope-missing' }
  /** The project is not allowlisted, or the API is not enabled. */
  | { kind: 'not-allowlisted'; detail: string }
  | { kind: 'no-account'; detail: string }
  | { kind: 'no-location'; detail: string }
  | { kind: 'error'; detail: string };

export type GmbLocation = {
  /** Full resource name, `accounts/{a}/locations/{l}` — required for reviews. */
  name: string;
  locationId: string;
  accountName: string;
  title: string;
  storeCode?: string;
};

export type GmbReview = {
  /** Full resource name, needed to post a reply. */
  name: string;
  reviewId: string;
  reviewer: string;
  /** 1–5. Google returns an enum (`FIVE`); this is the numeric form. */
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
  reply?: { comment: string; updatedAt: string };
};

export type GmbReviewsReport = {
  location: GmbLocation;
  /** Other locations found, so the UI can offer a switch. */
  otherLocations: GmbLocation[];
  reviews: GmbReview[];
  summary: {
    total: number;
    averageRating: number;
    /** Index 0 = 1 star … index 4 = 5 stars. */
    distribution: number[];
    replied: number;
    unreplied: number;
    /** Unreplied reviews at 3 stars or below — the queue that actually matters. */
    urgentUnreplied: number;
    /** Share of reviews with a reply, 0–100 per app convention. */
    responseRate: number;
  };
};

const RATING_WORD: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function isFailure(value: unknown): value is GmbFailure {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

/**
 * Maps an HTTP failure onto the specific thing the operator has to do. The
 * allowlist case is separated from a plain scope problem because they are
 * weeks apart in effort.
 */
function classify(status: number, body: string): GmbFailure {
  const lower = body.toLowerCase();

  if (status === 401) return { kind: 'not-connected' };
  if (status === 403 || status === 429) {
    if (
      lower.includes('has not been used') ||
      lower.includes('is disabled') ||
      lower.includes('accessnotconfigured') ||
      lower.includes('quota') ||
      lower.includes('project')
    ) {
      return { kind: 'not-allowlisted', detail: body.slice(0, 300) };
    }
    if (lower.includes('scope') || lower.includes('insufficient')) {
      return { kind: 'scope-missing' };
    }
    return { kind: 'not-allowlisted', detail: body.slice(0, 300) };
  }
  if (status === 404) {
    return { kind: 'no-location', detail: 'The configured location was not found.' };
  }
  return { kind: 'error', detail: `${status}: ${body.slice(0, 200)}` };
}

async function apiGet(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw classify(response.status, await response.text());
  return response.json();
}

/** Locations the connected account manages, across every account it can see. */
export async function listGmbLocations(): Promise<GmbLocation[] | GmbFailure> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  try {
    return await cached('gmb:locations', async () => {
      const accounts = (await apiGet(`${ACCOUNTS_ROOT}/accounts?pageSize=20`, accessToken)) as {
        accounts?: { name?: string; accountName?: string }[];
      };

      const out: GmbLocation[] = [];
      for (const account of accounts.accounts ?? []) {
        if (!account.name) continue;

        // `readMask` is mandatory on this endpoint — omitting it is a 400.
        const locations = (await apiGet(
          `${INFO_ROOT}/${account.name}/locations?pageSize=100&readMask=name,title,storeCode`,
          accessToken,
        )) as { locations?: { name?: string; title?: string; storeCode?: string }[] };

        for (const location of locations.locations ?? []) {
          // Comes back as "locations/{id}"; reviews need the account-scoped form.
          const locationId = (location.name ?? '').split('/').pop() ?? '';
          if (!locationId) continue;
          out.push({
            name: `${account.name}/locations/${locationId}`,
            locationId,
            accountName: account.accountName ?? account.name,
            title: location.title ?? locationId,
            storeCode: location.storeCode,
          });
        }
      }
      return out;
    });
  } catch (error) {
    return isFailure(error) ? error : { kind: 'error', detail: String(error).slice(0, 200) };
  }
}

/**
 * Picks the location to report on.
 *
 * `GMB_LOCATION_ID` wins when set. Otherwise a title resembling the domain is
 * preferred, then a lone location. Deliberately does NOT guess between several
 * unrelated locations — replying to the wrong business's reviews is not a
 * recoverable mistake.
 */
async function resolveLocation(domain: string): Promise<
  { location: GmbLocation; others: GmbLocation[] } | GmbFailure
> {
  const locations = await listGmbLocations();
  if (isFailure(locations)) return locations;
  if (locations.length === 0) {
    return {
      kind: 'no-account',
      detail: 'The connected Google account manages no Business Profile locations.',
    };
  }

  // Per client, for the same reason GA4 and Ads are: one global location id
  // would answer every client with the first client's reviews.
  const ids = await providerIdsFor(domain);
  const override = ids.gmbLocationId;
  if (override) {
    const id = override.split('/').pop();
    const match = locations.find((location) => location.locationId === id);
    if (match) {
      return { location: match, others: locations.filter((l) => l !== match) };
    }
    return {
      kind: 'no-location',
      detail: `The location id configured for ${domain} (${override}) is not among the ${locations.length} locations this account manages.`,
    };
  }

  if (locations.length === 1) return { location: locations[0], others: [] };

  if (ids.multiClient) {
    return {
      kind: 'no-location',
      detail: `Several clients are saved, so a location is not guessed from the business name. Set the Business Profile location ID for ${domain} under Settings → Client integrations.`,
    };
  }

  const label = domain.replace(/^www\./, '').split('.')[0].toLowerCase();
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = locations.find(
    (location) => squash(location.title).includes(label) || label.includes(squash(location.title)),
  );

  if (match) return { location: match, others: locations.filter((l) => l !== match) };

  return {
    kind: 'no-location',
    detail: `This account manages ${locations.length} locations and none clearly matches ${domain}. Set GMB_LOCATION_ID to choose one.`,
  };
}

export async function getGmbReviews(
  domain: string,
  options: { limit?: number } = {},
): Promise<GmbReviewsReport | GmbFailure> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  const resolved = await resolveLocation(domain);
  if (isFailure(resolved)) return resolved;

  const limit = options.limit ?? 50;

  try {
    return await cached(`gmb:reviews:${resolved.location.name}:${limit}`, async () => {
      const payload = (await apiGet(
        `${REVIEWS_ROOT}/${resolved.location.name}/reviews?pageSize=${limit}&orderBy=updateTime desc`,
        accessToken,
      )) as {
        reviews?: {
          name?: string;
          reviewId?: string;
          reviewer?: { displayName?: string };
          starRating?: string;
          comment?: string;
          createTime?: string;
          updateTime?: string;
          reviewReply?: { comment?: string; updateTime?: string };
        }[];
        averageRating?: number;
        totalReviewCount?: number;
      };

      const reviews: GmbReview[] = (payload.reviews ?? []).map((review) => ({
        name: review.name ?? '',
        reviewId: review.reviewId ?? (review.name ?? '').split('/').pop() ?? '',
        reviewer: review.reviewer?.displayName?.trim() || 'A Google user',
        rating: RATING_WORD[review.starRating ?? ''] ?? 0,
        comment: review.comment?.trim() ?? '',
        createdAt: review.createTime ?? '',
        updatedAt: review.updateTime ?? '',
        reply: review.reviewReply?.comment
          ? {
              comment: review.reviewReply.comment,
              updatedAt: review.reviewReply.updateTime ?? '',
            }
          : undefined,
      }));

      const distribution = [0, 0, 0, 0, 0];
      for (const review of reviews) {
        if (review.rating >= 1 && review.rating <= 5) distribution[review.rating - 1] += 1;
      }

      const replied = reviews.filter((review) => review.reply).length;
      const rated = reviews.filter((review) => review.rating > 0);

      return {
        location: resolved.location,
        otherLocations: resolved.others,
        reviews,
        summary: {
          // `totalReviewCount` covers the whole profile; `reviews.length` is the
          // page fetched. Both are reported so neither is mistaken for the other.
          total: payload.totalReviewCount ?? reviews.length,
          averageRating:
            payload.averageRating ??
            (rated.length > 0
              ? Number(
                  (
                    rated.reduce((sum, review) => sum + review.rating, 0) / rated.length
                  ).toFixed(2),
                )
              : 0),
          distribution,
          replied,
          unreplied: reviews.length - replied,
          urgentUnreplied: reviews.filter(
            (review) => !review.reply && review.rating > 0 && review.rating <= 3,
          ).length,
          responseRate:
            reviews.length > 0 ? Number(((replied / reviews.length) * 100).toFixed(1)) : 0,
        },
      };
    });
  } catch (error) {
    return isFailure(error) ? error : { kind: 'error', detail: String(error).slice(0, 200) };
  }
}

/**
 * Publishes a reply to one review.
 *
 * This writes to a public Google listing under the client's name, so it is only
 * ever called from an explicit user action — never from a rule evaluation. The
 * automation layer drafts text; a person presses publish.
 */
export async function replyToGmbReview(
  reviewName: string,
  comment: string,
): Promise<{ ok: true } | GmbFailure> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) return { kind: 'not-connected' };

  const trimmed = comment.trim();
  if (!trimmed) return { kind: 'error', detail: 'A reply cannot be empty.' };
  if (trimmed.length > 4096) {
    return { kind: 'error', detail: 'Google caps a review reply at 4096 characters.' };
  }

  try {
    const response = await fetch(`${REVIEWS_ROOT}/${reviewName}/reply`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ comment: trimmed }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return classify(response.status, await response.text());

    // The reviews cache would otherwise keep showing this review as unreplied.
    for (const key of [...cache.keys()]) {
      if (key.startsWith('gmb:reviews:')) cache.delete(key);
    }
    return { ok: true };
  } catch (error) {
    return { kind: 'error', detail: String(error).slice(0, 200) };
  }
}

export function gmbFailureReason(failure: GmbFailure) {
  switch (failure.kind) {
    case 'not-connected':
      return 'Google account is not connected. Connect it in Settings first.';
    case 'scope-missing':
      return 'The Google connection lacks the Business Profile scope. Reconnect Google in Settings to grant it.';
    case 'not-allowlisted':
      return 'Google has not granted this project access to the Business Profile API. Unlike the other integrations, enabling the API is not enough — access must be requested and approved by Google, which typically takes days to weeks.';
    case 'no-account':
      return failure.detail;
    case 'no-location':
      return failure.detail;
    default:
      return `Business Profile request failed — ${failure.detail}`;
  }
}

export function isGmbFailure(
  value: GmbReviewsReport | GmbFailure | { ok: true },
): value is GmbFailure {
  return 'kind' in value;
}
