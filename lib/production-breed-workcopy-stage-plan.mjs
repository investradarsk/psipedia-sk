/**
 * Fail-closed SHADOW staging for 344 verified breed identities.
 * SQL is a single atomic INSERT...SELECT. Source receipts are read
 * directly from active D1 rows at statement time; no old row is modified.
 */
const uuid = value => String(value ?? "").replaceAll("-", "").toLowerCase();
const goodUuid = value => /^[0-9a-f]{32}$/.test(uuid(value));
const sqlString = value => "'" + String(value).replaceAll("'", "''") + "'";

export function buildAtomicBreedShadowInsert(rows) {
  if (!Array.isArray(rows) || rows.length !== 344)
    throw Error("BREED_STAGE_REQUIRES_344_VERIFIED_ROWS");
  const ids = new Set(), oldIds = new Set(), newIds = new Set();
  const originalSource = uuid(rows[0]?.originalDataSourceId);
  const workSource = uuid(rows[0]?.workDataSourceId);
  if (!goodUuid(originalSource) || !goodUuid(workSource) ||
      originalSource === workSource)
    throw Error("BREED_STAGE_DATA_SOURCES_INVALID");
  const values = [];
  for (const row of rows) {
    const id = row.breedId, fci = row.fciNumber;
    const oldId = uuid(row.originalPageId), newId = uuid(row.workPageId);
    const slug = String(row.slug ?? "");
    if (!Number.isSafeInteger(id) || id <= 0 ||
        !Number.isSafeInteger(fci) || fci <= 0 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        !goodUuid(oldId) || !goodUuid(newId) || oldId === newId ||
        uuid(row.originalDataSourceId) !== originalSource ||
        uuid(row.workDataSourceId) !== workSource ||
        !row.originalSyncReceipt || ids.has(id) ||
        oldIds.has(oldId) || newIds.has(newId))
      throw Error("BREED_STAGE_CANDIDATE_IDENTITY_INVALID");
    ids.add(id); oldIds.add(oldId); newIds.add(newId);
    values.push("(" + [id, sqlString(oldId), sqlString(newId),
      sqlString(slug), fci].join(",") + ")");
  }
  if (ids.size !== 344 || oldIds.size !== 344 || newIds.size !== 344)
    throw Error("BREED_STAGE_CANDIDATES_INCOMPLETE");

  // All candidates must match live D1 inside the SAME statement. On drift,
  // "ready" is not 344 and no row is inserted.
  return [
    "WITH candidates(breed_id, old_id, new_id, slug, fci) AS (",
    "VALUES " + values.join(",\n       "),
    "), ready AS (",
    "SELECT c.breed_id, s.notion_page_id AS original_page_id,",
    "c.new_id AS new_page_id, m.slug, m.fci_number,",
    "s.content_hash, s.last_synced_at, s.notion_last_edited_time",
    "FROM candidates c",
    "JOIN breed_notion_sync s ON s.breed_id = c.breed_id",
    "JOIN managed_breeds m ON m.id = c.breed_id",
    "WHERE lower(replace(s.notion_page_id, '-', '')) = c.old_id",
    "AND m.slug = c.slug AND m.fci_number = c.fci",
    "AND s.content_hash IS NOT NULL AND length(s.content_hash) > 0",
    ")",
    "INSERT INTO breed_notion_workcopy_links (",
    "breed_id, original_notion_page_id, work_notion_page_id,",
    "original_data_source_id, work_data_source_id, canonical_slug,",
    "fci_number, original_sync_receipt, original_sync_last_synced_at,",
    "original_notion_last_edited_time, status",
    ")",
    "SELECT breed_id, original_page_id, new_page_id,",
    sqlString(rows[0].originalDataSourceId) + ",",
    sqlString(rows[0].workDataSourceId) + ",",
    "slug, fci_number, content_hash, last_synced_at,",
    "notion_last_edited_time, 'SHADOW'",
    "FROM ready",
    "WHERE (SELECT count(*) FROM ready) = 344",
    "AND (SELECT count(*) FROM breed_notion_sync) = 344",
    "AND NOT EXISTS (SELECT 1 FROM breed_notion_workcopy_links);",
  ].join("\n");
}

export function assertBreedStageStored({ plannedRows, storedRows, productionLinks }) {
  if (!Array.isArray(plannedRows) || plannedRows.length !== 344 ||
      !Array.isArray(storedRows) || storedRows.length !== 344 ||
      !Array.isArray(productionLinks) || productionLinks.length !== 344)
    throw Error("BREED_STAGE_STORED_COUNT_INVALID");
  const expected = new Map(plannedRows.map(row => [Number(row.breedId), row]));
  const active = new Map(productionLinks.map(row => [Number(row.breed_id), row]));
  const seen = new Set(), oldIds = new Set(), workIds = new Set();
  for (const row of storedRows) {
    const id = Number(row.breed_id);
    const plan = expected.get(id), current = active.get(id);
    const oldId = uuid(row.original_notion_page_id);
    const workId = uuid(row.work_notion_page_id);
    if (!plan || !current || seen.has(id) || !goodUuid(oldId) ||
        !goodUuid(workId) || oldIds.has(oldId) || workIds.has(workId) ||
        oldId !== uuid(plan.originalPageId) ||
        oldId !== uuid(current.notion_page_id) ||
        workId !== uuid(plan.workPageId) ||
        uuid(row.original_data_source_id) !== uuid(plan.originalDataSourceId) ||
        uuid(row.work_data_source_id) !== uuid(plan.workDataSourceId) ||
        row.canonical_slug !== plan.slug ||
        Number(row.fci_number) !== plan.fciNumber ||
        row.original_sync_receipt !== current.content_hash ||
        row.original_sync_last_synced_at !== (current.last_synced_at ?? null) ||
        row.original_notion_last_edited_time !==
          (current.notion_last_edited_time ?? null) ||
        row.status !== "SHADOW" || row.work_sync_receipt != null ||
        row.work_last_synced_at != null || row.work_notion_last_edited_time != null ||
        row.verified_at != null || row.activated_at != null ||
        row.rolled_back_at != null)
      throw Error("BREED_STAGE_STORED_IDENTITY_OR_RECEIPT_DRIFT");
    seen.add(id); oldIds.add(oldId); workIds.add(workId);
  }
  if (seen.size !== 344 || workIds.size !== 344 || oldIds.size !== 344)
    throw Error("BREED_STAGE_STORED_INCOMPLETE");
  return { stagedCount: 344, workBaselineCount: 0, cutoverReady: false };
}
