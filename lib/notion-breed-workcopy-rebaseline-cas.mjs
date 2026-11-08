/**
 * CAS refresh of EXISTING 344 SHADOW work-copy field receipts.
 *
 * This intentionally re-observes independent CURRENT values on both sides;
 * historical Notion/Admin differences are baselines, not edits to replay.
 * Does not write managed_breeds, breed_notion_sync or either Notion database.
 *
 * Refresh the original receipt snapshot too: the old 109-field synchronizer
 * legitimately advances its hash while the 60-field cutover remains inactive.
 * The SQL checks the original production mapping again at commit time.
 */
export const BREED_WORKCOPY_REBASELINE_CAS_SQL = [
  "UPDATE breed_notion_workcopy_links SET",
  "work_sync_receipt=?, work_notion_last_edited_time=?,",
  "original_sync_receipt=?, original_sync_last_synced_at=?,",
  "original_notion_last_edited_time=?, work_last_error_code=NULL,",
  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  "WHERE breed_id=? AND status='SHADOW'",
  "AND work_notion_page_id=? AND original_notion_page_id=?",
  "AND original_data_source_id=? AND work_data_source_id=?",
  "AND canonical_slug=? AND fci_number=?",
  // A concurrent refresh must never be acknowledged by this request.
  "AND work_sync_receipt IS ?",
  // A canonical edit or change in the old sync mapping invalidates the read.
  "AND EXISTS (SELECT 1 FROM managed_breeds b",
  "WHERE b.id=breed_notion_workcopy_links.breed_id",
  "AND b.slug=canonical_slug AND b.fci_number=breed_notion_workcopy_links.fci_number",
  "AND b.updated_at=?)",
  "AND EXISTS (SELECT 1 FROM breed_notion_sync s",
  "WHERE s.breed_id=breed_notion_workcopy_links.breed_id",
  "AND s.notion_page_id=original_notion_page_id AND s.content_hash=?)",
].join(" ");

export function breedWorkCopyRebaselineBindings({ row, source, value, pageRevision, canonicalUpdatedAt }) {
  if (!row || !source || !value?.startsWith("breed-field-v1:") ||
      typeof pageRevision !== "string" || !pageRevision ||
      typeof canonicalUpdatedAt !== "string" || !canonicalUpdatedAt ||
      !Number.isSafeInteger(Number(row.breed_id)) ||
      !Number.isSafeInteger(Number(row.fci_number)) ||
      typeof row.work_notion_page_id !== "string" ||
      typeof row.original_notion_page_id !== "string" ||
      typeof source.content_hash !== "string" || !source.content_hash) {
    throw Error("BREED_WORKCOPY_REBASELINE_ARGUMENTS_INVALID");
  }
  return [
    value, pageRevision,
    source.content_hash, source.last_synced_at ?? null,
    source.notion_last_edited_time ?? null,
    row.breed_id, row.work_notion_page_id, row.original_notion_page_id,
    row.original_data_source_id, row.work_data_source_id,
    row.canonical_slug, row.fci_number, row.work_sync_receipt,
    canonicalUpdatedAt, source.content_hash,
  ];
}
