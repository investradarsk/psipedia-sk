import { hashPii } from "@/lib/pii-crypto";

export type RateLimitResult = { allowed: boolean; count: number; limit: number; resetAt: string };
export type RateLimitStore = { increment(bucketKey: string, windowSeconds: number, now: Date): Promise<{ count: number; resetAt: string }> };

export async function deriveRateLimitKey(namespace: string, rawIdentifier: string, hashKey: string) {
  return `${namespace}:${await hashPii(rawIdentifier.trim().toLowerCase(), hashKey)}`;
}

export async function enforceRateLimit(store: RateLimitStore, bucketKey: string, limit: number, windowSeconds: number, now = new Date()): Promise<RateLimitResult> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid rate limit");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) throw new Error("Invalid rate-limit window");
  const result = await store.increment(bucketKey, windowSeconds, now);
  return { allowed: result.count <= limit, count: result.count, limit, resetAt: result.resetAt };
}

export function createD1RateLimitStore(db: D1Database): RateLimitStore {
  return {
    async increment(bucketKey, windowSeconds, now) {
      const nowIso = now.toISOString();
      const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
      const row = await db.prepare(`
        INSERT INTO security_rate_limits (bucket_key, window_started_at, count, expires_at)
        VALUES (?1, ?2, 1, ?3)
        ON CONFLICT(bucket_key) DO UPDATE SET
          window_started_at = CASE WHEN expires_at <= ?2 THEN ?2 ELSE window_started_at END,
          count = CASE WHEN expires_at <= ?2 THEN 1 ELSE count + 1 END,
          expires_at = CASE WHEN expires_at <= ?2 THEN ?3 ELSE expires_at END
        RETURNING count, expires_at
      `).bind(bucketKey, nowIso, resetAt).first<{ count: number; expires_at: string }>();
      if (!row) throw new Error("Rate-limit persistence failed");
      return { count: Number(row.count), resetAt: row.expires_at };
    },
  };
}
