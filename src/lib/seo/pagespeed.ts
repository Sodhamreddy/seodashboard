import { pageSpeedKey } from '../env';
import type { Vitals } from './score';

type LighthouseAudit = { numericValue?: number };
type PageSpeedResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, LighthouseAudit>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
};

function toScore(value: number | null | undefined) {
  return typeof value === 'number' ? Math.round(value * 100) : null;
}

function round(value: number | undefined) {
  return typeof value === 'number' ? Math.round(value) : null;
}

/**
 * PageSpeed Insights v5. Returns `null` when no key is configured — the score
 * checker then reports lab-free results rather than failing.
 */
export async function fetchVitals(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<{ vitals: Vitals | null; note: string }> {
  const key = pageSpeedKey();
  if (!key) {
    return {
      vitals: null,
      note: 'Core Web Vitals skipped — set PAGESPEED_API_KEY in .env.local to pull real Lighthouse and field data.',
    };
  }

  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  endpoint.searchParams.set('key', key);
  for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) {
    endpoint.searchParams.append('category', category);
  }

  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      // A real site routinely takes 40–90s to analyse; 60s was cutting live
      // runs short and reporting "unavailable" for a key that works fine.
      signal: AbortSignal.timeout(115_000),
    });
    if (!response.ok) {
      return {
        vitals: null,
        note: `PageSpeed Insights returned ${response.status} — showing on-page checks only.`,
      };
    }

    const data = (await response.json()) as PageSpeedResponse;
    const categories = data.lighthouseResult?.categories ?? {};
    const audits = data.lighthouseResult?.audits ?? {};
    const field = data.loadingExperience?.metrics ?? {};

    return {
      vitals: {
        source: 'PageSpeed Insights (Lighthouse lab + CrUX field)',
        strategy,
        performance: toScore(categories.performance?.score),
        seo: toScore(categories.seo?.score),
        accessibility: toScore(categories.accessibility?.score),
        bestPractices: toScore(categories['best-practices']?.score),
        lcpMs: round(
          field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ??
            audits['largest-contentful-paint']?.numericValue,
        ),
        clsScore:
          typeof field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === 'number'
            ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
            : typeof audits['cumulative-layout-shift']?.numericValue === 'number'
              ? Number(audits['cumulative-layout-shift'].numericValue.toFixed(3))
              : null,
        tbtMs: round(audits['total-blocking-time']?.numericValue),
        fcpMs: round(
          field.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? audits['first-contentful-paint']?.numericValue,
        ),
        ttfbMs: round(
          field.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile ??
            audits['server-response-time']?.numericValue,
        ),
      },
      note: '',
    };
  } catch (error) {
    return {
      vitals: null,
      note: `PageSpeed Insights unavailable (${error instanceof Error ? error.message : 'error'}).`,
    };
  }
}
