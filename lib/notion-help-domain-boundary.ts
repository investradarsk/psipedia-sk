import { helpAdminDomainSql, isHelpAdminDedicatedCategory } from "./help-admin-query.ts";

/**
 * Canonical generic Help is NOT the owner of legacy adoption, shelter or
 * lost/found records. Use the same category boundary as the Admin adapter.
 * This module only reads D1; historical mappings are never changed.
 */
export type HelpSyncDomainReason = "OUT_OF_DOMAIN" | "MISSING_CANONICAL";
export type HelpSyncCanonicalDomain = "IN_DOMAIN" | HelpSyncDomainReason;

export type HelpSyncMappingIssue = {
  entityId: number;
  notionPageId: string;
  reason: HelpSyncDomainReason;
};

export function isHelpSyncCategoryOutOfDomain(category: string): boolean {
  return isHelpAdminDedicatedCategory(category);
}

export async function classifyHelpSyncCanonical(
  database: D1Database,
  entityId: number,
): Promise<HelpSyncCanonicalDomain> {
  const canonical = await database.prepare(
    "SELECT category FROM help_cases WHERE id = ? LIMIT 1",
  ).bind(entityId).first<{ category: string }>();
  if (!canonical) return "MISSING_CANONICAL";
  return isHelpSyncCategoryOutOfDomain(canonical.category) ? "OUT_OF_DOMAIN" : "IN_DOMAIN";
}

/** Detect ALL bad historical mappings, not just pages visited by the current
 * sync batch. An OUT_OF_DOMAIN mapping is intentionally preserved and skipped.
 * An orphan MISSING_CANONICAL mapping is surfaced for explicit manual review.
 * No writes, no provider calls, and no creation/deletion of canonical IDs.
 */
export async function auditHelpSyncMappings(database: D1Database) {
  const result = await database.prepare(
    `SELECT m.entity_id, m.notion_page_id, h.id AS canonical_id, h.category
     FROM notion_agenda_sync m
     LEFT JOIN help_cases h ON h.id = m.entity_id
     WHERE m.agenda = ?
       AND (h.id IS NULL OR NOT (${helpAdminDomainSql("h.category")}))
     ORDER BY m.entity_id ASC`,
  ).bind("help-cases").all<{
    entity_id: number;
    notion_page_id: string;
    canonical_id: number | null;
    category: string | null;
  }>();

  const issues: HelpSyncMappingIssue[] = (result.results ?? []).map((row) => ({
    entityId: Number(row.entity_id),
    notionPageId: row.notion_page_id,
    reason: row.canonical_id === null ? "MISSING_CANONICAL" : "OUT_OF_DOMAIN",
  }));
  return {
    outOfDomain: issues.filter((issue) => issue.reason === "OUT_OF_DOMAIN").length,
    missingCanonical: issues.filter((issue) => issue.reason === "MISSING_CANONICAL").length,
    issues,
  };
}
