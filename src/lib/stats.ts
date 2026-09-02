/**
 * Small pure statistics used on both sides of the client/server boundary.
 *
 * This module exists specifically so a `'use client'` component can compute
 * these without importing a provider module — the provider chain reaches
 * `store.ts` and therefore `node:fs/promises`, which webpack cannot bundle for
 * the browser. Nothing here may import anything with a runtime side effect.
 */

/**
 * Percentage change between the first and second half of a series.
 *
 * Used where only one window of data was fetched, so a true
 * period-over-period comparison is not available. Callers must label it as
 * such — it is not "vs previous 30 days".
 */
export function halfOverHalfDelta(values: number[]) {
  if (values.length < 4) return undefined;
  const mid = Math.floor(values.length / 2);
  const earlier = values.slice(0, mid).reduce((sum, value) => sum + value, 0);
  const later = values.slice(mid).reduce((sum, value) => sum + value, 0);
  if (earlier === 0) return undefined;
  return Number((((later - earlier) / earlier) * 100).toFixed(1));
}
