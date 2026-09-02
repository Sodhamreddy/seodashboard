/**
 * Chart colour slots.
 *
 * This module is deliberately NOT a client module: server components read these
 * values to configure charts, and anything exported from a `'use client'` file
 * crosses the boundary as an opaque client reference rather than a plain value.
 *
 * The three categorical slots are the validated palette's first three, in fixed
 * order. They pass the lightness band, chroma floor, CVD separation,
 * normal-vision and contrast checks in both light and dark mode. Charts cap at
 * three series for that reason — a fourth folds into "Other" or becomes its own
 * chart. Never generate a hue to add a series.
 */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const;

/** Diverging pair for above/below a zero baseline (gained vs lost). */
export const DIVERGING = {
  positive: 'var(--div-pos)',
  negative: 'var(--div-neg)',
  midpoint: 'var(--div-mid)',
} as const;

/** Single-hue sequential ramp for magnitude encoding, light → dark. */
export const SEQUENTIAL = [
  'var(--seq-100)',
  'var(--seq-250)',
  'var(--seq-400)',
  'var(--seq-550)',
  'var(--seq-700)',
] as const;
