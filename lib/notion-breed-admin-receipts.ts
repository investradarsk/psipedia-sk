import { BREED_EVENT_SCALAR_COLUMNS } from "./notion-breed-workcopy-field-sql.mjs";
import { planBreedSqlV2FieldWrite } from "./breed-sql-v2-bridge.mjs";
import { isUnifiedBreedEditorialField } from "./notion-breed-unified-policy.ts";

/** Build a receipt from the actual SQL cell after its guarded write. The
 * canonical writer remains the only content owner. Caller supplies the
 * validated field and executes this statement inside its existing D1 batch.
 * A missing shared baseline is not manufactured from a legacy receipt. */
export function breedAdminFieldReceipt(database: D1Database, input: {
  breedId: number; field: string; value: unknown; revision: string;
}): D1PreparedStatement[] {
  if (!isUnifiedBreedEditorialField(input.field)) return [];
  const planned = planBreedSqlV2FieldWrite(input.field, input.value);
  if (planned && !("column" in planned)) return [];
  const scalar = (BREED_EVENT_SCALAR_COLUMNS as Record<string, string>)[input.field];
  const table = planned?.table ?? (scalar ? "managed_breeds" : null);
  const column = planned?.column ?? scalar;
  if (!table || !column) return [];
  const cell = table === "managed_breeds"
    ? "p." + column
    : "(SELECT " + column + " FROM " + table + " WHERE breed_id=p.id)";
  const array = planned?.format === "json-array";
  const value = array ? "COALESCE(" + cell + ",'[]')" : "json_quote(" + cell + ")";
  const cleared = array
    ? "json_array_length(" + value + ")=0"
    : "(" + cell + " IS NULL OR (typeof(" + cell + ")='text' AND trim(" + cell + ")=''))";
  return [database.prepare(
    "INSERT INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) " +
    "SELECT 'breeds',CAST(p.id AS TEXT),l.work_notion_page_id,?, ?,s.baseline_version,p.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')," +
    value + ",CASE WHEN " + cleared + " THEN 1 ELSE 0 END " +
    "FROM managed_breeds p JOIN breed_notion_workcopy_links l ON l.breed_id=p.id AND l.status='ACTIVE' " +
    "JOIN notion_unified_field_state s ON s.agenda='breeds' AND s.entity_id=CAST(p.id AS TEXT) AND s.notion_page_id=l.work_notion_page_id AND s.field_key=? " +
    "WHERE p.id=? AND p.updated_at=? AND s.baseline_json IS NOT NULL " +
    "ON CONFLICT(agenda,entity_id,notion_page_id,field_key) DO UPDATE SET edit_id=excluded.edit_id,baseline_version=excluded.baseline_version," +
    "canonical_revision=excluded.canonical_revision,observed_at=excluded.observed_at,value_json=excluded.value_json,explicit_clear=excluded.explicit_clear",
  ).bind(input.field,crypto.randomUUID(),input.field,input.breedId,input.revision)];
}
