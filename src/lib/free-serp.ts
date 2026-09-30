/**
 * A rank check that reads real Google results.
 *
 * The first version fetched google.com/search directly and parsed the HTML.
 * That stopped working: to a plain server-side fetch Google now returns a
 * consent interstitial or JS-rendered markup with no static results, so the
 * parser found nothing and every check failed with "no readable organic
 * results". Scraping Google without a headless browser and residential IPs is
 * a losing game, and any non-Google engine gives positions that are not the
 * ones the client is asking about.
 *
 * So this calls Serper.dev — a Google SERP API: it runs the search on real
 * Google and returns the organic results as JSON, including the "local pack"
 * for place-based queries like "senior care in Ann Arbor, MI". 2,500 searches
 * are free. One key, one request, accurate Google positions.
 */

const TIMEOUT_MS = 12_000;

export type FreeSerpMatch = {
  keyword: string;
  /** 1-based organic position on Google, or null when the domain is absent. */
  position: number | null;
  url?: string;
  /** True when the domain appears in Google's local pack for the query. */
  inLocalPack?: boolean;
};

export function serperConfigured() {
  return Boolean(process.env.SERPER_API_KEY?.trim());
}

function bareHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matchesDomain(link: string, domain: string) {
  const host = bareHost(link);
  const wanted = domain.toLowerCase().replace(/^www\./, '');
  return host === wanted || host.endsWith(`.${wanted}`);
}

type SerperResponse = {
  organic?: { link?: string; position?: number }[];
  places?: { title?: string; website?: string }[];
};

/**
 * One live Google lookup via Serper.
 *
 * `location` is a plain place string ("Ann Arbor, Michigan, United States")
 * that Serper geolocates the search from — this is what makes a local query
 * return the ranks a searcher in that city actually sees, rather than a
 * national average.
 */
export async function checkGoogleRank(
  keyword: string,
  domain: string,
  options: { country?: string; location?: string } = {},
): Promise<FreeSerpMatch> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Rank checks need a Google SERP key. Set SERPER_API_KEY in the environment.');
  }

  const payload: Record<string, unknown> = {
    q: keyword,
    gl: (options.country ?? 'us').toLowerCase().slice(0, 2),
    hl: 'en',
    num: 100,
  };
  if (options.location?.trim()) payload.location = options.location.trim();

  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('The Google SERP key was rejected. Check SERPER_API_KEY.');
  }
  if (response.status === 429) {
    throw new Error('Google SERP quota reached for now. Try again later.');
  }
  if (!response.ok) throw new Error(`Google lookup failed (HTTP ${response.status}).`);

  const data = (await response.json()) as SerperResponse;

  /*
   * Trust Serper's own `position` when it sends one — it reflects Google's
   * ordering including features the array index would miss — and fall back to
   * the array order otherwise.
   */
  const organic = data.organic ?? [];
  let position: number | null = null;
  let url: string | undefined;
  for (let index = 0; index < organic.length; index += 1) {
    const link = organic[index].link ?? '';
    if (matchesDomain(link, domain)) {
      position = organic[index].position ?? index + 1;
      url = link;
      break;
    }
  }

  const inLocalPack = (data.places ?? []).some((place) =>
    place.website ? matchesDomain(place.website, domain) : false,
  );

  return { keyword, position, url, inLocalPack };
}
