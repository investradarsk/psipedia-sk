/**
 * Candidate decision CAS + durable D1 history. The 0137 migration is a
 * mandatory fail-closed deployment prerequisite for these mutations.
 * R2 and Notion are deliberately outside the D1 transaction.
 */
export type ReviewCandidateIdentity = {
  id: number;
  entityType: "DIRECTORY_PROFILE" | "MANAGED_EVENT";
  entityId: number;
  status: string;
  activeImageKey: string | null;
  candidateImageKey: string | null;
  candidateImageUrl: string | null;
  candidateContentHash: string | null;
};

export type MediaDecisionHistory = {
  id: string; monitor_id: number; entity_type: string; entity_id: number;
  candidate_image_key: string; candidate_image_url: string;
  candidate_content_hash: string | null; action: string;
  reason: string | null; actor_ref: string; decided_at: string; outcome: string;
};

export function validateMediaReviewReason(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Array.from(value).length > 500) {
    throw new Error("Dôvod zamietnutia musí byť text s najviac 500 znakmi.");
  }
  return value;
}

export async function assertMediaReviewSchema(database: D1Database) {
  // A partially applied 0137 must fail closed. Checking only for the history
  // table is insufficient: without the finalization trigger, a failed CAS
  // could leave a canonical image change without a corresponding decision.
  const requiredObjects = new Set([
    "media_source_review_decisions",
    "media_review_decision_finalization_guard",
    "media_review_decisions_no_update",
    "media_review_decisions_no_delete",
    "media_review_decisions_monitor_time_idx",
    "media_review_claims_idx",
  ]);
  const objects = await database.prepare(`
    SELECT name FROM sqlite_master
    WHERE name IN (
      'media_source_review_decisions',
      'media_review_decision_finalization_guard',
      'media_review_decisions_no_update',
      'media_review_decisions_no_delete',
      'media_review_decisions_monitor_time_idx',
      'media_review_claims_idx'
    )
  `).all<{ name: string }>();
  const monitorColumns = await database.prepare(
    "PRAGMA table_info(media_source_monitors)",
  ).all<{ name: string }>();
  const existingObjects = new Set((objects.results ?? []).map((row) => row.name));
  const existingColumns = new Set((monitorColumns.results ?? []).map((row) => row.name));
  if ([...requiredObjects].some((name) => !existingObjects.has(name)) ||
      !existingColumns.has("review_claim_token") ||
      !existingColumns.has("review_claimed_at")) {
    throw new Error("Schvaľovanie obrázkov čaká na kompletnú D1 migráciu 0137.");
  }
}

export async function claimMediaCandidate(
  database: D1Database,
  row: ReviewCandidateIdentity,
  now: string,
): Promise<string> {
  await assertMediaReviewSchema(database);
  if (!row.candidateImageKey || !row.candidateImageUrl ||
      !["CANDIDATE", "CHANGED"].includes(row.status)) {
    throw new Error("Obrázok už nie je pripravený na kontrolu.");
  }
  const token = crypto.randomUUID();
  const result = await database.prepare(`
    UPDATE media_source_monitors SET review_claim_token=?, review_claimed_at=?
    WHERE id=? AND review_claim_token IS NULL
      AND status IN ('CANDIDATE','CHANGED')
      AND entity_type=? AND entity_id=?
      AND candidate_image_key=? AND candidate_image_url=?
      AND candidate_content_hash IS ? AND active_image_key IS ?
  `).bind(token, now, row.id, row.entityType, row.entityId,
    row.candidateImageKey, row.candidateImageUrl, row.candidateContentHash, row.activeImageKey).run();
  if (result.meta.changes !== 1) {
    throw new Error("Konflikt: kandidát obrázka sa zmenil alebo sa už spracúva. Obnov údaje.");
  }
  return token;
}

export async function releaseMediaCandidateClaim(database: D1Database, monitorId: number, token: string) {
  await database.prepare(
    "UPDATE media_source_monitors SET review_claim_token=NULL, review_claimed_at=NULL WHERE id=? AND review_claim_token=?",
  ).bind(monitorId, token).run();
}

type FinalizeInput = {
  database: D1Database; row: ReviewCandidateIdentity; token: string;
  actorRef: string; now: string;
};

export async function finalizeRejectedMediaCandidate(
  input: FinalizeInput & { reason: string | null; marker: string | null; issueStartedAt: string },
) {
  const { database, row, now, token } = input;
  const results = await database.batch([
    database.prepare(`
      UPDATE media_source_monitors SET
        source_image_url=NULL, source_content_hash=NULL, status='UNTRACKED',
        candidate_image_url=NULL, candidate_image_key=NULL, candidate_content_hash=NULL,
        last_http_status=NULL, last_checked_at=NULL, issue_started_at=?,
        last_error=?, updated_at=?, review_claim_token=NULL, review_claimed_at=NULL
      WHERE id=? AND review_claim_token=? AND candidate_image_key=?
        AND candidate_image_url=? AND candidate_content_hash IS ?
    `).bind(input.issueStartedAt, input.marker, now, row.id, token,
      row.candidateImageKey, row.candidateImageUrl, row.candidateContentHash),
    database.prepare(`
      INSERT INTO media_source_review_decisions (
        id, monitor_id, entity_type, entity_id, candidate_image_key,
        candidate_image_url, candidate_content_hash, action, reason,
        actor_ref, decided_at, outcome
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'reject', ?, ?, ?, 'APPLIED')
    `).bind(crypto.randomUUID(), row.id, row.entityType, row.entityId,
      row.candidateImageKey, row.candidateImageUrl, row.candidateContentHash,
      input.reason, input.actorRef.slice(0, 200), now),
  ]);
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
    throw new Error("Konflikt: rozhodnutie sa nepodarilo bezpečne zapísať.");
  }
}

export async function finalizeAcceptedMediaCandidate(
  input: FinalizeInput & { newImageKey: string; oldImageKey: string | null; rejectedMarker: string | null },
) {
  const { database, row, now, token } = input;
  const table = row.entityType === "MANAGED_EVENT" ? "managed_events" : "directory_profiles";
  // Only these two statically selected table names can enter the query.
  const results = await database.batch([
    database.prepare(`
      UPDATE ${table} SET image_url=?, image_key=?, updated_at=?, updated_by=?
      WHERE id=? AND image_key IS ?
        AND EXISTS (SELECT 1 FROM media_source_monitors
          WHERE id=? AND review_claim_token=? AND candidate_image_key=?)
    `).bind(`/media/${input.newImageKey}`, input.newImageKey, now,
      input.actorRef, row.entityId, input.oldImageKey, row.id, token, row.candidateImageKey),
    database.prepare(`
      UPDATE media_source_monitors
      SET source_image_url=?, source_content_hash=?, active_image_key=?,
          status='OK', candidate_image_url=NULL, candidate_image_key=NULL,
          candidate_content_hash=NULL, last_http_status=200, last_checked_at=?,
          issue_started_at=NULL, last_error=?, updated_at=?,
          review_claim_token=NULL, review_claimed_at=NULL
      WHERE id=? AND review_claim_token=? AND candidate_image_key=?
        AND candidate_image_url=? AND candidate_content_hash IS ?
        AND EXISTS (SELECT 1 FROM ${table} WHERE id=? AND image_key=?)
    `).bind(row.candidateImageUrl, row.candidateContentHash, input.newImageKey,
      now, input.rejectedMarker, now, row.id, token, row.candidateImageKey,
      row.candidateImageUrl, row.candidateContentHash, row.entityId, input.newImageKey),
    database.prepare(`
      INSERT INTO media_source_review_decisions (
        id, monitor_id, entity_type, entity_id, candidate_image_key,
        candidate_image_url, candidate_content_hash, action, reason,
        actor_ref, decided_at, outcome
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'accept', NULL, ?, ?, 'APPLIED')
    `).bind(crypto.randomUUID(), row.id, row.entityType, row.entityId,
      row.candidateImageKey, row.candidateImageUrl, row.candidateContentHash,
      input.actorRef.slice(0, 200), now),
  ]);
  if (results.some((result) => result.meta.changes !== 1)) {
    throw new Error("Konflikt: obrázok bol medzičasom upravený. Obnov údaje.");
  }
}

export async function listMediaReviewHistory(database: D1Database, monitorId: number) {
  await assertMediaReviewSchema(database);
  const results = await database.prepare(`
    SELECT id, monitor_id, entity_type, entity_id, candidate_image_key,
      candidate_image_url, candidate_content_hash, action, reason, actor_ref,
      decided_at, outcome
    FROM media_source_review_decisions WHERE monitor_id=?
    ORDER BY decided_at DESC, id DESC LIMIT 50
  `).bind(monitorId).all<MediaDecisionHistory>();
  return results.results ?? [];
}
