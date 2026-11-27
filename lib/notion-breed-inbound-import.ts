import { prepareBreedMediaProofs, physicalBreedMediaValue } from "./notion-profile-owned-media.ts";
import { acquireGeminiNotionLock } from "./gemini-notion-review-lock.ts";
import { createNotionWorkOnlyBreedDraft, type ManagedBreedInput } from "./breed-store";
import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry";
import { readInboundBreedDraft, readInboundBreedIdentity } from "./notion-breed-inbound-draft.mjs";
import { notionRequest, notionRichTextProperty, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership";
import { notionPageIsTombstoned } from "./admin-record-lifecycle";

type OwnedPage=NotionPage&{parent?:{type?:string;data_source_id?:string;database_id?:string};archived?:boolean;in_trash?:boolean};
type Link={breed_id:number;work_notion_page_id:string;work_data_source_id:string;canonical_slug:string;original_notion_page_id:string|null;status:string;work_last_error_code:string|null;updated_at:string};
type Outcome="created"|"recovered"|"already-mapped"|"not-ready"|"review-required";
const norm=(id:string)=>id.replaceAll("-","").toLowerCase();
const pending="INBOUND_ID_PENDING";
const rich=(value:string)=>({rich_text:[{text:{content:value}}]});

/** The D1 mapping is provisional until the provider identity echoes.
 * A duplicate/old source never becomes a new breed. Remote PATCH only
 * acknowledges the immutable ID and canonical slug, never editorial data.
 * Ambiguous local commits retain the existing durable page lock. */
export async function importNewBreedWorkCopy(input:{
  database:D1Database;bindings:NotionSyncBindings;pageId:string;sourceId:string;
}):Promise<Outcome>{
  const {database:db,bindings,pageId,sourceId}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||
    !/^[a-f0-9]{32}$/i.test(norm(pageId))||!/^[a-f0-9]{32}$/i.test(norm(sourceId)))
    throw Error("BREED_INBOUND_SCOPE_INVALID");
  const columns=await db.prepare("PRAGMA table_info(breed_notion_workcopy_links)").all<{name:string;notnull:number}>();
  if(!["original_notion_page_id","original_data_source_id","original_sync_receipt","fci_number"].every(name=>columns.results?.some(column=>column.name===name&&column.notnull===0)))
    throw Error("BREED_WORKONLY_SCHEMA_REQUIRED");
  const mapping=()=>db.prepare("SELECT * FROM breed_notion_workcopy_links WHERE replace(lower(work_notion_page_id),'-','')=? LIMIT 1")
    .bind(norm(pageId)).first<Link>();
  const read=async()=>{
    const page=await notionRequest<OwnedPage>(bindings,"/pages/"+encodeURIComponent(pageId));
    if(norm(page.id)!==norm(pageId)||page.archived||page.in_trash||!notionPageBelongsToDataSource(page,sourceId)||
      !page.last_edited_time)throw Error("BREED_INBOUND_PAGE_IDENTITY");
    return page;
  };
  if(await notionPageIsTombstoned(db,pageId))return "review-required";
  const releaseAgenda=await acquireGeminiNotionLock(db,"notion-breed-workonly-import");
  if(!releaseAgenda)throw Error("BREED_INBOUND_BUSY");
  let releasePage:Awaited<ReturnType<typeof acquireGeminiNotionLock>>=null;
  let uncertain=false;
  try{
    releasePage=await acquireGeminiNotionLock(db,pageId);
    if(!releasePage)throw Error("BREED_INBOUND_PAGE_BUSY");
    let link=await mapping();
    if(link&&link.work_last_error_code!==pending)return "already-mapped";
    if(await notionPageIsTombstoned(db,pageId))return "review-required";
    let page=await read();
    let created=false;
    if(!link){
      const identity=readInboundBreedIdentity(page);
      if(identity.id||identity.source||identity.reviewed)return "review-required";
      const legacy=await db.prepare("SELECT 1 AS found FROM breed_notion_sync WHERE replace(lower(notion_page_id),'-','')=? UNION ALL "+
        "SELECT 1 AS found FROM breed_notion_workcopy_links WHERE replace(lower(original_notion_page_id),'-','')=? LIMIT 1")
        .bind(norm(pageId),norm(pageId)).first<{found:number}>();
      if(legacy)return "review-required";
      const decoded=readInboundBreedDraft(page,BREED_NOTION_SCHEMA);
      if(!decoded)return "not-ready";
      const draft=decoded.payload;
      const duplicate=await db.prepare("SELECT 1 AS found FROM managed_breeds WHERE slug=? OR lower(trim(name))=lower(trim(?)) OR (? IS NOT NULL AND fci_number=?) "+
        "UNION ALL SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND (record_slug=? OR lower(trim(record_name))=lower(trim(?)) OR (? IS NOT NULL AND record_external_key=CAST(? AS TEXT))) LIMIT 1")
        .bind(draft.slug,draft.name,draft.fciNumber,draft.fciNumber,draft.slug,draft.name,draft.fciNumber,draft.fciNumber).first<{found:number}>();
      if(duplicate)return "review-required";
      const media=await prepareBreedMediaProofs("image",draft.image??"","",bindings);
      const gallery=await prepareBreedMediaProofs("gallery",draft.gallery??[],[],bindings);
      const payload={...draft,image:physicalBreedMediaValue("image",draft.image??"",media),imageKey:media[0]?.key??null,
        gallery:physicalBreedMediaValue("gallery",draft.gallery??[],gallery)};
      const fresh=await read();
      if(fresh.last_edited_time!==page.last_edited_time)throw Error("BREED_INBOUND_REVISION_CHANGED");
      if(await notionPageIsTombstoned(db,pageId))return "review-required";
      uncertain=true;
      const local=await createNotionWorkOnlyBreedDraft({database:db,payload:payload as ManagedBreedInput,
        controlled:decoded.controlled,pageId:page.id,sourceId,remoteRevision:page.last_edited_time!,lockOwnerPage:releasePage.owner});
      link=await mapping();
      if(!link||link.breed_id!==local.id||link.updated_at!==local.revision||link.work_last_error_code!==pending)
        throw Error("BREED_INBOUND_MAPPING_UNVERIFIED");
      uncertain=false;
      created=true;
    }
    if(link.status!=="ACTIVE"||link.original_notion_page_id!==null||
      norm(link.work_notion_page_id)!==norm(pageId)||norm(link.work_data_source_id)!==norm(sourceId))
      return "review-required";
    const id=link.breed_id,revision=link.updated_at,slug=link.canonical_slug;
    const current=()=>db.prepare("SELECT p.id FROM managed_breeds p JOIN breed_notion_workcopy_links l ON l.breed_id=p.id "+
      "WHERE p.id=? AND p.status='draft' AND p.slug=? AND p.updated_at=? AND l.work_notion_page_id=? AND l.updated_at=? AND l.work_last_error_code=? "+
      "AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='BREED' AND entity_id=p.id) "+
      "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=p.id) "+
      "AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda='breeds' AND entity_id=CAST(p.id AS TEXT))")
      .bind(id,slug,revision,link!.work_notion_page_id,revision,pending).first<{id:number}>();
    if(!await current())return "review-required";
    page=await read();
    const identity=readInboundBreedIdentity(page);
    const rawSlug=page.properties?.["URL profil / slug"] as {type?:string;rich_text?:unknown[];has_more?:boolean}|undefined;
    const remoteSlug=notionRichTextProperty(page,"URL profil / slug");
    if(identity.source||identity.reviewed||(identity.id&&identity.id!==String(id))||
      rawSlug?.type!=="rich_text"||rawSlug.has_more||!Array.isArray(rawSlug.rich_text)||rawSlug.rich_text.length>=25||
      (remoteSlug&&remoteSlug!==slug))return "review-required";
    const patch:Record<string,unknown>={};
    if(!identity.id)patch["Psipedia ID"]=rich(String(id));
    if(!remoteSlug)patch["URL profil / slug"]=rich(slug);
    if(Object.keys(patch).length){
      const latest=await read();
      if(latest.last_edited_time!==page.last_edited_time||!await current())throw Error("BREED_INBOUND_IDENTITY_CHANGED");
      // No retry of an uncertain provider write within the same request.
      // On retry the existing provisional mapping is reused, never inserted.
      await notionRequest<OwnedPage>(bindings,"/pages/"+encodeURIComponent(pageId),{
        method:"PATCH",body:JSON.stringify({properties:patch})
      },{retryTransient:false});
    }
    const verified=await read();
    const echoed=readInboundBreedIdentity(verified);
    if(echoed.id!==String(id)||echoed.source||echoed.reviewed||
      notionRichTextProperty(verified,"URL profil / slug")!==slug||!await current())
      throw Error("BREED_INBOUND_IDENTITY_UNVERIFIED");
    const now=new Date().toISOString();
    // Do not fabricate a verified field baseline: subsequent pulls must
    // independently observe the current Notion value (including late edits).
    const result=await db.prepare("UPDATE breed_notion_workcopy_links SET work_last_error_code=NULL,work_notion_last_edited_time=?,verified_at=?,updated_at=? "+
      "WHERE breed_id=? AND work_notion_page_id=? AND updated_at=? AND work_last_error_code=? "+
      "AND EXISTS(SELECT 1 FROM managed_breeds WHERE id=? AND updated_at=? AND status='draft') "+
      "AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='BREED' AND entity_id=?) "+
      "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=?) "+
      "AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda='breeds' AND entity_id=?) "+
      "AND EXISTS(SELECT 1 FROM gemini_notion_review_locks WHERE notion_page_id=? AND owner=?)")
      .bind(verified.last_edited_time,now,now,id,link.work_notion_page_id,revision,pending,id,revision,id,id,String(id),norm(pageId),releasePage.owner).run();
    if(!result.success||result.meta.changes!==1)throw Error("BREED_INBOUND_FINALIZE_CONFLICT");
    return created?"created":"recovered";
  }finally{
    if(!uncertain){
      if(releasePage)await releasePage();
      await releaseAgenda();
    }
  }
}
