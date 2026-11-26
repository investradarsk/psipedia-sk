import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";

/** Reusable transactional receipt writer for Help agenda adapters. SQL
 * identifiers and projection expressions must be supplied by static code,
 * never from a form or Notion property. The proposed intent table is shared
 * with Organizations. The canonical mutation remains inside the same batch. */
export async function commitHelpV2AdminEdit(
  database: AdoptionD1Database, statement: AdoptionD1Statement,
  input: {agenda:"adoptions"|"help-cases"|"lost-found"; table:"adoption_dogs"|"help_cases"|"lost_found_dog_reports";
    projection:string; id:number; expectedRevision:string; nextRevision:string; editor:string;
    companionStatements?:readonly D1PreparedStatement[]},
) {
  const db=database as unknown as D1Database;
  const editId=crypto.randomUUID();
  const before=db.prepare(
    "INSERT INTO notion_help_admin_edit_intent(edit_id,agenda,entity_id,notion_page_id,before_json) "+
    "SELECT ?,?,p.id,m.notion_page_id,"+input.projection+" FROM "+input.table+" p "+
    "JOIN notion_agenda_sync m ON m.agenda=? AND m.entity_id=p.id WHERE p.id=? AND p.updated_at=?"
  ).bind(editId,input.agenda,input.agenda,input.id,input.expectedRevision);
  const after=db.prepare(
    "INSERT INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) "+
    "SELECT i.agenda,CAST(p.id AS TEXT),m.notion_page_id,n.key,i.edit_id||':'||n.key,COALESCE(CAST(fs.version AS TEXT),m.content_hash),"+
    "p.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'),"+
    "CASE n.type WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_quote(n.value) END,"+
    "CASE WHEN n.value IS NULL OR (n.type='text' AND n.value='') THEN 1 ELSE 0 END "+
    "FROM notion_help_admin_edit_intent i JOIN "+input.table+" p ON p.id=i.entity_id "+
    "JOIN notion_agenda_sync m ON m.agenda=i.agenda AND m.entity_id=p.id AND m.notion_page_id=i.notion_page_id "+
    "JOIN json_each("+input.projection+") n JOIN json_each(i.before_json) o ON o.key=n.key "+
    "LEFT JOIN notion_unified_field_state fs ON fs.agenda=i.agenda AND fs.entity_id=CAST(p.id AS TEXT) AND fs.notion_page_id=m.notion_page_id AND fs.field_key=n.key "+
    "WHERE i.edit_id=? AND i.agenda=? AND p.updated_at=? "+
    (input.agenda==="lost-found" ? "" : "AND p.updated_by=? ")+
    "AND (n.value IS NOT o.value OR n.type<>o.type) AND COALESCE(CAST(fs.version AS TEXT),m.content_hash) IS NOT NULL "+
    "ON CONFLICT(agenda,entity_id,notion_page_id,field_key) DO UPDATE SET edit_id=excluded.edit_id,baseline_version=excluded.baseline_version,"+
    "canonical_revision=excluded.canonical_revision,observed_at=excluded.observed_at,value_json=excluded.value_json,explicit_clear=excluded.explicit_clear"
  ).bind(editId,input.agenda,input.nextRevision,...(input.agenda==="lost-found"?[]:[input.editor]));
  const result=await db.batch([before,statement as unknown as D1PreparedStatement,
    db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('HELP_V2_ADMIN_CAS_FAILED','$') END"),
    ...(input.companionStatements??[]),after,db.prepare("DELETE FROM notion_help_admin_edit_intent WHERE edit_id=?").bind(editId)]);
  if(result.some(row=>!row.success))throw Error("HELP_V2_ADMIN_TRANSACTION_FAILED");
  return result[1];
}
export function nextHelpV2Revision(previous:string,now=new Date()) {
  const old=Date.parse(previous);
  return new Date(Math.max(now.getTime(),Number.isFinite(old)?old+1:0)).toISOString();
}
