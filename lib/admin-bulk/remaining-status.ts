import { adoptionStatuses, adoptionPublicStatuses, canTransitionAdoptionStatus, type AdoptionStatus } from "./adoption.ts";
import { getAdoptionById, prepareAdoptionWritePayload } from "./adoption-store.ts";
import { LOST_FOUND_STATUSES, canTransitionLostFoundStatus, defaultLostFoundExpiresAt, type LostFoundStatus } from "./lost-found-lifecycle.js";
import { LOST_FOUND_PUBLIC_SOURCE } from "./lost-found-public-submission";
import { partnerReviewOwnerSql } from "./admin-notion-review-lock.ts";
import { assertBulkPublicationIdentities, bulkPublicationGuardStatement } from "./publication-readiness-v3.ts";
import { lifecycleSchemaReady } from "./admin-record-lifecycle";
import { getManagedEshopById } from "./eshop-ratings.ts";

const specs={
 adoptions:{table:"adoption_dogs",statuses:adoptionStatuses,owner:"ADOPTION"},
 "lost-found":{table:"lost_found_dog_reports",statuses:LOST_FOUND_STATUSES,owner:"LOST_FOUND"},
 eshops:{table:"managed_eshops",statuses:["draft","published","archived"],owner:"ESHOP"},
} as const;
export type RemainingBulkAgenda=keyof typeof specs;
type Item={id:number;status:string;updatedAt:string};
type Row={id:number;status:string;updated_at:string;slug:string;owned:number;category:string;source:string|null;duplicate_of_id:number|null;published_at:string|null;expires_at:string|null;resolved_at:string|null;archived_at:string|null};
export function parseRemainingBulkRequest(raw:unknown){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Neplatná požiadavka.");
 const p=raw as Record<string,unknown>;
 if(p.agenda!=="adoptions"&&p.agenda!=="lost-found"&&p.agenda!=="eshops")throw Error("Nepodporovaná agenda.");
 const agenda=p.agenda;
 if(typeof p.target!=="string"||!(specs[agenda].statuses as readonly string[]).includes(p.target))throw Error("Nepodporovaný cieľový stav.");
 // Explicit frozen visible selection only. No caller-provided table or SQL.
 if(!Array.isArray(p.items)||p.items.length<1||p.items.length>50||p.confirmedCount!==p.items.length)throw Error("Potvrď výber 1 až 50 záznamov.");
 const seen=new Set<number>();
 const items:Item[]=p.items.map(rawItem=>{
  if(!rawItem||typeof rawItem!=="object")throw Error("Neplatný výber.");
  const item=rawItem as Record<string,unknown>;
  if(typeof item.id!=="number"||!Number.isSafeInteger(item.id)||item.id<=0||seen.has(item.id)||typeof item.updatedAt!=="string"||!item.updatedAt.trim()||typeof item.status!=="string"||!(specs[agenda].statuses as readonly string[]).includes(item.status))throw Error("Neplatné ID, verzia alebo stav.");
  seen.add(item.id);return {id:item.id,status:item.status,updatedAt:item.updatedAt};
 });
 return {agenda,target:p.target,items};
}
export function remainingBulkTransition(agenda:RemainingBulkAgenda,from:string,to:string){
 if(from===to)return false;
 if(agenda==="adoptions")return canTransitionAdoptionStatus(from as AdoptionStatus,to as AdoptionStatus);
 if(agenda==="lost-found")return canTransitionLostFoundStatus(from,to);
 return (from==="archived"?to==="draft":from==="draft"?["published","archived"].includes(to):["draft","archived"].includes(to));
}
const live=(agenda:RemainingBulkAgenda,status:string)=>agenda==="adoptions"?["ACTIVE","RESERVED"].includes(status):agenda==="lost-found"?status==="ACTIVE":status==="published";
async function readRow(db:D1Database,agenda:RemainingBulkAgenda,id:number){
 const spec=specs[agenda];
 const extra=agenda==="lost-found"?"type AS category,source,duplicate_of_id,expires_at,resolved_at,archived_at":"'' AS category,NULL AS source,NULL AS duplicate_of_id,NULL AS expires_at,NULL AS resolved_at,NULL AS archived_at";
 return db.prepare("SELECT id,status,updated_at,slug,published_at,"+extra+","+partnerReviewOwnerSql(spec.owner,"id")+" AS owned FROM "+spec.table+" WHERE id=?").bind(id).first<Row>();
}
async function validate(db:D1Database,agenda:RemainingBulkAgenda,row:Row,item:Item,target:string,actor:string){
 if(row.updated_at!==item.updatedAt||row.status!==item.status)throw Error("Záznam sa medzičasom zmenil.");
 if(row.owned)throw Error("Partnerský záznam uprav individuálne.");
 if(agenda==="lost-found"&&(row.source===LOST_FOUND_PUBLIC_SOURCE||row.duplicate_of_id!==null))throw Error("Používateľské alebo duplicitné hlásenie vyžaduje individuálnu moderáciu.");
 if(!remainingBulkTransition(agenda,row.status,target))throw Error("Nepovolený prechod stavu.");
 if(agenda==="adoptions"){
  const existing=await getAdoptionById(row.id,db);
  if(!existing||existing.updatedAt!==item.updatedAt)throw Error("Záznam sa medzičasom zmenil.");
  // Canonical validation only; do not rewrite content, search text or contacts.
  await prepareAdoptionWritePayload(db,{status:target as AdoptionStatus},actor,existing);
 }
 if(agenda==="eshops"&&target==="published"){
  const shop=await getManagedEshopById(row.id,db);
  if(!shop||shop.updatedAt!==item.updatedAt||!shop.name.trim()||!shop.slug.trim())throw Error("Chýba overená identita e-shopu.");
  for(const value of [shop.websiteUrl,shop.sourceUrl]){
   const url=new URL(value);if(!["https:","http:"].includes(url.protocol))throw Error("Neplatný web alebo zdroj e-shopu.");
  }
 }
 if(agenda==="lost-found"&&target==="ACTIVE"&&row.expires_at&&Date.parse(row.expires_at)<=Date.now())throw Error("Expirované hlásenie obnov individuálne s novou platnosťou.");
}
export async function applyRemainingBulkStatus(db:D1Database,actor:string,input:ReturnType<typeof parseRemainingBulkRequest>){
 const {agenda,target,items}=input;
 if(!await lifecycleSchemaReady(db,agenda))throw Error("Chýba existujúca lifecycle schéma. Zmeny neboli vykonané.");
 const candidates:Array<{row:Row;item:Item}>=[];
 const skipped:Array<{id:number;reason:string}>=[],failed:Array<{id:number;reason:string}>=[],updated:Array<{id:number;slug:string;category:string}>=[];
 for(const item of items){
  try{
   const row=await readRow(db,agenda,item.id);
   if(!row){skipped.push({id:item.id,reason:"Záznam neexistuje."});continue;}
   if(row.status===target&&row.updated_at===item.updatedAt){skipped.push({id:item.id,reason:"Už má cieľový stav."});continue;}
   await validate(db,agenda,row,item,target,actor);candidates.push({row,item});
  }catch(error){failed.push({id:item.id,reason:error instanceof Error?error.message:"Kontrola zlyhala."});}
 }
 // Compare the whole selected publish batch before any mutation.
 if(live(agenda,target))await assertBulkPublicationIdentities(db,agenda,candidates.filter(({row})=>!live(agenda,row.status)).map(({row})=>row.id));
 const spec=specs[agenda];
 for(const {row,item} of candidates){
  try{
   const now=new Date(Math.max(Date.now(),Date.parse(item.updatedAt)+1||0)).toISOString();
   const owner=" AND NOT "+partnerReviewOwnerSql(spec.owner,spec.table+".id");
   const where=" WHERE id=? AND status=? AND updated_at=?"+owner+" AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=? AND state<>'COMPLETE')";
   const values=[row.id,row.status,item.updatedAt,agenda,row.id];
   let statement:D1PreparedStatement;
   if(agenda==="lost-found"){
    const published=["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"].includes(target)?row.published_at??now:row.published_at;
    const expires=target==="ACTIVE"?row.expires_at??defaultLostFoundExpiresAt(new Date(now)):row.expires_at;
    statement=db.prepare("UPDATE lost_found_dog_reports SET status=?,updated_at=?,published_at=?,expires_at=?,resolved_at=?,archived_at=?"+where+" AND duplicate_of_id IS NULL AND COALESCE(source,'')<>?")
     .bind(target,now,published,expires,target==="RESOLVED"?row.resolved_at??now:null,target==="ARCHIVED"?row.archived_at??now:null,...values,LOST_FOUND_PUBLIC_SOURCE);
   }else{
    statement=db.prepare("UPDATE "+spec.table+" SET status=?,updated_at=?,updated_by=?,published_at=CASE WHEN ?=1 THEN COALESCE(published_at,?) ELSE published_at END"+where)
     .bind(target,now,actor,live(agenda,target)?1:0,now,...values);
   }
   // Closing, archiving and returning to draft protect against automatic reopening.
   const [result]=await db.batch([statement,bulkPublicationGuardStatement(db,agenda,[row.id],live(agenda,target),now)]);
   if(result.meta.changes!==1){skipped.push({id:row.id,reason:"Záznam sa medzičasom zmenil."});continue;}
   updated.push({id:row.id,slug:row.slug,category:row.category});
  }catch(error){failed.push({id:row.id,reason:"Zmenu sa nepodarilo potvrdiť."});console.error("BULK_STATUS_FAILED",{agenda,id:row.id,error});}
 }
 return {requested:items.length,updated,skipped,failed,counts:{requested:items.length,updated:updated.length,skipped:skipped.length,failed:failed.length}};
}
