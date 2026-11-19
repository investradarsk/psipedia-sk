import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { getPartnerMediaAsset, normalizePartnerMediaId } from "@/lib/partner-media";
import { normalizePartnerGalleryMediaIds } from "@/lib/partner-profile-gallery-media";
import { PROFILE_GALLERY_LIMIT } from "@/lib/partner-profile-gallery";
import { publishSafeImage, type PrivateBucketLike } from "@/lib/private-media";
import { reconcileGeoAfterSourceMutation } from "@/lib/geo-store";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";
import { planDirectorySecondaryCategorySqlMirror } from "@/lib/directory-secondary-category-sql";
import { planDirectory0173EditorialSqlMirror } from "@/lib/directory-0173-editorial-sql-mirror";
import {
  approvedDirectoryFactSqlSlot, planDirectory0170FactSqlMirror,
  planDirectory0170FilterSqlMirror, type Directory0170SqlStatement,
} from "@/lib/directory-0170-editorial-sql-mirror";
import {
  getDirectoryFilterDefinition, serviceFilterCategories,
  type ServiceFilterCategory,
} from "@/lib/directory-filter-contract";
import {
  buildDirectoryApplyStatement, buildHelpApplyStatements, getPartnerProfileEditor,
  loadPartnerCanonicalForResource, normalizePartnerProfilePatch, PartnerProfileChangeError,
  type PartnerProfilePatch,
} from "@/lib/partner-profile-changes";

/** Direct post-approval edits reuse the exact admin-reviewed canonical writer.
 * This is not a separate profile model, Notion shadow copy or writeback loop.
 */
export async function savePartnerManagedProfile(input: {
  accountId: string; resourceId: string; baseRevision: unknown; patch: unknown;
  mediaAssetId?: unknown; galleryMediaIds?: unknown;
  database?: D1Database; bucket?: PrivateBucketLike; now?: Date;
  publicOrigin?: string; workerVersionId?: string;
}) {
  const database=getPartnerDatabase(input.database ?? (env as unknown as {DB?:D1Database}).DB);
  const editor=await getPartnerProfileEditor(input.accountId,input.resourceId,database);
  if(editor.resource.role!=="OWNER")throw new PartnerProfileChangeError("Priamu úpravu môže uložiť iba schválený správca profilu.",403);
  if(typeof input.baseRevision!=="string"||editor.baseRevision!==input.baseRevision)
    throw new PartnerProfileChangeError("Profil sa medzitým zmenil. Obnovte editor.",409);
  const canonical=await loadPartnerCanonicalForResource(input.resourceId,database);
  if(canonical.updatedAt!==editor.baseUpdatedAt)
    throw new PartnerProfileChangeError("Profil sa medzitým zmenil. Obnovte editor.",409);
  const mainId=normalizePartnerMediaId(input.mediaAssetId);
  const galleryIds=normalizePartnerGalleryMediaIds(input.galleryMediaIds);
  const mediaIds=[mainId,...galleryIds].filter((id):id is string=>Boolean(id));
  if(new Set(mediaIds).size!==mediaIds.length)throw new PartnerProfileChangeError("Rovnaký obrázok sa nedá použiť dvakrát.");
  const patch=normalizePartnerProfilePatch(canonical.entityType,input.patch,canonical.values,Boolean(mediaIds.length),canonical.directoryCategory);
  const currentGallery=Array.isArray(patch.galleryUrls)?patch.galleryUrls:canonical.values.galleryUrls;
  if(!Array.isArray(currentGallery)||currentGallery.length+galleryIds.length>PROFILE_GALLERY_LIMIT)
    throw new PartnerProfileChangeError("Fotogaléria prekračuje maximálny počet fotografií.");
  const images=await Promise.all(mediaIds.map(async id=>{
    const asset=await getPartnerMediaAsset(id,database);
    if(!asset||asset.ownerId!==input.accountId||asset.ownerType!=="PARTNER_PROFILE_UPDATE"||
      asset.state!=="PENDING"||asset.deletedAt||!asset.safeKey)
      throw new PartnerProfileChangeError("Obrázok nie je k dispozícii alebo už bol použitý.",409);
    const year=new Date(asset.createdAt).getUTCFullYear();
    const folder=canonical.entityType==="DIRECTORY_PROFILE"?"directory":"help";
    return {id,asset,publicKey:`${folder}/${year}/partner-${id}.webp`,url:`/media/${folder}/${year}/partner-${id}.webp`};
  }));
  const bucket=input.bucket??(env as unknown as {BUCKET?:PrivateBucketLike}).BUCKET;
  if(images.length&&!bucket)throw new PartnerProfileChangeError("Úložisko fotografií nie je dostupné.",503);
  const current=await loadPartnerCanonicalForResource(input.resourceId,database);
  if(current.updatedAt!==canonical.updatedAt)throw new PartnerProfileChangeError("Profil sa medzitým zmenil. Obnovte editor.",409);
  // Publishing safe immutable media is an idempotent side effect. DB attachment
  // occurs only after an owner+version+media-state CAS; a failed CAS never links it.
  for(const image of images){
    await publishSafeImage({safeKey:image.asset.safeKey!,publicKey:image.publicKey,
      privateBucket:bucket!,publicBucket:bucket!});
  }
  const gallery=galleryIds.map(id=>images.find(image=>image.id===id)!);
  const effectivePatch:PartnerProfilePatch=gallery.length?{
    ...patch,galleryUrls:[...currentGallery,...gallery.map(item=>item.url)],
  }:patch;
  const actorRef=`partner:${input.accountId}`;
  const candidate=input.now??new Date();
  const prev=Date.parse(canonical.updatedAt);
  const nowIso=new Date(Number.isFinite(prev)?Math.max(candidate.getTime(),prev+1):candidate.getTime()).toISOString();
  const guard={accountId:input.accountId,resourceId:input.resourceId,baseUpdatedAt:canonical.updatedAt,mediaIds};
  const statements=canonical.entityType==="DIRECTORY_PROFILE"
    ? [buildDirectoryApplyStatement(database,canonical,effectivePatch,actorRef,nowIso,undefined,guard)]
    : buildHelpApplyStatements(database,canonical,effectivePatch,actorRef,nowIso,undefined,guard);
  if(canonical.entityType==="DIRECTORY_PROFILE"&&canonical.directoryCategory &&
    (serviceFilterCategories as readonly string[]).includes(canonical.directoryCategory)){
    // The 0170 SQL facet read model must be updated in the SAME transaction
    // as the canonical profile UPDATE. JSON-only Partner edits become invisible
    // when the SQL-first public facet wins; do not silently allow that split.
    const category=canonical.directoryCategory as ServiceFilterCategory;
    const filters:Record<string,string|null>={};
    for(const [field,value] of Object.entries(effectivePatch)){
      const definition=getDirectoryFilterDefinition(field);
      if(definition&&definition.category===category)filters[field]=value===null?null:String(value);
    }
    const plans: Directory0170SqlStatement[][]=[];
    if(Object.keys(filters).length) {
      plans.push(
        [...planDirectory0170FilterSqlMirror({profileId:canonical.canonicalId,category,
          values:filters,updatedAt:nowIso,actor:actorRef})]
      );
    }
    if("additionalCategories" in effectivePatch) {
      plans.push([...planDirectorySecondaryCategorySqlMirror({
        profileId:canonical.canonicalId,primaryCategory:category,
        submitted:effectivePatch.additionalCategories as string[],
        updatedAt:nowIso,actor:actorRef,
      })]);
    }
    if("openingHours" in effectivePatch && approvedDirectoryFactSqlSlot(category,"Ordinačné hodiny")){
      (plans as Directory0170SqlStatement[][]).push(
        [...planDirectory0170FactSqlMirror({profileId:canonical.canonicalId,category,
          field:"Ordinačné hodiny",value:String(effectivePatch.openingHours??""),
          updatedAt:nowIso,actor:actorRef})]
      );
    }
    const hoursEdited=Object.hasOwn(effectivePatch,"openingHours");
    const galleryEdited=Object.hasOwn(effectivePatch,"galleryUrls");
    // Only explicit partner edits project to 0173; omitted fields are never
    // cleared. This includes gallery additions from newly approved media.
    const editorialMirror=hoursEdited || galleryEdited
      ?planDirectory0173EditorialSqlMirror({
        identity:{kind:"id",profileId:canonical.canonicalId,
          updatedAt:nowIso,actor:actorRef},
        ...(hoursEdited?{openingHoursText:String(effectivePatch.openingHours??"")}:{}),
        ...(galleryEdited?{galleryUrls:effectivePatch.galleryUrls as readonly string[]}:{}),
      }):[];
    if(plans.length || editorialMirror.length){
      // Exactly one canonical CAS assertion, immediately after the profile
      // UPDATE and before ALL 0170/0173 projections. An absent field never
      // clears a relation, even if another writer changed it meanwhile.
      const guard=plans.length?plans[0][0]:{
        sql:"SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('CAS_CONFLICT', char(36)) END AS cas_ok",
        bindings:[] as string[],
      };
      statements.push(database.prepare(guard.sql).bind(...guard.bindings));
      for(const plan of plans)for(const item of plan.slice(1))
        statements.push(database.prepare(item.sql).bind(...item.bindings));
      for(const item of editorialMirror)
        statements.push(database.prepare(item.sql).bind(...item.bindings));
    }
  }
  const table=canonical.entityType==="DIRECTORY_PROFILE"?"directory_profiles":"help_organizations";
  const main=mainId?images.find(image=>image.id===mainId)!:null;
  if(main){
    statements.push(database.prepare(`UPDATE ${table} SET image_url=?,image_key=?
      WHERE id=? AND updated_at=? AND EXISTS (
        SELECT 1 FROM partner_memberships m JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
        WHERE m.account_id=? AND m.resource_id=? AND m.role='OWNER' AND m.revoked_at IS NULL
      )`).bind(main.url,main.publicKey,canonical.canonicalId,nowIso,input.accountId,input.resourceId));
  }
  const eventId=crypto.randomUUID();
  const changedFields=[...new Set([...Object.keys(effectivePatch),...(main?["image"]:[])])];
  const batchResults=await database.batch([
    ...statements,
    ...images.map(image=>database.prepare(`UPDATE media_assets SET state='APPROVED',public_key=?1,
      published_at=?2,reviewed_at=?2
      WHERE id=?3 AND owner_id=?4 AND owner_type='PARTNER_PROFILE_UPDATE'
        AND state='PENDING' AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM ${table} WHERE id=?5 AND updated_at=?2)`)
      .bind(image.publicKey,nowIso,image.id,input.accountId,canonical.canonicalId)),
    database.prepare(`INSERT INTO partner_audit_events(
      id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'PROFILE_CHANGE_APPROVED','PARTNER_RESOURCE',?3,?4,?5
      WHERE EXISTS (SELECT 1 FROM ${table} WHERE id=?6 AND updated_at=?5)`)
      .bind(eventId,actorRef,input.resourceId,JSON.stringify({
        mode:"DIRECT_PUBLIC_SAVE",entityType:canonical.entityType,fields:changedFields,
        baseUpdatedAt:canonical.updatedAt,
      }),nowIso,canonical.canonicalId),
  ]);
  if(Number(batchResults[0]?.meta?.changes??0)!==1)
    throw new PartnerProfileChangeError("Profil bol medzitým upravený alebo bol odobratý prístup. Obnovte editor.",409);
  // Geodata and HTML caches are derived; failures do not roll back a committed
  // user edit or invent a successful Notion synchronization.
  try {
    if(canonical.entityType==="DIRECTORY_PROFILE"){
      await reconcileGeoAfterSourceMutation({targetType:"DIRECTORY_PROFILE",targetId:canonical.canonicalId,
        actorType:"SYSTEM",actorRef},database);
    } else if(canonical.locationId&&["address","city","district","region","countryCode"].some(key=>key in effectivePatch)){
      await reconcileGeoAfterSourceMutation({targetType:"ORGANIZATION_LOCATION",targetId:canonical.locationId,
        actorType:"SYSTEM",actorRef},database);
    }
  }catch(error){console.error("Partner direct profile geo reconciliation failed",error);}
  if(input.publicOrigin&&canonical.publicHref){
    const version=input.workerVersionId??(env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id;
    const parts=canonical.publicHref.split("/").filter(Boolean);
    const paths=[canonical.publicHref];
    if(parts[0]==="adresar"&&parts[1])paths.push(`/adresar/${parts[1]}`);
    if(parts[0]==="organizacie")paths.push("/organizacie");
    for(const href of [...new Set(paths)]){
      try{await invalidateVersionedPublicHtmlCacheUrl(new URL(href,input.publicOrigin),version);}
      catch(error){console.error("Partner direct profile cache invalidation failed",error);}
    }
  }
  return {resourceId:input.resourceId,baseUpdatedAt:nowIso,changedFields,saved:true};
}
