import { gscStatus, type ProviderStatus } from '../env';
import { getGoogleAccessToken } from './googleAuth';

export type SubmissionResult = {
  ok: boolean;
  mode: 'live' | 'simulated';
  siteUrl: string;
  sitemapUrl: string;
  message: string;
  submittedAt: string;
};

/**
 * A bearer token for Search Console.
 *
 * The connected Google account wins over GSC_ACCESS_TOKEN: the OAuth refresh
 * token keeps working, whereas a pasted access token dies after an hour.
 */
async function resolveToken(): Promise<string | null> {
  const connected = await getGoogleAccessToken();
  if (connected) return connected;
  return process.env.GSC_ACCESS_TOKEN?.trim() || null;
}

/**
 * Whether Search Console is actually usable right now.
 *
 * `gscStatus()` in env.ts can only see environment variables, so it reports
 * "simulated" even when a Google account is connected through the UI. This is
 * the async version the pages should use.
 */
export async function gscReadiness(): Promise<ProviderStatus> {
  const token = await resolveToken();
  const site = process.env.GSC_SITE_URL?.trim();

  if (token && site) {
    return {
      mode: 'live',
      provider: 'Search Console',
      note: '',
    };
  }

  const missing = [!token && 'a connected Google account (or GSC_ACCESS_TOKEN)', !site && 'GSC_SITE_URL']
    .filter(Boolean)
    .join(' and ');

  return {
    mode: 'seed',
    provider: 'simulated',
    note: `Sitemap submission runs in simulation mode — still needs ${missing}.`,
  };
}

function resolveSiteUrl(domain: string) {
  const configured = process.env.GSC_SITE_URL?.trim();
  if (configured) return configured;
  return `sc-domain:${domain.replace(/^www\./, '')}`;
}

/**
 * Search Console sitemap submission.
 *
 * Performs the real `PUT /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}`
 * call whenever a token is available — from a Google account connected in
 * Settings, or failing that GSC_ACCESS_TOKEN. With neither it returns a
 * simulated result clearly labelled as such, never a silent no-op.
 */
export async function submitSitemapToSearchConsole(
  domain: string,
  sitemapUrl: string,
): Promise<SubmissionResult> {
  const siteUrl = resolveSiteUrl(domain);
  const submittedAt = new Date().toISOString();
  const token = await resolveToken();

  if (!token) {
    return {
      ok: true,
      mode: 'simulated',
      siteUrl,
      sitemapUrl,
      message:
        'Simulated submission. Connect a Google account in Settings (or set GSC_ACCESS_TOKEN) to submit for real.',
      submittedAt,
    };
  }

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/sitemaps/${encodeURIComponent(sitemapUrl)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok || response.status === 204) {
      return {
        ok: true,
        mode: 'live',
        siteUrl,
        sitemapUrl,
        message: `Submitted to Search Console for ${siteUrl}.`,
        submittedAt,
      };
    }

    const body = await response.text();
    return {
      ok: false,
      mode: 'live',
      siteUrl,
      sitemapUrl,
      message: `Search Console rejected the submission (${response.status}): ${body.slice(0, 300)}`,
      submittedAt,
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'live',
      siteUrl,
      sitemapUrl,
      message: `Search Console request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      submittedAt,
    };
  }
}

export type SubmittedSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  warnings: number;
  errors: number;
  urlCount: number | null;
};

/** Lists sitemaps Search Console already knows about. Live mode only. */
export async function listSearchConsoleSitemaps(
  domain: string,
): Promise<{ mode: 'live' | 'simulated'; sitemaps: SubmittedSitemap[]; note: string }> {
  const token = await resolveToken();
  if (!token) {
    return { mode: 'simulated', sitemaps: [], note: gscStatus().note };
  }

  const siteUrl = resolveSiteUrl(domain);
  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      return { mode: 'live', sitemaps: [], note: `Search Console returned ${response.status}.` };
    }

    const data = (await response.json()) as {
      sitemap?: {
        path?: string;
        lastSubmitted?: string;
        lastDownloaded?: string;
        warnings?: string;
        errors?: string;
        contents?: { submitted?: string }[];
      }[];
    };

    return {
      mode: 'live',
      note: '',
      sitemaps: (data.sitemap ?? []).map((item) => ({
        path: item.path ?? '',
        lastSubmitted: item.lastSubmitted ?? null,
        lastDownloaded: item.lastDownloaded ?? null,
        warnings: Number(item.warnings ?? 0),
        errors: Number(item.errors ?? 0),
        urlCount: item.contents?.[0]?.submitted ? Number(item.contents[0].submitted) : null,
      })),
    };
  } catch (error) {
    return {
      mode: 'live',
      sitemaps: [],
      note: `Search Console request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}
