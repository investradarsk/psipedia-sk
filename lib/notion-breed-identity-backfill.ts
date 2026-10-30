import { HISTORICAL_FCI_BY_SLUG } from "./breed-fci-historical-reference.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import {
  notionRequest, notionRichTextProperty, notionTitleProperty, notionNumberProperty,
  notionSelectProperty, notionPropertyRecord,
  type NotionPage, type NotionSyncBindings,
} from "./notion-sync-shared.ts";

/**
 * Owner-invoked metadata-only backfill. Never creates breeds, copies editorial
 * content, changes publication, replaces photos or overwrites a conflicting ID.
 * All IDs come from live canonical D1; GitHub history is only a second check
 * before filling a *missing* D1 FCI number.
 */
type Page = NotionPage & {
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean; in_trash?: boolean;
};
type DbBreed = {
  id: number; slug: string; name: string; fci_number: number | null;
  status: string; updated_at: string;
};
type LinkRow = { notion_page_id: string; breed_id: number };
export type BreedIdentityBackfillSummary = {
  scanned: number; matched: number; linked: number; mappingsCreated: number;
  fciNotionFilled: number; fciD1Filled: number; alreadyLinked: number;
  conflicts: number; unmatched: number; unapproved: number; failed: number;
  remaining: number; canContinue: boolean;
  review: Array<{ slug: string; reason: string }>;
};
const VALID_UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const APPROVED=new Set(["Ready","Publikované"]);
const MAX_WRITES=20;
const MAX_NOTION_PAGES=500;

export function evaluateBreedIdentity(input:{
  notionSlug:string;notionFci:number|null;notionId:string;
  canonical:DbBreed|null;countBySlug:number;countByFci:number;
  mappedPageId?:string|null;expectedPageId:string;mappedBreedId?:number|null;
  approved:boolean;
}):"ok"|"not-approved"|"missing"|"duplicate-notion"|"conflict-id"|"conflict-mapping"|"conflict-fci"|"missing-fci" {
  const p=input;
  if(!p.approved)return "not-approved";
  if(!p.canonical)return "missing";
  if(p.countBySlug!==1 || (p.notionFci!==null && p.countByFci!==1))
    return "duplicate-notion";
  if(p.notionId && p.notionId!==String(p.canonical.id))return "conflict-id";
  if((p.mappedPageId && p.mappedPageId!==p.expectedPageId) ||
     (p.mappedBreedId!=null && p.mappedBreedId!==p.canonical.id))
    return "conflict-mapping";
  if(p.notionFci===null && !(p.canonical.fci_number && p.canonical.fci_number>0))
    return "missing-fci";
  if(p.notionFci!=null && p.canonical.fci_number!=null &&
     p.canonical.fci_number>0 && p.notionFci!==p.canonical.fci_number)
    return "conflict-fci";
  if(p.notionFci!=null && !(p.canonical.fci_number && p.canonical.fci_number>0) &&
     HISTORICAL_FCI_BY_SLUG[p.notionSlug]!==p.notionFci)
    return "conflict-fci";
  return "ok";
}

export async function runBreedIdentityBackfill(input:{
  db:D1Database;
  bindings:NotionSyncBindings & {NOTION_BREEDS_DATA_SOURCE_ID?:string};
  apply:boolean;maxWrites?:number;
}):Promise<BreedIdentityBackfillSummary>{
  const result:BreedIdentityBackfillSummary={
    scanned:0,matched:0,linked:0,mappingsCreated:0,
    fciNotionFilled:0,fciD1Filled:0,alreadyLinked:0,
    conflicts:0,unmatched:0,unapproved:0,failed:0,
    remaining:0,canContinue:false,review:[],
  };
  const {db,bindings}=input;
  const sourceId=bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim()??"";
  if(!VALID_UUID.test(sourceId) || !bindings.NOTION_API_TOKEN?.trim())
    throw new Error("BREED_IDENTITY_BACKFILL_NOT_CONFIGURED");
  // Fetch every page so duplicate slug/FCI checks cover the WHOLE collection.
  const pages:Page[]=[];
  let cursor:string|null=null;
  do{
    const response=await notionRequest<{results?:Page[];has_more?:boolean;next_cursor?:string|null}>(
      bindings,"/data_sources/"+encodeURIComponent(sourceId)+"/query",{
        method:"POST",body:JSON.stringify({
          page_size:100,
          ...(cursor?{start_cursor:cursor}:{}),
        }),
      });
    if(!Array.isArray(response.results) || typeof response.has_more!=="boolean")
      throw new Error("BREED_IDENTITY_INCOMPLETE_NOTION_LIST");
    pages.push(...response.results);
    if(pages.length>MAX_NOTION_PAGES || (response.has_more && !response.next_cursor))
      throw new Error("BREED_IDENTITY_NOTION_PAGINATION_INCOMPLETE");
    cursor=response.has_more?response.next_cursor??null:null;
  }while(cursor);
  const slugCount=new Map<string,number>(),fciCount=new Map<number,number>();
  for(const page of pages){
    if(!notionPageBelongsToDataSource(page,sourceId))throw new Error("BREED_IDENTITY_FOREIGN_NOTION_PAGE");
    const slug=notionRichTextProperty(page,"Slug");
    const fci=notionNumberProperty(page,"FCI číslo");
    slugCount.set(slug,(slugCount.get(slug)??0)+1);
    if(fci!=null)fciCount.set(fci,(fciCount.get(fci)??0)+1);
  }
  const cap=Math.min(MAX_WRITES,Math.max(1,Math.trunc(input.maxWrites??MAX_WRITES)));
  let applied=0;
  for(const page of pages){
    result.scanned++;
    const slug=notionRichTextProperty(page,"Slug");
    const fci=notionNumberProperty(page,"FCI číslo");
    const notionId=notionRichTextProperty(page,"Psipedia ID").trim();
    const approved=APPROVED.has(notionSelectProperty(page,"Stav"))
      || notionPropertyRecord(page,"Profil skvalitnený")?.checkbox===true;
    if(!slug || !/^[a-z0-9-]{2,90}$/.test(slug)) {
      result.conflicts++;if(result.review.length<20)result.review.push({slug:slug||"?",reason:"INVALID_SLUG"});
      continue;
    }
    try{
      const canonical=await db.prepare(
        "SELECT id,slug,name,fci_number,status,updated_at FROM managed_breeds WHERE slug=? LIMIT 2",
      ).bind(slug).all<DbBreed>();
      const breed=canonical.results.length===1?canonical.results[0]:null;
      const [byBreed,byPage]=await Promise.all([
        breed?db.prepare("SELECT notion_page_id,breed_id FROM breed_notion_sync WHERE breed_id=?").bind(breed.id).first<LinkRow>():Promise.resolve(null),
        db.prepare("SELECT notion_page_id,breed_id FROM breed_notion_sync WHERE notion_page_id=?").bind(page.id).first<LinkRow>(),
      ]);
      const outcome=evaluateBreedIdentity({
        notionSlug:slug,notionFci:fci,notionId,canonical:breed,
        countBySlug:slugCount.get(slug)??0,
        countByFci:fci==null?0:fciCount.get(fci)??0,
        mappedPageId:byBreed?.notion_page_id,expectedPageId:page.id,
        mappedBreedId:byPage?.breed_id,
        approved,
      });
      if(outcome!=="ok"){
        if(outcome==="not-approved")result.unapproved++;
        else if(outcome==="missing")result.unmatched++;
        else result.conflicts++;
        if(result.review.length<20)result.review.push({slug,reason:outcome});
        continue;
      }
      if(!breed)continue;
      // Reject a known FCI allocated to ANOTHER canonical record.
      const desiredFci=fci??breed.fci_number;
      if(!desiredFci || !Number.isSafeInteger(desiredFci) || desiredFci<1){
        result.conflicts++;if(result.review.length<20)result.review.push({slug,reason:"INVALID_FCI"});
        continue;
      }
      const fciOwner=await db.prepare(
        "SELECT id FROM managed_breeds WHERE fci_number=? AND id<>? LIMIT 1",
      ).bind(desiredFci,breed.id).first<{id:number}>();
      if(fciOwner){
        result.conflicts++;if(result.review.length<20)result.review.push({slug,reason:"FCI_OWNED_BY_OTHER_BREED"});
        continue;
      }
      result.matched++;
      const mappingMissing=!byBreed&&!byPage;
      const idMissing=!notionId;
      const fciMissing=fci==null;
      const d1FciMissing=!(breed.fci_number && breed.fci_number>0);
      if(!mappingMissing&&!idMissing&&!fciMissing&&!d1FciMissing){
        result.alreadyLinked++;continue;
      }
      result.remaining++;
      if(!input.apply || applied>=cap)continue;
      const now=new Date().toISOString();
      if(d1FciMissing){
        // Only a 343-row historical GitHub audit + current Notion agreement
        // can fill a missing D1 FCI. This is NEVER an overwrite.
        const edited=await db.prepare(
          "UPDATE managed_breeds SET fci_number=?,updated_at=?,updated_by=? "+
          "WHERE id=? AND slug=? AND (fci_number IS NULL OR fci_number=0) "+
          "AND updated_at=? AND NOT EXISTS "+
          "(SELECT 1 FROM managed_breeds other WHERE other.fci_number=? AND other.id<>?)",
        ).bind(desiredFci,now,"breed-identity-backfill",breed.id,slug,breed.updated_at,desiredFci,breed.id).run();
        if(edited.meta.changes!==1)throw new Error("BREED_FCI_CAS_CONFLICT");
        result.fciD1Filled++;
      }
      if(mappingMissing){
        const created=await db.prepare(
          "INSERT OR IGNORE INTO breed_notion_sync "+
          "(notion_page_id,breed_id,notion_last_edited_time,content_hash,last_synced_at,created_at,updated_at) "+
          "VALUES (?,?,?,?,?,?,?)",
        ).bind(page.id,breed.id,page.last_edited_time??null,
          "identity-pending-editorial:"+page.id,now,now,now).run();
        const found=await db.prepare(
          "SELECT notion_page_id,breed_id FROM breed_notion_sync WHERE notion_page_id=?",
        ).bind(page.id).first<LinkRow>();
        if(!found || found.breed_id!==breed.id ||
          (created.meta.changes!==1 && !byBreed))
          throw new Error("BREED_LINK_CAS_CONFLICT");
        result.mappingsCreated++;
      }
      const properties:Record<string,unknown>={};
      if(idMissing)properties["Psipedia ID"]={rich_text:[{text:{content:String(breed.id)}}]};
      if(fciMissing)properties["FCI číslo"]={number:desiredFci};
      if(Object.keys(properties).length){
        properties["Sync stav"]={select:{name:"Čaká na sync"}};
        properties["Sync chyba"]={rich_text:[]};
        await notionRequest(bindings,"/pages/"+encodeURIComponent(page.id),{
          method:"PATCH",body:JSON.stringify({properties}),
        });
        if(idMissing)result.linked++;
        if(fciMissing)result.fciNotionFilled++;
      }
      applied++;
    }catch {
      // Never print raw Notion data, provider tokens or PII in logs.
      result.failed++;
      if(result.review.length<20)result.review.push({slug,reason:"BACKFILL_RETRY_REQUIRED"});
    }
  }
  result.canContinue=input.apply && result.remaining>applied && applied>0;
  return result;
}
