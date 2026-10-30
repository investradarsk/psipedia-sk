import { transitionAdminDogReportStatus } from "./lost-found-dog-store";
import { syncLostFoundModerationBeforeAdminStatus } from "./lost-found-public-moderation";
import { LOST_FOUND_PUBLIC_SOURCE } from "./lost-found-public-submission";
import { adminAuditActorRef } from "./audit-identity";
import type { HelpSourceEntityType } from "./help-source-daily-check";

export class HelpSourceDecisionConflict extends Error {
  constructor(message = "Profil alebo zdroj sa medzitým zmenil. Obnov stránku a over aktuálny stav.") {
    super(message);
    this.name = "HelpSourceDecisionConflict";
  }
}

/** A human-confirmed lifecycle change, never invoked by the automated source sweep. */
export async function endHelpSourceCase(input: {
  database: D1Database;
  entityType: HelpSourceEntityType;
  entityId: number;
  actorEmail: string;
  requestId: string | null;
  checkedAt: string;
}) {
  const { database: db, entityType, entityId, actorEmail, requestId, checkedAt } = input;
  const checked = await db.prepare(
    "SELECT source_url,last_checked_at FROM help_source_checks WHERE entity_type=? AND entity_id=?",
  ).bind(entityType, entityId).first<{ source_url: string; last_checked_at: string | null }>();
  if (!checked || !checked.last_checked_at || checked.last_checked_at !== checkedAt) {
    throw new HelpSourceDecisionConflict();
  }

  const now = new Date().toISOString();
  if (entityType === "ADOPTION") {
    const existing = await db.prepare(
      "SELECT status,updated_at,external_source_url FROM adoption_dogs WHERE id=?",
    ).bind(entityId).first<{ status: string; updated_at: string; external_source_url: string | null }>();
    if (!existing || !["ACTIVE", "RESERVED"].includes(existing.status)) throw new HelpSourceDecisionConflict();
    if ((existing.external_source_url ?? "").trim() !== checked.source_url) throw new HelpSourceDecisionConflict();
    const changed = await db.prepare(
      "UPDATE adoption_dogs SET status='ADOPTED',last_verified_at=?,updated_at=?,updated_by=?"
      + " WHERE id=? AND updated_at=? AND status IN ('ACTIVE','RESERVED')"
      + " AND EXISTS (SELECT 1 FROM help_source_checks WHERE entity_type='ADOPTION'"
      + " AND entity_id=? AND last_checked_at=? AND source_url=?)",
    ).bind(now, now, actorEmail, entityId, existing.updated_at, entityId, checkedAt, checked.source_url).run();
    if ((changed.meta?.changes ?? 0) !== 1) throw new HelpSourceDecisionConflict();
    return "ADOPTED" as const;
  }

  const existing = await db.prepare(
    "SELECT status,updated_at,source_url,source FROM lost_found_dog_reports WHERE id=?",
  ).bind(entityId).first<{
    status: string; updated_at: string; source_url: string | null; source: string;
  }>();
  if (!existing || existing.status !== "ACTIVE") throw new HelpSourceDecisionConflict();
  if ((existing.source_url ?? "").trim() !== checked.source_url) throw new HelpSourceDecisionConflict();
  // Recheck the evidence immediately before calling the existing lifecycle transition.
  const current = await db.prepare(
    "SELECT last_checked_at FROM help_source_checks WHERE entity_type='LOST_FOUND' AND entity_id=?",
  ).bind(entityId).first<{ last_checked_at: string | null }>();
  if (current?.last_checked_at !== checkedAt) throw new HelpSourceDecisionConflict();
  if (existing.source === LOST_FOUND_PUBLIC_SOURCE) {
    await syncLostFoundModerationBeforeAdminStatus({
      reportId: entityId, nextStatus: "RESOLVED",
      actorRef: await adminAuditActorRef(actorEmail), requestId,
    });
  }
  try {
    const changed = await transitionAdminDogReportStatus(entityId, "RESOLVED", actorEmail, existing.updated_at, db);
    if (!changed) throw new HelpSourceDecisionConflict();
  } catch (error) {
    if (error instanceof Error && error.message === "lost_found_lifecycle_stale") {
      throw new HelpSourceDecisionConflict();
    }
    throw error;
  }
  return "RESOLVED" as const;
}
