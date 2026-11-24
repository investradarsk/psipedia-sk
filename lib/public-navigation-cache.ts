/** Cache completed public values, never request-owned pending D1 I/O.
 * Cloudflare may cancel the originating request while another request is active.
 * Invalidation and sequencing prevent stale concurrent reads replacing new data.
 */
export function createShortLivedAsyncCache<T>(ttlMs: number, now: () => number = Date.now) {
  let cached: T | undefined;
  let hasCached = false;
  let expiresAt = 0;
  let generation = 0;
  let sequence = 0;
  let lastStoredSequence = 0;

  return {
    async get(load: () => Promise<T>): Promise<T> {
      if (hasCached && now() < expiresAt) return cached as T;
      const startedInGeneration = generation;
      const startedSequence = ++sequence;
      const value = await load();
      if (generation === startedInGeneration && startedSequence >= lastStoredSequence) {
        cached = value;
        hasCached = true;
        expiresAt = now() + ttlMs;
        lastStoredSequence = startedSequence;
      }
      return value;
    },
    invalidate() {
      generation += 1;
      hasCached = false;
      cached = undefined;
      expiresAt = 0;
    },
  };
}
