import { EVENT_NOTION_PATHS, type EventNotionField } from "./notion-event-field-contract.ts";
import type { FieldIdentity, ScopedFieldEdit } from "./notion-unified-field-sync.ts";

/** Only call from an authenticated Admin edit, after validation. The D1
 * batch is atomic: a receipt cannot survive a failed canonical write.
 * No remote request is made inside the transaction. */
export async function commitEventAdminEdit<T>(
  database: D1Database, statement: D1PreparedStatement,
  input: { id: number; expectedRevision: string; nextRevision: string;
    editor: string; fields: readonly EventNotionField[] },
): Promise<T | null> {
  const fields = [...new Set(input.fields)].filter(field => EVENT_NOTION_PATHS.includes(field));
  if (!fields.length) return statement.first<T>();
  const editId = crypto.randomUUID();
  const results = await database.batch<T>([
    database.prepare(
      "INSERT INTO notion_event_admin_edit_intent " +
      "(entity_id,edit_id,expected_revision,next_revision,editor,fields_json) VALUES (?,?,?,?,?,?)",
    ).bind(input.id, editId, input.expectedRevision, input.nextRevision, input.editor, JSON.stringify(fields)),
    statement,
    database.prepare("DELETE FROM notion_event_admin_edit_intent WHERE entity_id=? AND edit_id=?")
      .bind(input.id, editId),
  ]);
  if (results.length !== 3 || results.some(result => !result.success))
    throw Error("UNIFIED_ADMIN_EDIT_TRANSACTION_FAILED");
  return results[1].results?.[0] ?? null;
}

type EditRow = {
  edit_id: string; baseline_version: string; observed_at: string;
  value_json: string; explicit_clear: number;
};

/** A later record revision invalidates this proof conservatively; never
 * substitute the record revision for the field edit's time. */
export async function readUnifiedAdminEdit(
  database: D1Database, identity: FieldIdentity, canonicalRevision: string,
): Promise<ScopedFieldEdit | undefined> {
  const row = await database.prepare(
    "SELECT edit_id,baseline_version,observed_at,value_json,explicit_clear " +
    "FROM notion_unified_admin_field_edits WHERE agenda=? AND entity_id=? " +
    "AND notion_page_id=? AND field_key=? AND canonical_revision=?",
  ).bind(identity.agenda, identity.entityId, identity.pageId, identity.field, canonicalRevision)
    .first<EditRow>();
  if (!row) return;
  return {
    identity, source: "psipedia", editId: row.edit_id,
    baselineVersion: row.baseline_version, observedAt: row.observed_at,
    value: JSON.parse(row.value_json), explicitClear: row.explicit_clear === 1,
  };
}
