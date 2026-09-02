import type { ProviderStatus } from '../env';
import { getGa4Report, ga4FailureReason, isGa4Failure, type Ga4Report } from './ga4';

/**
 * Website traffic, in the shape the dashboard's other provider reports use.
 *
 * This is a thin adapter over `getGa4Report` so pages and panels do not each
 * re-derive provider status from a `Ga4Failure` union.
 *
 * One deliberate difference from the backlinks / keywords / ads adapters: there
 * is **no seeded fallback**. Those three generate plausible data when their
 * provider is absent, and label it. Traffic does not, because the dashboard is
 * now bound to a named client and these figures flow into a client-facing PDF —
 * inventing "1,420 sessions" for a real agency report is a materially different
 * risk from showing a demo backlink count. When GA4 is unreachable the panels
 * render an empty state carrying the exact fix instead.
 */

export type TrafficReport = {
  domain: string;
  rangeDays: number;
  provider: ProviderStatus;
  /** Null whenever GA4 is unreachable; `provider.note` explains why. */
  data: Ga4Report | null;
};

export async function getTrafficReport(
  domain: string,
  rangeDays = 30,
  window?: { from: string; to: string },
): Promise<TrafficReport> {
  const result = await getGa4Report(domain, { windowDays: rangeDays, window }).catch(
    (error: unknown) => ({ kind: 'error' as const, detail: String(error).slice(0, 200) }),
  );

  if (isGa4Failure(result)) {
    return {
      domain,
      rangeDays,
      provider: { mode: 'seed', provider: 'GA4', note: ga4FailureReason(result) },
      data: null,
    };
  }

  return {
    domain,
    rangeDays,
    provider: { mode: 'live', provider: `GA4 · ${result.propertyName}`, note: '' },
    data: result,
  };
}

/*
 * Re-exported from the pure stats module so server components can keep
 * importing it from here, while `'use client'` code imports `@/lib/stats`
 * directly and avoids pulling this provider (and `node:fs`) into the browser
 * bundle.
 */
export { halfOverHalfDelta } from '../stats';
