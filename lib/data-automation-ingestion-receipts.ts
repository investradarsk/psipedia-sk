import type { AutomationD1Database } from "./data-automation-store.ts";
import type { AutomationEntityType } from "./data-automation.ts";

export type AutomationIngestionReceiptResult = "DRAFT_CREATED" | "SKIPPED_DUPLICATE";

export type AutomationIngestionReceipt = {
  id: number;
  sourceId: number;
  entityType: AutomationEntityType;
  sourceRecordId: string;
  sourceUrl: string | null;
  payloadHash: string | null;
  result: AutomationIngestionReceiptResult;
  firstProcessedAt: string;
};

type ReceiptRow = {
  id: number;
  source_id: number;
  entity_type: AutomationEntityType;
  source_record_id: string;
  source_url: string | null;
  payload_hash: string | null;
  result: AutomationIngestionReceiptResult;
  first_processed_at: string;
};

function mapReceipt(row: ReceiptRow): AutomationIngestionReceipt {
  return {
    id: Number(row.id),
    sourceId: Number(row.source_id),
    entityType: row.entity_type,
    sourceRecordId: String(row.source_record_id),
    sourceUrl: row.source_url ? String(row.source_url) : null,
    payloadHash: row.payload_hash ? String(row.payload_hash) : null,
    result: row.result,
    firstProcessedAt: String(row.first_processed_at),
  };
}

export async function getAutomationIngestionReceipt(
  input: { sourceId: number; entityType: AutomationEntityType; sourceRecordId: string },
  database: AutomationD1Database,
) {
  const row = await database.prepare(`SELECT id,source_id,entity_type,source_record_id,source_url,payload_hash,result,first_processed_at
    FROM automation_ingestion_receipts
    WHERE source_id=? AND entity_type=? AND source_record_id=?
    LIMIT 1`).bind(input.sourceId, input.entityType, input.sourceRecordId).first<ReceiptRow>();
  return row ? mapReceipt(row) : null;
}

export async function createAutomationIngestionReceipt(
  input: {
    sourceId: number;
    entityType: AutomationEntityType;
    sourceRecordId: string;
    sourceUrl?: string | null;
    payloadHash?: string | null;
    result: AutomationIngestionReceiptResult;
    firstProcessedAt: string;
  },
  database: AutomationD1Database,
) {
  await database.prepare(`INSERT INTO automation_ingestion_receipts
    (source_id,entity_type,source_record_id,source_url,payload_hash,result,first_processed_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(source_id,entity_type,source_record_id) DO NOTHING`).bind(
      input.sourceId,
      input.entityType,
      input.sourceRecordId,
      input.sourceUrl ?? null,
      input.payloadHash ?? null,
      input.result,
      input.firstProcessedAt,
    ).run();
  return getAutomationIngestionReceipt(input, database);
}


export async function updateAutomationIngestionReceiptPayload(
  input: {
    sourceId: number;
    entityType: AutomationEntityType;
    sourceRecordId: string;
    sourceUrl?: string | null;
    payloadHash: string;
  },
  database: AutomationD1Database,
) {
  await database.prepare(`UPDATE automation_ingestion_receipts
    SET source_url=?,payload_hash=?
    WHERE source_id=? AND entity_type=? AND source_record_id=?`).bind(
      input.sourceUrl ?? null,
      input.payloadHash,
      input.sourceId,
      input.entityType,
      input.sourceRecordId,
    ).run();
  return getAutomationIngestionReceipt(input, database);
}
