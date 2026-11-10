/**
 * Exact, fail-closed reconciliation of the Wrangler D1 migration ledger for
 * schema already installed by separately owner-dispatched 0158–0162 rollouts.
 *
 * Receipt applied_at is RECONCILIATION time, not original schema-install time.
 * This tool never runs the original 0158–0162 DDL or changes the Worker.
 */
export const RECEIPTS_0158_0162 = Object.freeze([
  "0158_admin_directory_list_indexes.sql",
  "0159_breed_notion_workcopy_links.sql",
  "0160_event_contacts_admission.sql",
  "0161_event_image_alt_private_notes.sql",
  "0162_lost_found_short_description.sql",
]);
function requireState(ok, message) {
  if (!ok) throw new Error(message);
}
export function expectedLedgerPrefix(fileNames) {
  const files = [...fileNames].filter((name) => /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(name))
    .sort((a,b) => Number(a.slice(0,4)) - Number(b.slice(0,4)));
  const prefix = files.filter((name) => Number(name.slice(0,4)) <= 157);
  requireState(prefix.length === 158, "LEDGER_SOURCE_EXPECTED_0000_THROUGH_0157");
  prefix.forEach((name, i) => requireState(Number(name.slice(0,4)) === i,
    "LEDGER_SOURCE_SEQUENCE_GAP_" + i));
  RECEIPTS_0158_0162.forEach((name, i) => requireState(files.includes(name) &&
    Number(name.slice(0,4)) === 158+i, "LEDGER_TARGET_FILE_MISSING_" + i));
  return prefix;
}
export function classifyLedger({ rows, columns, uniqueNameIndex, expectedPrior }) {
  requireState(Array.isArray(rows) && Array.isArray(columns) && Array.isArray(expectedPrior),
    "LEDGER_INPUT_INVALID");
  const byName = new Map(columns.map((x) => [x.name, x]));
  const id = byName.get("id"), name = byName.get("name"), applied = byName.get("applied_at");
  requireState(id && String(id.type).toUpperCase() === "INTEGER" && Number(id.pk) === 1,
    "LEDGER_ID_NOT_PRIMARY_KEY");
  requireState(name && String(name.type).toUpperCase() === "TEXT" && uniqueNameIndex,
    "LEDGER_NAME_NOT_UNIQUE");
  requireState(applied && /^(?:TEXT|TIMESTAMP|DATETIME)$/.test(String(applied.type).toUpperCase()),
    "LEDGER_APPLIED_AT_COLUMN_UNSAFE");
  for (const column of columns) {
    if (["id","name","applied_at"].includes(column.name)) continue;
    requireState(!Number(column.notnull) || column.dflt_value !== null,
      "LEDGER_EXTRA_REQUIRED_COLUMN_" + column.name);
  }
  const names = rows.map((row) => String(row.name));
  requireState(rows.every((row, i) => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 &&
    (i === 0 || Number(row.id) > Number(rows[i-1].id))), "LEDGER_IDS_NOT_MONOTONIC");
  requireState(names.length >= expectedPrior.length, "LEDGER_BEFORE_0157");
  requireState(expectedPrior.every((name, i) => names[i] === name),
    "LEDGER_PRE_0158_HISTORY_NOT_CANONICAL");
  const tail = names.slice(expectedPrior.length);
  requireState(tail.length <= RECEIPTS_0158_0162.length &&
    tail.every((name,i) => name === RECEIPTS_0158_0162[i]),
    "LEDGER_UNEXPECTED_OR_NONCONTIGUOUS_TAIL");
  const missing = RECEIPTS_0158_0162.slice(tail.length);
  return {
    priorCount: expectedPrior.length,
    recordedCount: tail.length,
    latestRecorded: names.at(-1) ?? null,
    recorded: tail,
    missing,
    ready: true,
    complete: missing.length === 0,
  };
}
export function receiptInsertSql(names) {
  requireState(Array.isArray(names) && names.length > 0, "LEDGER_NO_PENDING_RECEIPTS");
  const first = RECEIPTS_0158_0162.indexOf(names[0]);
  requireState(first >= 0 && names.length === RECEIPTS_0158_0162.length - first &&
    names.every((name, i) => name === RECEIPTS_0158_0162[first + i]),
    "LEDGER_RECEIPTS_NOT_CONTIGUOUS_SUFFIX");
  return "INSERT INTO d1_migrations (name, applied_at) VALUES " +
    names.map((name) => "('" + name + "', CURRENT_TIMESTAMP)").join(",") + ";";
}
export function assertBreedShadow0159({ columns, tableSql, statusIndexColumns }) {
  const required = [
    "breed_id","original_notion_page_id","work_notion_page_id",
    "original_data_source_id","work_data_source_id","canonical_slug",
    "fci_number","original_sync_receipt","work_sync_receipt",
    "work_last_synced_at","work_last_error_code",
    "original_sync_last_synced_at","original_notion_last_edited_time",
    "work_notion_last_edited_time","status","verified_at",
    "activated_at","rolled_back_at","created_at","updated_at",
  ];
  const present = new Set(columns.map((col) => col.name));
  for (const key of required)
    requireState(present.has(key), "LEDGER_0159_SHADOW_COLUMN_MISSING_" + key);
  requireState(JSON.stringify(statusIndexColumns) === JSON.stringify(["status","updated_at"]),
    "LEDGER_0159_STATUS_INDEX_INCOMPATIBLE");
  const ddl = String(tableSql ?? "").replace(/[\"\x60]/g, "").replace(/\s+/g, " ");
  for (const constraint of [
    /REFERENCES managed_breeds\s*\(id\) ON DELETE CASCADE/i,
    /original_notion_page_id\s+TEXT\s+NOT NULL\s+UNIQUE/i,
    /work_notion_page_id\s+TEXT\s+NOT NULL\s+UNIQUE/i,
    /CHECK\s*\(\s*original_notion_page_id\s*<>\s*work_notion_page_id\s*\)/i,
    /CHECK\s*\(\s*original_data_source_id\s*<>\s*work_data_source_id\s*\)/i,
    /CHECK\s*\(\s*status\s+IN\s*\(/i,
  ]) requireState(constraint.test(ddl), "LEDGER_0159_SHADOW_CONSTRAINT_INCOMPATIBLE");
  return true;
}
