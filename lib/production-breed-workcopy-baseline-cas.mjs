/**
 * Step 2: only the INACTIVE work-copy shadow receipt may be written.
 * A baseline observes Notion and Admin values independently; it does not
 * reconcile content or change production mappings, identities or flags.
 *
 * The SQL accepts a previously NULL work-page revision (0159 stages none).
 * Both canonical and legacy receipt snapshots are guarded at SQL time.
 */
export const BREED_WORKCOPY_BASELINE_CAS_SQL = [
  "UPDATE breed_notion_workcopy_links SET",
  "work_sync_receipt=?, work_notion_last_edited_time=?, work_last_error_code=NULL,",
  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  "WHERE breed_id=? AND status='SHADOW' AND work_sync_receipt IS NULL",
  "AND work_notion_page_id=?",
  "AND (work_notion_last_edited_time IS NULL OR work_notion_last_edited_time=?)",
  "AND original_sync_receipt=?",
  "AND original_data_source_id=? AND work_data_source_id=?",
  "AND canonical_slug=? AND fci_number=?",
  "AND EXISTS (SELECT 1 FROM breed_notion_sync s WHERE s.breed_id=breed_id",
  "AND s.notion_page_id=? AND s.content_hash=original_sync_receipt)",
  "AND EXISTS (SELECT 1 FROM managed_breeds m WHERE m.id=breed_id",
  "AND m.slug=canonical_slug AND m.fci_number=fci_number AND m.updated_at=?)",
].join(" ");

export function breedBaselineCasBindings({ value, revision, row, canonicalUpdatedAt }) {
  if (!value?.startsWith("breed-field-v1:") ||
      typeof revision !== "string" || !revision ||
      !row || !Number.isSafeInteger(Number(row.breed_id)) ||
      !Number.isSafeInteger(Number(row.fci_number)) ||
      !canonicalUpdatedAt)
    throw Error("BREED_WORKCOPY_BASELINE_CAS_ARGUMENTS_INVALID");
  return [
    value, revision,
    row.breed_id, row.work_notion_page_id, revision,
    row.original_sync_receipt,
    row.original_data_source_id, row.work_data_source_id,
    row.canonical_slug, row.fci_number,
    row.original_notion_page_id, canonicalUpdatedAt,
  ];
}
