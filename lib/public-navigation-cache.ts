/** A small in-isolate cache for public, non-personal navigation rows.
 * In-flight deduplication prevents parallel page renders issuing the same D1 read.
 * Invalidating during a read prevents that old result from repopulating the cache.
 */
export function createShortLivedAsyncCache<T>(ttlMs: number, now: () => number = Date.now) {
  let cached: T | undefined;
  let hasCached = false;
  let expiresAt = 0;
  let pending: Promise<T> | null = null;
  let generation = 0;

  return {
    get(load: () => Promise<T>): Promise<T> {
      if (hasCached && now() < expiresAt) return Promise.resolve(cached as T);
      if (pending) return pending;
      const startedInGeneration = generation;
      const operation = load();
      const tracked = operation.then(
        (value) => {
          if (generation === startedInGeneration) {
            cached = value;
            hasCached = true;
            expiresAt = now() + ttlMs;
          }
          if (pending === tracked) pending = null;
          return value;
        },
        (error) => {
          if (pending === tracked) pending = null;
          throw error;
        },
      );
      pending = tracked;
      return tracked;
    },
    invalidate() {
      generation += 1;
      hasCached = false;
      cached = undefined;
      expiresAt = 0;
      pending = null;
    },
  };
}
