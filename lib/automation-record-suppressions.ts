import { canonicalizeSourceUrl, type AutomationEntityType } from "./data-automation.ts";

type Database = Pick<D1Database, "prepare">;

export type AutomationRecordSuppression = {
  id: number;
  entityType: AutomationEntityType;
  externalSourceUrl: string;
  externalRecordId: string;
  suppressionReason: "ADMIN_DRAFT_DELETE";
  createdBy: string;
  createdAt: string;
};

export function automationSuppressionIdentity(input: {
  entityType: AutomationEntityType;
  externalSourceUrl?: unknown;
  externalRecordId: unknown;
}) {
  const externalRecordId = typeof input.externalRecordId === "string"
    ? input.externalRecordId.trim().slice(0, 240)
    : String(input.externalRecordId ?? "").trim().slice(0, 240);
  if (!externalRecordId) return null;
  return {
    entityType: input.entityType,
    externalSourceUrl: canonicalizeSourceUrl(input.externalSourceUrl) ?? "",
    externalRecordId,
  };
}

export async function getAutomationRecordSuppression(input: {
  entityType: AutomationEntityType;
  externalSourceUrl?: unknown;
  externalRecordId: unknown;
}, database: Database): Promise<AutomationRecordSuppression | null> {
  const identity = automationSuppressionIdentity(input);
  if (!identity) return null;
  let row: {
    id: number;
    entity_type: AutomationEntityType;
    external_source_url: string;
    external_record_id: string;
    suppression_reason: "ADMIN_DRAFT_DELETE";
    created_by: string;
    created_at: string;
  } | null;
  try {
    row = await database.prepare(`SELECT
        id,entity_type,external_source_url,external_record_id,suppression_reason,created_by,created_at
      FROM automation_record_suppressions
      WHERE entity_type=? AND external_source_url=? AND external_record_id=?
      LIMIT 1`).bind(
        identity.entityType,
        identity.externalSourceUrl,
        identity.externalRecordId,
      ).first<typeof row extends infer _ ? {
        id: number;
        entity_type: AutomationEntityType;
        external_source_url: string;
        external_record_id: string;
        suppression_reason: "ADMIN_DRAFT_DELETE";
        created_by: string;
        created_at: string;
      } : never>();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such table:\s*automation_record_suppressions/i.test(message)) return null;
    throw error;
  }
  return row ? {
    id: Number(row.id),
    entityType: row.entity_type,
    externalSourceUrl: String(row.external_source_url),
    externalRecordId: String(row.external_record_id),
    suppressionReason: row.suppression_reason,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  } : null;
}

export async function isAutomationRecordSuppressed(input: {
  entityType: AutomationEntityType;
  externalSourceUrl?: unknown;
  externalRecordId: unknown;
}, database: Database) {
  return Boolean(await getAutomationRecordSuppression(input, database));
}
