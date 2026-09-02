/**
 * Deterministic pseudo-random helpers.
 *
 * Seeded data must be stable for a given (domain, range) pair — otherwise the
 * server render and the client hydration disagree, and every page refresh
 * would invent a different "trend". Everything here is a pure function of its
 * seed string.
 */

export function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, good enough for fixture data. */
export function makeRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = () => number;

export function floatBetween(random: Random, min: number, max: number) {
  return min + random() * (max - min);
}

export function intBetween(random: Random, min: number, max: number) {
  return Math.floor(floatBetween(random, min, max + 1));
}

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length) % items.length];
}

export function chance(random: Random, probability: number) {
  return random() < probability;
}

/** Midnight UTC today — the anchor every seeded series counts back from. */
export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isoDaysAgo(daysAgo: number) {
  const date = todayUtc();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function isoMonthsAgo(monthsAgo: number) {
  const date = todayUtc();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsAgo);
  return date.toISOString().slice(0, 10);
}

/** Smooth-ish walk with a drift term, clamped to [min, max]. */
export function walk(
  random: Random,
  options: { start: number; steps: number; drift: number; volatility: number; min?: number; max?: number },
) {
  const { start, steps, drift, volatility } = options;
  const min = options.min ?? 0;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  const series: number[] = [];
  let value = start;
  for (let i = 0; i < steps; i += 1) {
    value += drift + (random() - 0.5) * volatility;
    value = Math.min(max, Math.max(min, value));
    series.push(value);
  }
  return series;
}
