import { isAdminNotionSyncLocked } from "./admin-notion-review-lock";
import { loadNotionBulkAdoptions, loadNotionBulkHelpCases, loadNotionBulkLostFound, loadNotionBulkOrganizations } from "./notion-bulk-sources";
import { pageProperty } from "./notion-events-help-sync";
import { notionRequest, type NotionPage } from "./notion-sync-shared";
import { syncOneAdminHelpRecord } from "./notion-targeted-admin-help";
import type { ReconciliationValue } from "./notion-bulk-reconciliation";
import type { NotionEventsHelpSyncBindings } from "./notion-events-help-sync";

export type HelpNotionAgenda = "organizations" | "adoptions" | "help-cases" | "lost-found";
export type HelpNotionWritebackState = "synced" | "pending" | "review" | "disabled" | "unlinked";
export type HelpNotionRetryBindings = NotionEventsHelpSyncBindings & {
  NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
};
type Field = { before: ReconciliationValue; after: ReconciliationValue };
type Fields = Record<string, Field>;
type Row = {
  agenda: HelpNotionAgenda; entity_id: number; notion_page_id: string;
  fields_json: string; status: string; attempts: number; version: number;
};
const loaders = {
  organizations: loadNotionBulkOrganizations,
  adoptions: loadNotionBulkAdoptions,
  "help-cases": loadNotionBulkHelpCases,
  "lost-found": loadNotionBulkLostFound,
} as const;
const AGENDAS = new Set<HelpNotionAgenda>(["organizations", "adoptions", "help-cases", "lost-found"]);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const stable = (value: unknown) => JSON.stringify(value == null ? "" : value);
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
function parsedFields(json: string): Fields {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("HELP_OUTBOX_FIELDS_INVALID");
  const result = parsed as Fields;
  for (const entry of Object.values(result)) {
    if (!entry || typeof entry !== "object" || !("before" in entry) || !("after" in entry))
      throw Error("HELP_OUTBOX_FIELDS_INVALID");
  }
  return result;
}
function delayed(attempts: number) { return Math.min(3600, 20 * 2 ** Math.min(attempts, 7)); }

export async function readHelpNotionWritebackStatus(
  database: D1Database, bindings: HelpNotionRetryBindings, agenda: HelpNotionAgenda, entityId: number,
): Promise<HelpNotionWritebackState> {
  if (!AGENDAS.has(agenda) || !Number.isSafeInteger(entityId) || entityId <= 0)
    throw Error("HELP_OUTBOX_BAD_IDENTITY");
  if (bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") return "disabled";
  if (await isAdminNotionSyncLocked(database, agenda, entityId)) return "disabled";
  const mapped = await database.prepare(
    "SELECT notion_page_id FROM notion_agenda_sync WHERE agenda=? AND entity_id=? LIMIT 1",
  ).bind(agenda, entityId).first<{ notion_page_id: string }>();
  if (!mapped) return "unlinked";
  try {
    const row = await database.prepare(
      "SELECT status FROM notion_help_admin_writeback_outbox WHERE agenda=? AND entity_id=? LIMIT 1",
    ).bind(agenda, entityId).first<{ status: string }>();
    if (!row) return "synced";
    return row.status === "REVIEW" ? "review" : "pending";
  } catch {
    // The additive D1 table has not been deployed; never show a false green.
    return "pending";
  }
}

/** Persist field-level BEFORE/AFTER evidence before any remote PATCH. */
export async function queueHelpNotionAdminChange(input: {
  database: D1Database; agenda: HelpNotionAgenda; entityId: number;
  before: Record<string, ReconciliationValue>; after: Record<string, ReconciliationValue>;
  fields: readonly string[];
}): Promise<HelpNotionWritebackState> {
  const { database, agenda, entityId } = input;
  if (!AGENDAS.has(agenda) || !Number.isSafeInteger(entityId) || entityId <= 0)
    throw Error("HELP_OUTBOX_BAD_IDENTITY");
  const mapping = await database.prepare(
    "SELECT notion_page_id FROM notion_agenda_sync WHERE agenda=? AND entity_id=? LIMIT 1",
  ).bind(agenda, entityId).first<{ notion_page_id: string }>();
  if (!mapping?.notion_page_id) return "unlinked";
  const fields: Fields = {};
  for (const name of input.fields) {
    if (!name || name.length > 120 || name === "__proto__" || name === "constructor")
      throw Error("HELP_OUTBOX_FIELD_INVALID");
    fields[name] = { before: input.before[name] ?? null, after: input.after[name] ?? null };
  }
  if (!Object.keys(fields).length) return "synced";
  const serialized = JSON.stringify(fields), now = nowSeconds();
  const added = await database.prepare(
    "INSERT INTO notion_help_admin_writeback_outbox " +
    "(agenda,entity_id,notion_page_id,fields_json,status,attempts,next_attempt_at,version,updated_at) " +
    "VALUES(?,?,?,?,'PENDING',0,0,1,?) ON CONFLICT(agenda,entity_id) DO NOTHING",
  ).bind(agenda, entityId, mapping.notion_page_id, serialized, now).run();
  if (added.meta.changes === 1) return "pending";
  for (let n = 0; n < 6; n++) {
    const existing = await database.prepare(
      "SELECT agenda,entity_id,notion_page_id,fields_json,status,attempts,version " +
      "FROM notion_help_admin_writeback_outbox WHERE agenda=? AND entity_id=?",
    ).bind(agenda, entityId).first<Row>();
    if (!existing || existing.notion_page_id !== mapping.notion_page_id)
      throw Error("HELP_OUTBOX_MAPPING_CHANGED");
    const merged = parsedFields(existing.fields_json);
    for (const [name, field] of Object.entries(fields)) {
      merged[name] = { before: merged[name]?.before ?? field.before, after: field.after };
    }
    const updated = await database.prepare(
      "UPDATE notion_help_admin_writeback_outbox SET fields_json=?,status='PENDING'," +
      "attempts=0,next_attempt_at=0,lease_until=NULL,version=version+1,updated_at=?,error_code=NULL " +
      "WHERE agenda=? AND entity_id=? AND version=?",
    ).bind(JSON.stringify(merged),now,agenda,entityId,existing.version).run();
    if (updated.meta.changes === 1) return "pending";
  }
  throw Error("HELP_OUTBOX_CONCURRENT_SAVE");
}

async function finish(database: D1Database, row: Row, state: "PENDING" | "REVIEW", reason: string) {
  const now = nowSeconds();
  await database.prepare(
    "UPDATE notion_help_admin_writeback_outbox SET status=?,lease_until=NULL," +
    "next_attempt_at=?,error_code=?,updated_at=? " +
    "WHERE agenda=? AND entity_id=? AND version=? AND status='PROCESSING'",
  ).bind(state,state === "REVIEW" ? 0 : now + delayed(row.attempts),
    reason,now,row.agenda,row.entity_id,row.version).run();
}

/** Used both immediately after Admin save and by the existing one-minute cron. */
export async function retryOneHelpNotionWriteback(input: {
  database: D1Database; bindings: HelpNotionRetryBindings; agenda: HelpNotionAgenda; entityId: number;
}): Promise<HelpNotionWritebackState> {
  const { database, bindings, agenda, entityId } = input;
  if (bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") return "disabled";
  if (await isAdminNotionSyncLocked(database, agenda, entityId)) {
    await database.prepare(
      "UPDATE notion_help_admin_writeback_outbox SET next_attempt_at=? WHERE agenda=? AND entity_id=? AND status='PENDING'",
    ).bind(nowSeconds() + 3600,agenda,entityId).run();
    return "disabled";
  }
  const now=nowSeconds();
  const row = await database.prepare(
    "UPDATE notion_help_admin_writeback_outbox SET status='PROCESSING'," +
    "attempts=attempts+1,lease_until=?,updated_at=? WHERE agenda=? AND entity_id=? " +
    "AND ((status='PENDING' AND next_attempt_at<=?) OR (status='PROCESSING' AND lease_until<=?)) " +
    "RETURNING agenda,entity_id,notion_page_id,fields_json,status,attempts,version",
  ).bind(now + 180,now,agenda,entityId,now,now).first<Row>();
  if (!row) return readHelpNotionWritebackStatus(database,bindings,agenda,entityId);
  try {
    const mapping=await database.prepare(
      "SELECT notion_page_id FROM notion_agenda_sync WHERE agenda=? AND entity_id=? LIMIT 1",
    ).bind(agenda,entityId).first<{notion_page_id:string}>();
    if (mapping?.notion_page_id !== row.notion_page_id) {
      await finish(database,row,"REVIEW","MAPPING_CHANGED");
      return "review";
    }
    const fields=parsedFields(row.fields_json);
    const source=(await loaders[agenda](database,entityId)).find(x=>x.id===String(entityId));
    if (!source) {
      await finish(database,row,"REVIEW","CANONICAL_MISSING");
      return "review";
    }
    // Prevent an older queued edit from overwriting a newer Admin or Notion value.
    if (Object.entries(fields).some(([name,field])=>!same(source.properties[name],field.after))) {
      await finish(database,row,"REVIEW","ADMIN_FIELD_CHANGED");
      return "review";
    }
    const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(row.notion_page_id));
    if (page.id !== row.notion_page_id || !page.properties) {
      await finish(database,row,"REVIEW","NOTION_IDENTITY_CHANGED");
      return "review";
    }
    if (Object.entries(fields).some(([name,field])=>{
      const remote=pageProperty(page,name);
      return !same(remote,field.before) && !same(remote,field.after);
    })) {
      await finish(database,row,"REVIEW","NOTION_FIELD_CHANGED");
      return "review";
    }
    const result=await syncOneAdminHelpRecord({
      database, bindings, agenda, entityId,
      changedHelpFields:Object.keys(fields),
    });
    if (result==="synced") {
      const deleted=await database.prepare(
        "DELETE FROM notion_help_admin_writeback_outbox " +
        "WHERE agenda=? AND entity_id=? AND version=? AND status='PROCESSING'",
      ).bind(agenda,entityId,row.version).run();
      return deleted.meta.changes===1 ? "synced" : "pending";
    }
    await finish(database,row,result==="unlinked"?"REVIEW":"PENDING",
      result==="unlinked"?"NOTION_MAPPING_MISSING":"NOTION_RETRY_PENDING");
    return result==="unlinked"?"review":"pending";
  } catch {
    await finish(database,row,row.attempts>=12?"REVIEW":"PENDING","NOTION_RETRY_FAILED");
    return row.attempts>=12?"review":"pending";
  }
}

export async function runHelpNotionWritebackRetrySweep(input: {
  database: D1Database; bindings: HelpNotionRetryBindings; limit?: number;
}) {
  const result={claimed:0,synced:0,pending:0,review:0,disabled:0};
  if (input.bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED!=="true") return result;
  const limit=Math.max(1,Math.min(5,input.limit??3));
  for(let i=0;i<limit;i++){
    let row:{agenda:HelpNotionAgenda;entity_id:number}|null;
    try{
      row=await input.database.prepare(
        "SELECT agenda,entity_id FROM notion_help_admin_writeback_outbox " +
        "WHERE (status='PENDING' AND next_attempt_at<=?) " +
        "OR (status='PROCESSING' AND lease_until<=?) " +
        "ORDER BY updated_at,entity_id LIMIT 1",
      ).bind(nowSeconds(),nowSeconds()).first<{agenda:HelpNotionAgenda;entity_id:number}>();
    }catch{return result;} // Schema not applied yet. No other agenda is affected.
    if(!row)break;
    result.claimed++;
    const status=await retryOneHelpNotionWriteback({
      database:input.database,bindings:input.bindings,agenda:row.agenda,entityId:row.entity_id,
    }).catch(()=>"pending" as const);
    if(status==="synced")result.synced++;
    else if(status==="review")result.review++;
    else if(status==="disabled")result.disabled++;
    else result.pending++;
  }
  return result;
}
