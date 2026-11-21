/**
 * Attach sanitized private media to ONE unpublished canonical Partner draft.
 * Media remains private until an Admin APPROVE copies safe R2 objects and
 * commits their public URLs to the SAME canonical D1 row.
 */
import { env } from "cloudflare:workers";
import { getPartnerMediaAsset,normalizePartnerMediaId } from "./partner-media";
import { normalizePartnerGalleryMediaIds } from "./partner-profile-gallery-media";
import { publishSafeImage, type PrivateBucketLike } from "./private-media";
import { planDirectory0173EditorialSqlMirror } from "./directory-0173-editorial-sql-mirror";
import { normalizeProfileGalleryUrls } from "./partner-profile-gallery";
import { readPartnerDraftRelations } from "./partner-canonical-relations";
import type { PartnerCanonicalType } from "./partner-canonical-workflow";

type Stored={coverId:string|null;galleryIds:string[]};
export const CANONICAL_MEDIA_COVER_KEY="__canonicalMediaCoverId";
export const CANONICAL_MEDIA_GALLERY_KEY="__canonicalMediaGalleryIds";
const galleryTypes=new Set<PartnerCanonicalType>(["DIRECTORY_PROFILE","HELP_ORGANIZATION","ADOPTION_DOG","LOST_FOUND_DOG"]);
const intent=(type:PartnerCanonicalType)=>type==="MANAGED_EVENT"?"PARTNER_EVENT_CREATE":
  type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION"?"PARTNER_PROFILE_CREATE":"PARTNER_HELP_UPDATE";
const folder=(type:PartnerCanonicalType)=>type==="MANAGED_EVENT"?"events":
  type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION"?"directory":"help";
const ID=/^[0-9a-f-]{36}$/i;
function fail(message:string,status=409){const e=new Error(message) as Error & {status:number};e.status=status;return e;}
export function parseCanonicalDraftMedia(raw:string):Stored{
  let x:Record<string,unknown>={};
  try{
    const v:unknown=JSON.parse(raw);
    if(v&&typeof v==="object"&&!Array.isArray(v))x=v as Record<string,unknown>;
  }catch{}
  const cover=x[CANONICAL_MEDIA_COVER_KEY];
  const gallery=x[CANONICAL_MEDIA_GALLERY_KEY];
  return {
    coverId:typeof cover==="string"&&ID.test(cover)?cover:null,
    galleryIds:Array.isArray(gallery)?gallery.filter((x):x is string=>typeof x==="string"&&ID.test(x)).slice(0,6):[],
  };
}
export function normalizeCanonicalDraftMedia(type:PartnerCanonicalType,raw:unknown){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw fail("Neplatné fotografie.",400);
  const data=raw as Record<string,unknown>;
  if(Object.keys(data).some(key=>!["coverId","galleryIds"].includes(key)))throw fail("Neplatné polia fotografií.",400);
  const coverId=normalizePartnerMediaId(data.coverId);
  const galleryIds=normalizePartnerGalleryMediaIds(data.galleryIds);
  if(!galleryTypes.has(type)&&galleryIds.length)throw fail("Tento typ záznamu nemá fotogalériu.",400);
  if(coverId&&galleryIds.includes(coverId))throw fail("Hlavný obrázok nemôže byť v galérii duplicitne.",400);
  return {coverId,galleryIds};
}
export async function planCanonicalDraftMediaSave(input:{
  db:D1Database;submissionId:string;accountId:string;type:PartnerCanonicalType;
  proposedPatchJson:string;media:unknown;nowIso:string;
}){
  const next=normalizeCanonicalDraftMedia(input.type,input.media);
  const before=parseCanonicalDraftMedia(input.proposedPatchJson);
  const prevIds=[before.coverId,...before.galleryIds].filter((x):x is string=>Boolean(x));
  const nextIds=[next.coverId,...next.galleryIds].filter((x):x is string=>Boolean(x));
  for(const id of nextIds){
    const asset=await getPartnerMediaAsset(id,input.db);
    if(!asset||asset.ownerId!==input.accountId||asset.ownerType!==intent(input.type)||
      asset.deletedAt||!asset.safeKey||!["PENDING","ATTACHED"].includes(asset.state))
      throw fail("Fotografia nepatrí k tomuto konceptu alebo už nie je dostupná.");
    if(asset.state==="ATTACHED"&&!prevIds.includes(id))
      throw fail("Táto fotografia už patrí k inému návrhu.");
  }
  const statements:D1PreparedStatement[]=[];
  const cas=input.db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_DRAFT_MEDIA_CONFLICT',char(36)) END");
  for(const id of nextIds.filter(id=>!prevIds.includes(id))){
    statements.push(input.db.prepare("UPDATE media_assets SET state='ATTACHED' "+
      "WHERE id=? AND owner_id=? AND owner_type=? AND state='PENDING' AND deleted_at IS NULL")
      .bind(id,input.accountId,intent(input.type)),cas);
  }
  for(const id of prevIds.filter(id=>!nextIds.includes(id))){
    statements.push(input.db.prepare("UPDATE media_assets SET state='ORPHANED',reviewed_at=? "+
      "WHERE id=? AND owner_id=? AND state='ATTACHED'").bind(input.nowIso,id,input.accountId),cas);
  }
  const patch=JSON.stringify({[CANONICAL_MEDIA_COVER_KEY]:next.coverId,
    [CANONICAL_MEDIA_GALLERY_KEY]:next.galleryIds});
  statements.push(input.db.prepare("UPDATE moderation_submissions SET "+
    "proposed_patch_json=json_patch(COALESCE(proposed_patch_json,'{}'),?),updated_at=? "+
    "WHERE id=? AND submitter_ref=? AND status IN ('DRAFT','SUBMITTED','PENDING_REVIEW','QUARANTINED','RETURNED')")
    .bind(patch,input.nowIso,input.submissionId,input.accountId),cas);
  return {statements,next};
}
export async function prepareCanonicalDraftMediaApproval(input:{
  db:D1Database;type:PartnerCanonicalType;accountId:string;canonicalId:number;
  proposedPatchJson:string;nowIso:string;actorRef:string;
}){
  const media=parseCanonicalDraftMedia(input.proposedPatchJson),ids=[media.coverId,...media.galleryIds]
    .filter((x):x is string=>Boolean(x));
  if(!ids.length)return [] as D1PreparedStatement[];
  const bucket=(env as unknown as {BUCKET?:PrivateBucketLike}).BUCKET;
  if(!bucket)throw fail("Úložisko fotografií nie je dostupné.",503);
  const approved=new Map<string,{key:string;url:string}>();
  for(const id of ids){
    const asset=await getPartnerMediaAsset(id,input.db);
    if(!asset||asset.ownerId!==input.accountId||asset.ownerType!==intent(input.type)||
      asset.state!=="ATTACHED"||asset.deletedAt||!asset.safeKey)
      throw fail("Niektorá fotografia neprešla bezpečným spracovaním.");
    const year=new Date(asset.createdAt).getUTCFullYear();
    if(!Number.isSafeInteger(year))throw fail("Neplatný dátum fotografie.");
    const key=folder(input.type)+"/"+year+"/partner-"+id+".webp";
    await publishSafeImage({safeKey:asset.safeKey,publicKey:key,privateBucket:bucket,publicBucket:bucket});
    approved.set(id,{key,url:"/media/"+key});
  }
  const {db,type,canonicalId,nowIso,actorRef}=input;
  const table=type==="DIRECTORY_PROFILE"?"directory_profiles":
    type==="HELP_ORGANIZATION"?"help_organizations":type==="MANAGED_EVENT"?"managed_events":
    type==="ADOPTION_DOG"?"adoption_dogs":type==="LOST_FOUND_DOG"?"lost_found_dog_reports":"help_cases";
  const cover=media.coverId?approved.get(media.coverId)!:null;
  const mediaColumn=type==="ADOPTION_DOG"||type==="LOST_FOUND_DOG"?"main_image":"image_url";
  const keyColumn=type==="ADOPTION_DOG"?null:type==="LOST_FOUND_DOG"?"main_image_key":"image_key";
  const statements:D1PreparedStatement[]=[];
  if(cover){
    const sql="UPDATE "+table+" SET "+mediaColumn+"=?"+(keyColumn?","+keyColumn+"=?":"")+
      " WHERE id=? AND updated_at=?";
    statements.push(db.prepare(sql).bind(cover.url,...(keyColumn?[cover.key]:[]),canonicalId,nowIso));
  }
  let existing:string[]=[];
  if(type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION"){
    const values=await readPartnerDraftRelations({db,type,id:canonicalId});
    existing=Array.isArray(values.galleryUrls)?values.galleryUrls as string[]:[];
  }else if(type==="ADOPTION_DOG"||type==="LOST_FOUND_DOG"){
    const raw=await db.prepare("SELECT gallery_json value FROM "+table+" WHERE id=?")
      .bind(canonicalId).first<{value:string|null}>();
    try{
      const parsed:unknown=JSON.parse(raw?.value??"[]");
      if(Array.isArray(parsed))existing=parsed.filter((x):x is string=>typeof x==="string");
    }catch{}
  }
  const galleryUrls=normalizeProfileGalleryUrls([...existing,...media.galleryIds.map(id=>approved.get(id)!.url)]);
  if(media.galleryIds.length){
    if(type==="DIRECTORY_PROFILE"){
      for(const statement of planDirectory0173EditorialSqlMirror({
        identity:{kind:"id",profileId:canonicalId,updatedAt:nowIso,actor:actorRef},
        galleryUrls,
      }))statements.push(db.prepare(statement.sql).bind(...statement.bindings));
      // Gallery has a single SQL owner; no Directory JSON dual write.
    }else if(type==="HELP_ORGANIZATION"){
      statements.push(db.prepare("UPDATE help_organizations SET source_data_json=json_set("+
        "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,"+
        "'$._psipedia_profile_gallery_urls',?) WHERE id=? AND updated_at=?")
        .bind(JSON.stringify(galleryUrls),canonicalId,nowIso));
    }else if(type==="ADOPTION_DOG"||type==="LOST_FOUND_DOG"){
      statements.push(db.prepare("UPDATE "+table+" SET gallery_json=? WHERE id=? AND updated_at=?")
        .bind(JSON.stringify(galleryUrls),canonicalId,nowIso));
    }
  }
  for(const id of ids){
    const item=approved.get(id)!;
    statements.push(db.prepare("UPDATE media_assets SET state='APPROVED',public_key=?,published_at=?,reviewed_at=? "+
      "WHERE id=? AND owner_id=? AND owner_type=? AND state='ATTACHED' AND deleted_at IS NULL")
      .bind(item.key,nowIso,nowIso,id,input.accountId,intent(type)));
  }
  return statements;
}
