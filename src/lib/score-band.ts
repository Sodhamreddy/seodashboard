import type { Tone } from '@/components/ui/primitives';

/**
 * Score bands, kept out of `components/ui/data.tsx` on purpose.
 *
 * That module is `'use client'`, so importing this *function* from it into a
 * server component yields a client reference rather than something callable —
 * the failure is a runtime `is not a function` during SSR, not a type error,
 * which is exactly the kind of bug that reaches a page. Components can live
 * behind the client boundary; the pure function both sides call must not.
 */
export const SCORE_BANDS: { min: number; color: string; label: string; tone: Tone }[] = [
  { min: 90, color: 'var(--status-good)', label: 'Excellent', tone: 'good' },
  { min: 75, color: 'var(--seq-400)', label: 'Good', tone: 'accent' },
  { min: 50, color: 'var(--status-serious)', label: 'Needs work', tone: 'serious' },
  { min: 0, color: 'var(--status-critical)', label: 'Critical', tone: 'critical' },
];

export function scoreBand(score: number) {
  return SCORE_BANDS.find((band) => score >= band.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}
