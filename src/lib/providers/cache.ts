/**
 * Short-lived in-process cache for provider calls.
 *
 * Every dashboard page is `force-dynamic`, so without this a single click can
 * fire a dozen external API calls — the Google Ads report alone is 6 GAQL
 * queries, which is what made /google-ads and /budget-alerts take ~2s each.
 *
 * Two behaviours matter:
 *  - **TTL**, so clicking between pages reuses one fetch. Kept short because
 *    this data is operational; upstream reporting lag is hours anyway, so a
 *    minute of staleness is invisible while removing all the latency.
 *  - **In-flight de-duplication**: the *promise* is cached, not just the value.
 *    The overview page requests ads, keyword and backlink reports at once, and
 *    several components can ask for the same report in the same tick — they
 *    should share one request rather than race.
 *
 * Process-local by design: it is a latency cache, not a source of truth, and it
 * disappears on restart. A multi-instance deployment would want Redis here.
 */

type Entry = { at: number; promise: Promise<unknown> };

const store = new Map<string, Entry>();

export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) {
    return hit.promise as Promise<T>;
  }

  const promise = load();
  store.set(key, { at: Date.now(), promise });

  try {
    return await promise;
  } catch (error) {
    // A failed call must not be cached, or one blip persists for the whole TTL
    // and the fallback note sticks around after the problem is fixed.
    if (store.get(key)?.promise === promise) store.delete(key);
    throw error;
  }
}

/** Drop cached entries whose key contains `fragment` — used after a write. */
export function invalidateCache(fragment: string) {
  for (const key of store.keys()) {
    if (key.includes(fragment)) store.delete(key);
  }
}
