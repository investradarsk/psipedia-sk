import { notionRequest, type NotionSyncBindings } from "./notion-sync-shared";
import { notionPageBelongsToDataSource, type NotionOwnedPage } from "./notion-sync-page-ownership";

/**
 * Canonical lifecycle writes. Never accept a table, mapping, page ID or Notion
 * source from the browser. The caller supplies only a whitelisted agenda + D1 ID.
 * Apply drizzle/0164 before making any lifecycle mutation.
 */
export const recordKinds = ["directory","events","help","breeds","articles","adoptions","lost-found","organizations"] as const;
export type RecordKind = typeof recordKinds[number];
type RecordSpec = {
  table: string;
  title: string;
  draft: string;
  publicStatuses: readonly string[];
  category?: string;
  agenda?: string;
};
const specs: Record<RecordKind, RecordSpec> = {
  directory: { table:"directory_profiles", title:"name", category:"category", draft:"draft", publicStatuses:["published"] },
  events: { table:"managed_events", title:"title", category:"event_type", draft:"draft", publicStatuses:["published"], agenda:"events" },
  help: { table:"help_cases", title:"title", category:"category", draft:"draft", publicStatuses:["published"], agenda:"help-cases" },
  breeds: { table:"managed_breeds", title:"name", category:"fci_group", draft:"draft", publicStatuses:["published"] },
  articles: { table:"managed_articles", title:"title", category:"portal_section", draft:"draft", publicStatuses:["published","scheduled"] },
  adoptions: { table:"adoption_dogs", title:"name", draft:"DRAFT", publicStatuses:["ACTIVE","RESERVED"], agenda:"adoptions" },
  "lost-found": { table:"lost_found_dog_reports", title:"dog_name", category:"type", draft:"DRAFT", publicStatuses:["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"], agenda:"lost-found" },
  organizations: { table:"help_organizations", title:"name", category:"type", draft:"DRAFT", publicStatuses:["PUBLISHED"], agenda:"organizations" },
};
const mappingTables: Partial<Record<RecordKind, { table:string; entity:string }>> = {
  directory: { table:"directory_notion_sync",entity:"directory_profile_id" },
  events: { table:"event_notion_sync",entity:"event_id" },
  breeds: { table:"breed_notion_sync",entity:"breed_id" },
  articles: { table:"article_notion_sync",entity:"article_id" },
};
type CanonicalRow = Record<string, unknown> & { id:number; slug:string; status:string };
type NotionTarget = { pageId:string; sourceId:string };
type Tombstone = {
  kind: RecordKind; record_id:number; record_slug:string; record_name:string; record_category:string;
  notion_page_id:string|null; notion_data_source_id:string|null; notion_targets_json:string;
  state:"PENDING_NOTION"|"ERROR_NOTION"|"READY_LOCAL"|"COMPLETE"; error_code:string|null;
};
export type LifecycleBindings = NotionSyncBindings & {
  NOTION_DIRECTORY_DATA_SOURCE_ID?:string;
  NOTION_EVENTS_DATA_SOURCE_ID?:string;
  NOTION_BREEDS_DATA_SOURCE_ID?:string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?:string;
  NOTION_ARTICLES_DATA_SOURCE_ID?:string;
  BUCKET?:R2Bucket;
};
const validateId = (id:number) => Number.isSafeInteger(id) && id>0;
export function isRecordKind(value:string):value is RecordKind {
  return (recordKinds as readonly string[]).includes(value);
}
function clean(value:unknown) { return value == null?"":String(value).trim(); }
const sameId = (a:string,b:string) => a.replaceAll("-","").toLowerCase() === b.replaceAll("-","").toLowerCase();
function requireDataSource(id:string) {
  if (!/^[a-f0-9]{32}$|^[a-f0-9-]{36}$/i.test(id)) throw Error("NOTION_DATA_SOURCE_UNCONFIGURED");
  return id;
}
export async function lifecycleSchemaReady(db:D1Database) {
  const result = await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('admin_record_tombstones','admin_record_publication_guards')")
    .first<{total:number}>();
  if(result?.total!==2)return false;
  const triggerNames=recordKinds.flatMap(kind=>[
    "admin_deleted_"+kind.replace("-","_")+"_insert",
    "admin_removing_"+kind.replace("-","_")+"_update",
    "admin_guarded_"+kind.replace("-","_")+"_delete",
  ]);
  const safeNames=triggerNames.map(()=>"?").join(",");
  const triggers=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='trigger' AND name IN ("+safeNames+")")
    .bind(...triggerNames).first<{total:number}>();
  if(triggers?.total!==triggerNames.length)return false;
  const columns=await db.prepare("PRAGMA table_info(admin_record_tombstones)").all<{name:string}>();
  const required=new Set(["notion_targets_json","record_external_key"]);
  for(const column of columns.results??[])required.delete(column.name);
  return required.size===0;
}
async function canonical(db:D1Database,kind:RecordKind,id:number):Promise<CanonicalRow|null> {
  const spec=specs[kind];
  const row=await db.prepare("SELECT * FROM "+spec.table+" WHERE id=? LIMIT 1").bind(id).first<CanonicalRow>();
  // Dedicated help domains have their own canonical tables and own delete operation.
  if (kind==="help" && row && ["adopcia","utulky"].includes(clean(row.category))) return null;
  return row ?? null;
}
function identity(kind:RecordKind,row:CanonicalRow) {
  const spec=specs[kind];
  return { kind, id:Number(row.id), name:clean(row[spec.title])||"Bez názvu",
    category:clean(spec.category?row[spec.category]:kind)||kind, slug:clean(row.slug),
    status:clean(row.status), published:spec.publicStatuses.includes(clean(row.status)) };
}
function externalTombstoneKey(kind:RecordKind,row:CanonicalRow):string|null {
  if(kind==="directory" || kind==="organizations") {
    const key=clean(row.import_key);
    return key || null;
  }
  if(kind==="breeds" && Number.isSafeInteger(Number(row.fci_number)) && Number(row.fci_number)>0)
    return String(row.fci_number);
  return null;
}
async function mappedTargets(db:D1Database,bindings:LifecycleBindings,kind:RecordKind,id:number):Promise<NotionTarget[]> {
  if (kind==="breeds") {
    // Work-copy links exist in SHADOW/VERIFIED long before activation and may
    // still exist after rollback. A deletion must not leave an untrashed page
    // with this Psipedia ID that could later be imported again. Collect every
    // explicitly linked page together with the historical mapping (if present).
    const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' "+
      "AND name IN ('breed_notion_sync','breed_notion_workcopy_links')")
      .all<{name:string}>();
    const present=new Set((tables.results??[]).map(item=>item.name));
    const targets:NotionTarget[]=[];
    let originalSource="";
    if(present.has("breed_notion_workcopy_links")) {
      const work=await db.prepare(
        "SELECT original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id "+
        "FROM breed_notion_workcopy_links WHERE breed_id=? LIMIT 1")
        .bind(id).first<{original_notion_page_id:string;work_notion_page_id:string;original_data_source_id:string;work_data_source_id:string}>();
      if(work) {
        originalSource=clean(work.original_data_source_id);
        targets.push({pageId:work.original_notion_page_id,sourceId:originalSource},
          {pageId:work.work_notion_page_id,sourceId:clean(work.work_data_source_id)});
      }
    }
    if(present.has("breed_notion_sync")) {
      const legacy=await db.prepare("SELECT notion_page_id FROM breed_notion_sync WHERE breed_id=? LIMIT 1")
        .bind(id).first<{notion_page_id:string}>();
      if(legacy?.notion_page_id)
        targets.push({pageId:legacy.notion_page_id,
          sourceId:clean(bindings.NOTION_BREEDS_DATA_SOURCE_ID||originalSource)});
    }
    const unique=new Map<string,NotionTarget>();
    for(const target of targets) {
      const key=target.pageId.replaceAll("-","").toLowerCase();
      const previous=unique.get(key);
      if(previous) {
        if(!sameId(previous.sourceId,target.sourceId))throw Error("NOTION_MAPPING_AMBIGUOUS");
      }else unique.set(key,target);
    }
    return [...unique.values()];
  }
  if (kind==="events") {
    // Event synchronization has two historical mapping paths: the original
    // event_notion_sync and the newer generic notion_agenda_sync. Deleting
    // locally while checking only one would orphan the other Notion page.
    const [legacy,agenda,target]=await Promise.all([
      db.prepare("SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1")
        .bind(id).first<{notion_page_id:string}>(),
      db.prepare("SELECT notion_page_id FROM notion_agenda_sync WHERE agenda='events' AND entity_id=? LIMIT 1")
        .bind(id).first<{notion_page_id:string}>(),
      db.prepare("SELECT data_source_id FROM notion_agenda_targets WHERE agenda='events' LIMIT 1")
        .first<{data_source_id:string}>(),
    ]);
    const primarySource=clean(bindings.NOTION_EVENTS_DATA_SOURCE_ID||target?.data_source_id);
    const secondarySource=clean(target?.data_source_id||bindings.NOTION_EVENTS_DATA_SOURCE_ID);
    const candidates:NotionTarget[]=[];
    if(legacy?.notion_page_id)candidates.push({pageId:legacy.notion_page_id,sourceId:primarySource});
    if(agenda?.notion_page_id)candidates.push({pageId:agenda.notion_page_id,sourceId:secondarySource});
    const unique=new Map<string,NotionTarget>();
    for(const candidate of candidates) {
      const key=candidate.pageId.replaceAll("-","").toLowerCase();
      const existing=unique.get(key);
      if(existing) {
        // Identical page identities must agree on the Notion source. A mapping
        // conflict is not permission to delete the wrong page.
        if(!sameId(existing.sourceId,candidate.sourceId))
          throw Error("NOTION_MAPPING_AMBIGUOUS");
      } else unique.set(key,candidate);
    }
    return [...unique.values()];
  }
  const map=mappingTables[kind];
  if (map) {
    const row=await db.prepare("SELECT notion_page_id FROM "+map.table+" WHERE "+map.entity+"=? LIMIT 1")
      .bind(id).first<{notion_page_id:string}>();
    if (!row?.notion_page_id) return [];
    const source=kind==="directory"?bindings.NOTION_DIRECTORY_DATA_SOURCE_ID:
      kind==="events"?bindings.NOTION_EVENTS_DATA_SOURCE_ID:
      kind==="breeds"?bindings.NOTION_BREEDS_DATA_SOURCE_ID:bindings.NOTION_ARTICLES_DATA_SOURCE_ID;
    return [{pageId:row.notion_page_id,sourceId:clean(source)}];
  }
  const agenda=specs[kind].agenda;
  if (!agenda) return [];
  const mapping=await db.prepare("SELECT notion_page_id FROM notion_agenda_sync WHERE agenda=? AND entity_id=? LIMIT 1")
    .bind(agenda,id).first<{notion_page_id:string}>();
  if (!mapping?.notion_page_id) return [];
  const target=await db.prepare("SELECT data_source_id FROM notion_agenda_targets WHERE agenda=? LIMIT 1")
    .bind(agenda).first<{data_source_id:string}>();
  const source=kind==="events"?(bindings.NOTION_EVENTS_DATA_SOURCE_ID||target?.data_source_id):target?.data_source_id;
  return [{pageId:mapping.notion_page_id,sourceId:clean(source)}];
}
async function tombstone(db:D1Database,kind:RecordKind,id:number) {
  return db.prepare("SELECT * FROM admin_record_tombstones WHERE kind=? AND record_id=? LIMIT 1")
    .bind(kind,id).first<Tombstone>();
}
export async function recordLifecyclePreview(db:D1Database,bindings:LifecycleBindings,kind:RecordKind,id:number) {
  if (!validateId(id)) throw Error("INVALID_RECORD_ID");
  const record=await canonical(db,kind,id);
  const removed=await tombstone(db,kind,id);
  if (!record && !removed) return null;
  const data=record?identity(kind,record):{
    kind,id,name:removed!.record_name,category:removed!.record_category,
    slug:removed!.record_slug,status:"deleted",published:false,
  };
  // A persisted tombstone is authoritative even if an administrator later
  // unlinks a Notion mapping. Do not infer identity from titles or fuzzy search.
  const targets=removed?JSON.parse(removed.notion_targets_json) as NotionTarget[]:
    await mappedTargets(db,bindings,kind,id);
  const guard=await db.prepare("SELECT remote_state,error_code FROM admin_record_publication_guards WHERE kind=? AND record_id=? LIMIT 1")
    .bind(kind,id).first<{remote_state:string;error_code:string|null}>();
  return { ...data, notionLinked:targets.length>0, notionPages:targets.length,
    removalState:removed?.state??null, removalError:removed?.error_code??null,
    publicationSync:guard?.remote_state??null, publicationError:guard?.error_code??null };
}
function notionText(page:Record<string,unknown>,name:string) {
  const p=(page.properties as Record<string,unknown>|undefined)?.[name];
  if (!p || typeof p!=="object") return "";
  const r=p as Record<string,unknown>;
  if (typeof r.number==="number") return String(r.number);
  const list=Array.isArray(r.rich_text)?r.rich_text:Array.isArray(r.title)?r.title:[];
  return list.map((item:unknown)=>item && typeof item==="object"?
    clean((item as Record<string,unknown>).plain_text):"").join("").trim();
}
async function requireOwnedNotionPage(
  bindings:LifecycleBindings,target:NotionTarget,id:number,allowTrashed:boolean,
) {
  requireDataSource(target.sourceId);
  const page=await notionRequest<Record<string,unknown>>(bindings,"/pages/"+encodeURIComponent(target.pageId));
  const parent=page.parent as {type?:string;data_source_id?:string}|undefined;
  if (!sameId(clean(page.id),target.pageId)
    || parent?.type!=="data_source_id"
    || !sameId(clean(parent.data_source_id),target.sourceId)
    || notionText(page,"Psipedia ID")!==String(id)
    || (!allowTrashed && !notionPageBelongsToDataSource(page as unknown as NotionOwnedPage,target.sourceId))) {
    throw Error("NOTION_IDENTITY_OR_SOURCE_MISMATCH");
  }
  return page;
}
function notionDraftProperties(kind:RecordKind,page:Record<string,unknown>) {
  // Work-copy breeds have no publication state in their 60+2 schema:
  // publication is D1-owned there; do not fabricate a Notion property.
  if (kind==="breeds" && !(page.properties as Record<string,unknown>|undefined)?.["Stav"])
    return null;
  const name=kind==="directory"||kind==="help"||kind==="lost-found"?"Psipedia stav":"Stav";
  if (!(page.properties as Record<string,unknown>|undefined)?.[name])
    throw Error("NOTION_PUBLICATION_PROPERTY_MISSING");
  // Articles must remain Ready so the existing approved Admin republish flow can succeed.
  const value=kind==="help"?"draft":kind==="lost-found"?"DRAFT":
    kind==="articles"?"Ready":kind==="breeds"?"Na kontrolu":"Koncept";
  const property=(page.properties as Record<string,unknown>)[name] as {type?:string};
  const publicationField=property.type==="status"?{status:{name:value}}:{select:{name:value}};
  // Directory mirrors two distinct fields: Psipedia publication vs editorial
  // readiness. Preserve the existing READY editorial transition, never leave
  // a stale Published editorial marker after Admin unpublishes.
  const state=(page.properties as Record<string,unknown>)["Stav"] as {type?:string}|undefined;
  if(kind==="directory" && state){
    const editorial=state.type==="status"?{status:{name:"Ready"}}:{select:{name:"Ready"}};
    return {[name]:publicationField,"Stav":editorial};
  }
  return { [name]:publicationField };
}
async function mirrorDraft(db:D1Database,bindings:LifecycleBindings,kind:RecordKind,id:number,targets:NotionTarget[]) {
  if (!targets.length) return "UNLINKED" as const;
  let changed=0;
  for (const target of targets) {
    const page=await requireOwnedNotionPage(bindings,target,id,false);
    const properties=notionDraftProperties(kind,page);
    if (!properties) continue;
    await notionRequest(bindings,"/pages/"+encodeURIComponent(target.pageId),{
      method:"PATCH",body:JSON.stringify({properties}),
    });
    const verified=await requireOwnedNotionPage(bindings,target,id,false);
    for(const expected of Object.entries(properties)) {
    const p=(verified.properties as Record<string,unknown>|undefined)?.[expected[0]] as
      {select?:{name?:string};status?:{name?:string}}|undefined;
    const selected=p?.select?.name??p?.status?.name??"";
    const desired=(expected[1] as {select?:{name:string};status?:{name:string}}).select?.name
      ??(expected[1] as {status?:{name:string}}).status?.name;
    if (selected!==desired) throw Error("NOTION_PUBLICATION_NOT_CONFIRMED");
    }
    changed++;
  }
  return changed?"SYNCED" as const:"NOT_APPLICABLE" as const;
}
/** D1 state and a persistent inbound guard are committed before any remote call. */
export async function unpublishRecord(db:D1Database,bindings:LifecycleBindings,kind:RecordKind,id:number) {
  const row=await canonical(db,kind,id);
  if (!row) throw Error("RECORD_NOT_FOUND");
  if (await tombstone(db,kind,id)) throw Error("RECORD_REMOVAL_IN_PROGRESS");
  const spec=specs[kind],now=new Date().toISOString();
  if(!spec.publicStatuses.includes(clean(row.status)) && clean(row.status)!==spec.draft)
    throw Error("RECORD_NOT_PUBLIC");
  const guard=await db.prepare("INSERT INTO admin_record_publication_guards (kind,record_id,remote_state,error_code,updated_at) VALUES (?,?,'PENDING',NULL,?) "+
    "ON CONFLICT(kind,record_id) DO UPDATE SET remote_state='PENDING',error_code=NULL,updated_at=excluded.updated_at")
    .bind(kind,id,now);
  // Publication field + revision only; no form payload, media or editorial changes.
  // Do not rely on a stale status from the preview when another editor just
  // published or saved this record. The scoped, id-only hide is committed with
  // the guard; a zero-row outcome must never be reported as unpublished.
  const update=db.prepare("UPDATE "+spec.table+" SET status=?,updated_at=? WHERE id=?")
    .bind(spec.draft,now,id);
  const [,hideResult]=await db.batch([guard,update]);
  if((hideResult.meta?.changes??0)!==1) throw Error("RECORD_HIDE_NOT_CONFIRMED");
  let remoteState:"SYNCED"|"UNLINKED"|"NOT_APPLICABLE"|"PENDING"="PENDING";
  let code:string|null=null;
  try {
    const targets=await mappedTargets(db,bindings,kind,id);
    remoteState=await mirrorDraft(db,bindings,kind,id,targets);
  } catch(error) {
    code=error instanceof Error && /^(NOTION_[A-Z0-9_]+)$/.test(error.message)
      ?error.message:"NOTION_WRITEBACK_UNAVAILABLE";
  }
  await db.prepare("UPDATE admin_record_publication_guards SET remote_state=?,error_code=?,updated_at=? WHERE kind=? AND record_id=?")
    .bind(remoteState,code,new Date().toISOString(),kind,id).run();
  return {state:"draft",updatedAt:now,notionSync:remoteState,errorCode:code};
}
/** Called only AFTER a successful explicit Admin publication; never by Notion sync. */
export async function clearAdminUnpublishGuard(db:D1Database,kind:RecordKind,id:number) {
  try {
    await db.prepare("DELETE FROM admin_record_publication_guards WHERE kind=? AND record_id=?").bind(kind,id).run();
  } catch(error) {
    if(error instanceof Error && /no such table: admin_record_publication_guards/i.test(error.message))return;
    throw error;
  }
}
/** Explicit successful Admin publish removes the inbound publication guard. */
export async function acknowledgeAdminPublication(db:D1Database|undefined,kind:RecordKind,id:number,status:string) {
  if(db && specs[kind].publicStatuses.includes(status))await clearAdminUnpublishGuard(db,kind,id);
}
export async function adminUnpublishedGuard(db:D1Database,kind:RecordKind,id:number) {
  try {
    const row=await db.prepare("SELECT 1 AS found FROM admin_record_publication_guards WHERE kind=? AND record_id=? LIMIT 1")
      .bind(kind,id).first<{found:number}>();
    return Boolean(row?.found);
  } catch(error) {
    // Sync workers can be deployed before the owner runs additive migration
    // 0164. In that case no record has been explicitly unpublished by this API.
    if(error instanceof Error && /no such table: admin_record_publication_guards/i.test(error.message))return false;
    throw error;
  }
}

/** Guard mapped Notion pages against any automatic inbound status write while
 * an Admin unpublish is in effect. The protection is deliberately independent
 * of Notion's editorial readiness ('Ready') and remains until explicit Admin
 * publication clears the guard. Existing field values are not deleted. */
export async function notionPageHasAdminUnpublishGuard(db:D1Database,pageId:string) {
  if(!pageId)return false;
  // Some deployments run this Worker before the owner executes migration
  // 0164, and optional legacy mapping tables can be absent as well. Inspect
  // the actual schema before preparing SQL that refers to those tables.
  const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' "+
    "AND name IN ('admin_record_publication_guards','directory_notion_sync','event_notion_sync',"+
    "'breed_notion_sync','breed_notion_workcopy_links','article_notion_sync','notion_agenda_sync')")
    .all<{name:string}>();
  const present=new Set((tables.results??[]).map(row=>row.name));
  if(!present.has("admin_record_publication_guards"))return false;
  const clauses:string[]=[];
  const params:string[]=[];
  const add=(table:string,sql:string,count=1)=>{
    if(!present.has(table))return;
    clauses.push(sql);
    for(let i=0;i<count;i++)params.push(pageId);
  };
  add("directory_notion_sync",
    "(g.kind='directory' AND EXISTS(SELECT 1 FROM directory_notion_sync m WHERE m.notion_page_id=? AND m.directory_profile_id=g.record_id))");
  add("event_notion_sync",
    "(g.kind='events' AND EXISTS(SELECT 1 FROM event_notion_sync m WHERE m.notion_page_id=? AND m.event_id=g.record_id))");
  add("breed_notion_sync",
    "(g.kind='breeds' AND EXISTS(SELECT 1 FROM breed_notion_sync m WHERE m.notion_page_id=? AND m.breed_id=g.record_id))");
  add("breed_notion_workcopy_links",
    "(g.kind='breeds' AND EXISTS(SELECT 1 FROM breed_notion_workcopy_links w WHERE w.breed_id=g.record_id "+
    "AND w.status='ACTIVE' AND (w.original_notion_page_id=? OR w.work_notion_page_id=?)))",2);
  add("article_notion_sync",
    "(g.kind='articles' AND EXISTS(SELECT 1 FROM article_notion_sync m WHERE m.notion_page_id=? AND m.article_id=g.record_id))");
  add("notion_agenda_sync",
    "(g.kind IN ('events','help','adoptions','lost-found','organizations') AND EXISTS("+
    "SELECT 1 FROM notion_agenda_sync m WHERE m.notion_page_id=? AND m.entity_id=g.record_id AND "+
    "m.agenda=CASE g.kind WHEN 'events' THEN 'events' WHEN 'help' THEN 'help-cases' "+
    "WHEN 'adoptions' THEN 'adoptions' WHEN 'lost-found' THEN 'lost-found' "+
    "ELSE 'organizations' END))");
  if(!clauses.length)return false;
  const row=await db.prepare("SELECT 1 AS found FROM admin_record_publication_guards g WHERE "+
    clauses.join(" OR ")+" LIMIT 1").bind(...params).first<{found:number}>();
  return Boolean(row?.found);
}

/** Used only on inbound Notion sweeps. Tombstones prevent resurrection; a
 * publication guard prevents a later source revision from republishing the
 * canonical draft. An owner may explicitly publish through Admin. */
export async function notionPageMustSkipInboundSync(db:D1Database,pageId:string) {
  if(await notionPageIsTombstoned(db,pageId))return true;
  return notionPageHasAdminUnpublishGuard(db,pageId);
}
export async function notionPageIsTombstoned(db:D1Database,pageId:string) {
  try {
    const row=await db.prepare("SELECT 1 AS found FROM admin_record_tombstones WHERE notion_page_id=? OR EXISTS ("+
      "SELECT 1 FROM json_each(admin_record_tombstones.notion_targets_json) "+
      "WHERE json_extract(json_each.value,'$.pageId')=?) LIMIT 1")
      .bind(pageId,pageId).first<{found:number}>();
    return Boolean(row?.found);
  } catch (error) {
    // Existing sync workers may deploy before the owner explicitly applies
    // additive migration 0164. The destructive API remains disabled until then.
    if (error instanceof Error && /no such table: admin_record_tombstones/i.test(error.message)) return false;
    throw error;
  }
}
async function setRemovalError(db:D1Database,kind:RecordKind,id:number,code:string) {
  await db.prepare("UPDATE admin_record_tombstones SET state='ERROR_NOTION',error_code=?,attempts=attempts+1,updated_at=? WHERE kind=? AND record_id=? AND state<>'COMPLETE'")
    .bind(code,new Date().toISOString(),kind,id).run();
}
async function verifyTrash(bindings:LifecycleBindings,target:NotionTarget,id:number) {
  const page=await requireOwnedNotionPage(bindings,target,id,true);
  if (page.in_trash===true) return;
  await notionRequest(bindings,"/pages/"+encodeURIComponent(target.pageId),{
    method:"PATCH",body:JSON.stringify({in_trash:true}),
  });
  // Never trust the PATCH response alone: a separate GET proves trash status.
  const confirmed=await requireOwnedNotionPage(bindings,target,id,true);
  if (confirmed.in_trash!==true) throw Error("NOTION_TRASH_NOT_CONFIRMED");
}
/** Accept only stable keys collected from the deleted row; never delete by URL or filename guess. */
function mediaKeys(row:CanonicalRow) {
  const found=new Set<string>();
  for (const [key,value] of Object.entries(row)) {
    if (typeof value==="string" && /^(?:image_key|og_image_key|main_image_key)$/.test(key)) found.add(value);
    if (typeof value==="string" && /^(?:gallery_json|blocks_json)$/.test(key)) {
      try {
        const walk=(node:unknown,depth:number):void=>{
          if(depth>8||node==null)return;
          if(Array.isArray(node)) {for(const item of node)walk(item,depth+1);return;}
          if(typeof node!=="object")return;
          for(const [k,v] of Object.entries(node)) {
            if ((k==="imageKey"||k==="mainImageKey"||k==="key")&&typeof v==="string")found.add(v);
            else walk(v,depth+1);
          }
        };walk(JSON.parse(value),0);
      } catch { /* unparseable legacy metadata must not trigger arbitrary R2 deletion */ }
    }
  }
  return [...found].filter(key=>key.length>3&&key.length<400&&!key.includes("..")
    &&!/[:?#]/.test(key)&&/^[A-Za-z0-9/_\-.]+$/.test(key)).slice(0,60);
}
/** Exhaustive schema-driven reference check; unknown image containers fail closed. */
async function keyStillReferenced(db:D1Database,key:string) {
  const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all<{name:string}>();
  for(const {name} of tables.results??[]) {
    if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)||name==="admin_record_tombstones")continue;
    const columns=await db.prepare("PRAGMA table_info("+name+")").all<{name:string;type:string}>();
    for(const col of columns.results??[]) {
      if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(col.name))continue;
      if(!/(image|gallery|photo|media|asset|blocks|_key$)/i.test(col.name))continue;
      const used=await db.prepare("SELECT 1 AS found FROM "+name+" WHERE instr(CAST("+col.name+" AS TEXT),?)>0 LIMIT 1")
        .bind(key).first<{found:number}>();
      if(used) return true;
    }
  }
  return false;
}
async function removeExclusiveMedia(db:D1Database,bindings:LifecycleBindings,record:CanonicalRow) {
  const bucket=bindings.BUCKET;
  if(!bucket)return {removed:0,preserved:mediaKeys(record).length};
  let removed=0,preserved=0;
  for(const key of mediaKeys(record)) {
    try {
      if(await keyStillReferenced(db,key)){preserved++;continue;}
      await bucket.delete(key);removed++;
    }catch{preserved++;} // uncertain ownership is never grounds for deletion
  }
  return {removed,preserved};
}
const syncMappings: Partial<Record<RecordKind,{table:string;entity:string}>> = mappingTables;
async function completeLocalRemoval(db:D1Database,kind:RecordKind,id:number,targets:NotionTarget[]) {
  const spec=specs[kind];
  const statements:D1PreparedStatement[]=[];
  // Historical deployments can have different optional journal tables.
  // Only issue narrowly scoped cleanup for tables that actually exist.
  const schema=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>();
  const present=new Set((schema.results??[]).map(item=>item.name));
  const now=new Date().toISOString();
  const mapping=syncMappings[kind];
  if(mapping && present.has(mapping.table))
    statements.push(db.prepare("DELETE FROM "+mapping.table+" WHERE "+mapping.entity+"=?").bind(id));
  if(spec.agenda && present.has("notion_agenda_sync"))
    statements.push(db.prepare("DELETE FROM notion_agenda_sync WHERE agenda=? AND entity_id=?").bind(spec.agenda,id));
  if(kind==="breeds") {
    // Keep deletion safe on deployments where SQLite foreign-key cascades are
    // disabled or temporarily deferred. Both are exact canonical-ID links.
    if(present.has("breed_notion_workcopy_links"))
      statements.push(db.prepare("DELETE FROM breed_notion_workcopy_links WHERE breed_id=?").bind(id));
    if(present.has("breed_notion_controlled_values"))
      statements.push(db.prepare("DELETE FROM breed_notion_controlled_values WHERE breed_id=?").bind(id));
  }
  // Delete only join rows or dangling foreign keys, never related entities.
  // These relation tables are optional on earlier D1 deployments.
  if(kind==="articles" && present.has("breed_article_relations"))
    statements.push(db.prepare("DELETE FROM breed_article_relations WHERE article_id=?").bind(id));
  if(kind==="breeds") {
    if(present.has("breed_article_relations"))
      statements.push(db.prepare("DELETE FROM breed_article_relations WHERE breed_id=?").bind(id));
    if(present.has("breed_directory_relations"))
      statements.push(db.prepare("DELETE FROM breed_directory_relations WHERE breed_id=?").bind(id));
  }
  if(kind==="directory" && present.has("breed_directory_relations"))
    statements.push(db.prepare("DELETE FROM breed_directory_relations WHERE profile_id=?").bind(id));
  if(kind==="organizations") statements.push(db.prepare("UPDATE adoption_dogs SET organization_id=NULL WHERE organization_id=?").bind(id));
  if(present.has("notion_profile_field_baselines") &&
      ["directory","events","organizations","adoptions","help","lost-found"].includes(kind)) {
    statements.push(db.prepare("DELETE FROM notion_profile_field_baselines WHERE agenda=? AND entity_id=?")
      .bind(spec.agenda??kind,id));
  }
  // Remove stale source-check queues, never a related organization or dog.
  if(present.has("help_source_checks") && (kind==="adoptions" || kind==="lost-found")) {
    statements.push(db.prepare("DELETE FROM help_source_checks WHERE entity_type=? AND entity_id=?")
      .bind(kind==="adoptions"?"ADOPTION":"LOST_FOUND",id));
  }
  // Media reviews are immutable and reference their monitor via FK. Preserve
  // that monitor for audit, but make it permanently ineligible for polling.
  const mediaEntity=kind==="directory"?"DIRECTORY_PROFILE":kind==="events"?"MANAGED_EVENT":null;
  if(mediaEntity && present.has("media_source_monitors")) {
    if(present.has("media_source_review_decisions")) {
      statements.push(db.prepare(
        "DELETE FROM media_source_monitors WHERE entity_type=? AND entity_id=? "+
        "AND NOT EXISTS(SELECT 1 FROM media_source_review_decisions WHERE monitor_id=media_source_monitors.id)")
        .bind(mediaEntity,id));
    } else {
      statements.push(db.prepare("DELETE FROM media_source_monitors WHERE entity_type=? AND entity_id=?")
        .bind(mediaEntity,id));
    }
    statements.push(db.prepare(
      "UPDATE media_source_monitors SET status='UNTRACKED',last_checked_at='9999-12-31T23:59:59Z', "+
      "source_page_url=NULL,source_image_url=NULL,candidate_image_url=NULL,candidate_image_key=NULL,updated_at=? "+
      "WHERE entity_type=? AND entity_id=?").bind(now,mediaEntity,id));
  }
  for(const target of targets) {
    if(present.has("notion_webhook_inbox"))
      statements.push(db.prepare("DELETE FROM notion_webhook_inbox WHERE page_id=?").bind(target.pageId));
    if(present.has("gemini_notion_created_pages"))
      statements.push(db.prepare("DELETE FROM gemini_notion_created_pages WHERE notion_page_id=?").bind(target.pageId));
    if(present.has("notion_manual_transfer_items")) {
      statements.push(db.prepare(
        "UPDATE notion_manual_transfer_items SET status='SKIPPED',last_error_code='RECORD_TOMBSTONED',"+
        "finished_at=?,updated_at=? WHERE notion_page_id=? AND status NOT IN ('DONE','SKIPPED')")
        .bind(now,now,target.pageId));
    }
  }
  statements.push(db.prepare("DELETE FROM "+spec.table+" WHERE id=?").bind(id));
  statements.push(db.prepare("DELETE FROM admin_record_publication_guards WHERE kind=? AND record_id=?").bind(kind,id));
  statements.push(db.prepare("UPDATE admin_record_tombstones SET state='COMPLETE',error_code=NULL,completed_at=?,updated_at=? WHERE kind=? AND record_id=?")
    .bind(new Date().toISOString(),new Date().toISOString(),kind,id));
  await db.batch(statements);
}
export async function removeRecord(db:D1Database,bindings:LifecycleBindings,kind:RecordKind,id:number,
  owner:string,localOnly:boolean,expected:{slug:string;name:string;category:string}) {
  // The owner confirmed the concrete name, category and slug rendered by the
  // preflight dialog. Never delete a renamed/reclassified entity based on a
  // stale confirmation, even when the numeric D1 ID still matches.
  const matches=(item:{slug:string;name:string;category:string}) =>
    item.slug===expected.slug && item.name===expected.name && item.category===expected.category;
  let prior=await tombstone(db,kind,id);
  if(prior?.state==="COMPLETE") {
    if(!matches({slug:prior.record_slug,name:prior.record_name,category:prior.record_category}))
      throw Error("RECORD_CONFIRMATION_MISMATCH");
    return {state:"COMPLETE",id,notionTrash:prior.notion_page_id?"confirmed":"unlinked",media:{removed:0,preserved:0}};
  }
  const row=await canonical(db,kind,id);
  if(!row)throw Error("RECORD_NOT_FOUND");
  const meta=identity(kind,row),now=new Date().toISOString();
  if(!matches(meta))throw Error("RECORD_CONFIRMATION_MISMATCH");
  let targets:NotionTarget[];
  if(prior) {
    targets=JSON.parse(prior.notion_targets_json) as NotionTarget[];
  }else{
    targets=await mappedTargets(db,bindings,kind,id);
    if(!targets.length&&!localOnly)throw Error("LOCAL_ONLY_CONFIRMATION_REQUIRED");
    const spec=specs[kind];
    const insert=db.prepare("INSERT INTO admin_record_tombstones "+
      "(kind,record_id,record_slug,record_external_key,record_name,record_category,notion_page_id,notion_data_source_id,notion_targets_json,state,error_code,created_by,created_at,updated_at) "+
      "VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)")
      .bind(kind,id,meta.slug,externalTombstoneKey(kind,row),meta.name,meta.category,targets[0]?.pageId??null,targets[0]?.sourceId??null,
        JSON.stringify(targets),targets.length?"PENDING_NOTION":"READY_LOCAL",owner,now,now);
    // Tombstone + hide are one D1 transaction. A competing editorial update
    // may change status after the earlier read; id-only UPDATE still hides the
    // exact canonical entity that the owner confirmed.
    const hide=db.prepare("UPDATE "+spec.table+" SET status=?,updated_at=? WHERE id=?")
      .bind(spec.draft,now,id);
    try {
      const [,hideResult]=await db.batch([insert,hide]);
      if((hideResult.meta?.changes??0)!==1) {
        // Do not start irreversible Notion trash if D1 no longer contains the
        // expected row. Tombstone remains as a durable import barrier.
        throw Error("RECORD_HIDE_NOT_CONFIRMED");
      }
    } catch (error) {
      // Two administrators may confirm the same record concurrently. The
      // losing transaction must re-use the winner's exact persisted targets,
      // never perform another insert, guess a Notion page or undo the hide.
      const raced=await tombstone(db,kind,id);
      if(!raced)throw error;
      // A zero-row hide is not a concurrent-delete success; it is a failed
      // confirmation. Never proceed to remote trash in that case.
      if(error instanceof Error && error.message==="RECORD_HIDE_NOT_CONFIRMED")throw error;
      if(raced.record_slug!==meta.slug)throw Error("RECORD_TOMBSTONE_IDENTITY_CHANGED");
      if(raced.state==="COMPLETE")return {state:"COMPLETE",id,notionTrash:raced.notion_page_id?"confirmed":"unlinked",media:{removed:0,preserved:0}};
      prior=raced;
      targets=JSON.parse(raced.notion_targets_json) as NotionTarget[];
    }
  }
  if(prior?.state!=="READY_LOCAL") {
    // A previous READY_LOCAL receipt already proves that every linked page
    // reached Notion trash. Retrying D1 cleanup after a local failure must not
    // depend on Notion's later availability or re-trash an unrelated page.
    try{
      for(const target of targets)await verifyTrash(bindings,target,id);
    }catch(error){
      const code=error instanceof Error && /^NOTION_[A-Z0-9_]+$/.test(error.message)?
        error.message:"NOTION_UNAVAILABLE";
      await setRemovalError(db,kind,id,code);
      return {state:"ERROR_NOTION",id,notionTrash:"not-confirmed",errorCode:code,media:{removed:0,preserved:mediaKeys(row).length}};
    }
    // READY_LOCAL is a durable receipt that every linked Notion page has been
    // independently verified in trash (or local-only consent was explicit).
    await db.prepare("UPDATE admin_record_tombstones SET state='READY_LOCAL',error_code=NULL,updated_at=? WHERE kind=? AND record_id=? AND state<>'COMPLETE'")
      .bind(new Date().toISOString(),kind,id).run();
  }
  try {
    await completeLocalRemoval(db,kind,id,targets);
  }catch{
    // All Notion pages have been confirmed in trash, but local D1 cleanup must
    // remain retryable; the record stays hidden behind the persistent tombstone.
    await db.prepare("UPDATE admin_record_tombstones SET state='READY_LOCAL',error_code='D1_DELETE_PENDING',updated_at=? WHERE kind=? AND record_id=?")
      .bind(new Date().toISOString(),kind,id).run();
    return {state:"READY_LOCAL",id,notionTrash:targets.length?"confirmed":"unlinked",errorCode:"D1_DELETE_PENDING",media:{removed:0,preserved:mediaKeys(row).length}};
  }
  const media=await removeExclusiveMedia(db,bindings,row);
  return {state:"COMPLETE",id,notionTrash:targets.length?"confirmed":"unlinked",media};
}
