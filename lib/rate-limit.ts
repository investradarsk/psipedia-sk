const encoder = new TextEncoder();

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function keyedHash(value: string, hashKey: string) {
  const keyBytes = fromBase64Url(hashKey.trim());
  if (keyBytes.byteLength !== 32) throw new Error("PII_HASH_KEY must be 32 random bytes encoded as base64url");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

export type RateLimitResult = { allowed: boolean; count: number; limit: number; resetAt: string };
export type RateLimitStore = { increment(bucketKey: string, windowSeconds: number, now: Date): Promise<{ count: number; resetAt: string }> };

export async function deriveRateLimitKey(namespace: string, rawIdentifier: string, hashKey: string) {
  return `${namespace}:${await keyedHash(rawIdentifier.trim().toLowerCase(), hashKey)}`;
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
