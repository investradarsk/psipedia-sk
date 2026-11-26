import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";

/** Only ordinary editable organization fields. Identity, lifecycle and location
 * have different canonical owners; never infer their edits from this row. */
export const ORGANIZATION_V2_COLUMNS = {
  "Názov": "name", "Právny názov": "legal_name",
  "IČO / registračné číslo": "registration_number", "Krátky popis": "short_description",
  "Popis": "description", "Verejný e-mail": "public_email", "Verejný telefón": "public_phone",
  "Web": "website_url", "Facebook": "facebook_url", "Instagram": "instagram_url",
  "Hlavný obrázok URL": "image_url", "Zdroj dát": "source_url",
} as const;
export type OrganizationV2Field = keyof typeof ORGANIZATION_V2_COLUMNS;
export function isOrganizationV2Field(field: string): field is OrganizationV2Field {
  return Object.hasOwn(ORGANIZATION_V2_COLUMNS, field);
}
function expression(field: OrganizationV2Field) {
  const cell = "trim(COALESCE(p." + ORGANIZATION_V2_COLUMNS[field] + ",''))";
  return field === "Hlavný obrázok URL"
    ? "(CASE WHEN substr(" + cell + ",1,1)='/' THEN 'https://psipedia.sk'||" + cell + " ELSE " + cell + " END)"
    : cell;
}
const projection = "json_object(" + Object.keys(ORGANIZATION_V2_COLUMNS)
  .map(field => "'" + field + "'," + expression(field as OrganizationV2Field)).join(",") + ")";

export function nextOrganizationEditRevision(previous: string, now: Date) {
  const old = Date.parse(previous);
  return new Date(Math.max(now.getTime(), Number.isFinite(old) ? old + 1 : 0)).toISOString();
}

/** Actual OLD and NEW SQL cells, same batch as authenticated canonical CAS.
 * This creates no remote mutation and never claims evidence from a webhook. */
export async function commitOrganizationAdminEdit(
  database: AdoptionD1Database, statement: AdoptionD1Statement,
  input: { id: number; expectedRevision: string; nextRevision: string; editor: string },
): Promise<unknown> {
  const db = database as unknown as D1Database;
  const editId = crypto.randomUUID();
  const before = db.prepare(
    "INSERT INTO notion_help_admin_edit_intent(edit_id,agenda,entity_id,notion_page_id,before_json) " +
    "SELECT ?,'organizations',p.id,m.notion_page_id," + projection +
    " FROM help_organizations p JOIN notion_agenda_sync m ON m.agenda='organizations' AND m.entity_id=p.id " +
    "WHERE p.id=? AND p.updated_at=?",
  ).bind(editId,input.id,input.expectedRevision);
  const after = db.prepare(
    "INSERT INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) " +
    "SELECT 'organizations',CAST(p.id AS TEXT),m.notion_page_id,n.key,i.edit_id||':'||n.key," +
    "COALESCE(CAST(fs.version AS TEXT),m.content_hash),p.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_quote(n.value),CASE WHEN n.value='' THEN 1 ELSE 0 END " +
    "FROM notion_help_admin_edit_intent i JOIN help_organizations p ON p.id=i.entity_id " +
    "JOIN notion_agenda_sync m ON m.agenda='organizations' AND m.entity_id=p.id AND m.notion_page_id=i.notion_page_id " +
    "JOIN json_each(" + projection + ") n JOIN json_each(i.before_json) o ON o.key=n.key " +
    "LEFT JOIN notion_unified_field_state fs ON fs.agenda='organizations' AND fs.entity_id=CAST(p.id AS TEXT) AND fs.notion_page_id=m.notion_page_id AND fs.field_key=n.key " +
    "WHERE i.edit_id=? AND i.agenda='organizations' AND p.updated_at=? AND p.updated_by=? AND n.value IS NOT o.value " +
    "AND COALESCE(CAST(fs.version AS TEXT),m.content_hash) IS NOT NULL " +
    "ON CONFLICT(agenda,entity_id,notion_page_id,field_key) DO UPDATE SET edit_id=excluded.edit_id,baseline_version=excluded.baseline_version," +
    "canonical_revision=excluded.canonical_revision,observed_at=excluded.observed_at,value_json=excluded.value_json,explicit_clear=excluded.explicit_clear",
  ).bind(editId,input.nextRevision,input.editor);
  const results = await db.batch([
    before, statement as unknown as D1PreparedStatement,
    // A lost CAS must rollback the intent and all potential receipts.
    db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('ORGANIZATION_V2_ADMIN_CAS_FAILED','$') END"),
    after, db.prepare("DELETE FROM notion_help_admin_edit_intent WHERE edit_id=?").bind(editId),
  ]);
  if (results.some(result => !result.success)) throw Error("ORGANIZATION_V2_ADMIN_TRANSACTION_FAILED");
  return results[1];
}
