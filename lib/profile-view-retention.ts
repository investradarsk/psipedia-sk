/** Bounded, best-effort cleanup of Psipedia's analytics-only limiter keys. */

const RATE_KEY_GLOB = "public-profile-view-*";
const MAX_PRUNE_ROWS = 128;

/**
 * Sample approximately 1/32 successful views, without another cookie or
 * identifying any user. This is deterministic only for the random event token.
 */
export function shouldPruneProfileViewRateKeys(visitToken: string) {
  const lastByte = Number.parseInt(visitToken.slice(-2), 16);
  return Number.isInteger(lastByte) && lastByte % 32 === 17;
}

/**
 * Uses migration 0167's partial expiry index. Neither full-table scans nor
 * deletions of unrelated security-rate-limit keys are allowed.
 */
export async function pruneExpiredProfileViewRateKeys(
  database: D1Database,
  now = new Date(),
) {
  return database.prepare(`
    DELETE FROM security_rate_limits
    WHERE bucket_key IN (
      SELECT bucket_key
      FROM security_rate_limits INDEXED BY profile_view_rate_expiry_idx
      WHERE bucket_key GLOB '${RATE_KEY_GLOB}'
        AND expires_at < ?
      LIMIT ${MAX_PRUNE_ROWS}
    )
  `).bind(now.toISOString()).run();
}
