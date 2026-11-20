import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { getPartnerEventEditor, normalizePartnerEventUpdate, PartnerEventError } from "@/lib/partner-events";
import { getPartnerMediaAsset, normalizePartnerMediaId } from "@/lib/partner-media";
import { publishSafeImage, type PrivateBucketLike } from "@/lib/private-media";
import { reconcileGeoAfterSourceMutation } from "@/lib/geo-store";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";
import { adminNotificationEventStatement } from "@/lib/admin-notifications";
import { partnerFieldDiff } from "@/lib/partner-audit-diff";

const COLUMNS: Record<string,string> = {
  title:"title",excerpt:"excerpt",eventType:"event_type",startDate:"start_date",
  startTime:"start_time",endDate:"end_date",endTime:"end_time",
  venue:"venue",city:"city",region:"region",address:"address",
  organizer:"organizer",description:"description",practicalInfo:"practical_info",
  websiteUrl:"website_url",registrationUrl:"registration_url",cancelled:"cancelled",
};
const cachePaths=["/podujatia","/podujatia/kalendar","/"];

export async function savePartnerManagedEvent(input:{
  accountId:string;resourceId:string;baseRevision:unknown;patch:unknown;
  mediaAssetId?:unknown;database?:D1Database;bucket?:PrivateBucketLike;now?:Date;
  publicOrigin?:string;workerVersionId?:string;
}) {
  const database=getPartnerDatabase(input.database??(env as unknown as {DB?:D1Database}).DB);
  const editor=await getPartnerEventEditor(input.accountId,input.resourceId,database);
  if(editor.resource.role!=="OWNER")throw new PartnerEventError("Priamu úpravu môže uložiť iba schválený správca podujatia.",403);
  if(typeof input.baseRevision!=="string"||editor.baseRevision!==input.baseRevision)
    throw new PartnerEventError("Podujatie sa medzitým zmenilo. Obnovte editor.",409);
  const mediaId=normalizePartnerMediaId(input.mediaAssetId);
  const patch=normalizePartnerEventUpdate(input.patch,editor.values,Boolean(mediaId));
  const keys=Object.keys(patch);
  const now=input.now??new Date();
  const oldTimestamp=Date.parse(editor.baseUpdatedAt);
  const nowIso=new Date(Number.isFinite(oldTimestamp)?Math.max(now.getTime(),oldTimestamp+1):now.getTime()).toISOString();
  const actorRef=`partner:${input.accountId}`;
  const id=editor.resource.canonicalId;
  let image: {id:string;safeKey:string;publicKey:string;url:string}|null=null;
  if(mediaId) {
    const asset=await getPartnerMediaAsset(mediaId,database);
    if(!asset||asset.ownerId!==input.accountId||asset.ownerType!=="PARTNER_EVENT_UPDATE"||
      asset.state!=="PENDING"||asset.deletedAt||!asset.safeKey)
      throw new PartnerEventError("Fotografia nie je dostupná alebo už bola použitá.",409);
    const year=new Date(asset.createdAt).getUTCFullYear();
    image={id:mediaId,safeKey:asset.safeKey,publicKey:`events/${year}/partner-${mediaId}.webp`,
      url:`/media/events/${year}/partner-${mediaId}.webp`};
    const bucket=input.bucket??(env as unknown as {BUCKET?:PrivateBucketLike}).BUCKET;
    if(!bucket)throw new PartnerEventError("Úložisko médií nie je dostupné.",503);
    // Only immutable safe assets from the existing Partner media pipeline.
    const preflight=await database.prepare("SELECT updated_at FROM managed_events WHERE id=?1").bind(id).first<{updated_at:string}>();
    if(preflight?.updated_at!==editor.baseUpdatedAt)
      throw new PartnerEventError("Podujatie sa medzitým zmenilo. Obnovte editor.",409);
    await publishSafeImage({safeKey:image.safeKey,publicKey:image.publicKey,
      privateBucket:bucket,publicBucket:bucket});
  }
  const sets=keys.map(key=>`${COLUMNS[key]}=?`);
  const values:unknown[]=keys.map(key=>key==="cancelled"?(patch[key]?1:0):patch[key]);
  if(image){sets.push("image_url=?","image_key=?");values.push(image.url,image.publicKey);}
  sets.push("updated_at=?","updated_by=?");values.push(nowIso,actorRef);
  const ownershipSql=` AND EXISTS(
    SELECT 1 FROM partner_resources r
    JOIN partner_memberships m ON m.resource_id=r.id AND m.revoked_at IS NULL AND m.role='OWNER'
    JOIN partner_accounts a ON a.id=m.account_id AND a.status='ACTIVE'
    WHERE r.id=? AND r.managed_event_id=managed_events.id
      AND r.entity_type='MANAGED_EVENT' AND m.account_id=?
  )`;
  const mediaSql=image?` AND EXISTS (SELECT 1 FROM media_assets WHERE id=?
    AND owner_id=? AND owner_type='PARTNER_EVENT_UPDATE' AND state='PENDING'
    AND deleted_at IS NULL)`:"";
  const sql=`UPDATE managed_events SET ${sets.join(",")}
    WHERE id=? AND updated_at=? AND status IN ('draft','published')${ownershipSql}${mediaSql}
    RETURNING id`;
  values.push(id,editor.baseUpdatedAt,input.resourceId,input.accountId);
  if(image)values.push(image.id,input.accountId);
  const changes=[...keys,...(image?["image"]:[])];
  const changeLog=partnerFieldDiff(editor.values as Record<string,unknown>,patch);
  if(image)changeLog.image={old:editor.resource.imageUrl,new:image.url};
  const auditId=crypto.randomUUID();
  const results=await database.batch([
    database.prepare(sql).bind(...values),
    database.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_EVENT_CAS_CONFLICT',char(36)) END"),
    ...(image?[database.prepare(`UPDATE media_assets SET state='APPROVED',public_key=?1,
      published_at=?2,reviewed_at=?2
      WHERE id=?3 AND owner_id=?4 AND owner_type='PARTNER_EVENT_UPDATE'
        AND state='PENDING' AND deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM managed_events WHERE id=?5 AND updated_at=?2)`)
      .bind(image.publicKey,nowIso,image.id,input.accountId,id)]:[]),
    // A legacy one-way Notion sweep must not replace the Partner-updated event;
    // modern two-way reconciliation remains the field-level sync route.
    database.prepare(`UPDATE event_notion_sync SET inbound_locked_at=?1,
      inbound_lock_reason='PARTNER_DIRECT_EDIT',updated_at=?1
      WHERE event_id=?2 AND EXISTS(SELECT 1 FROM managed_events WHERE id=?2 AND updated_at=?1)`)
      .bind(nowIso,id),
    database.prepare(`INSERT INTO partner_audit_events
      (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'EVENT_CHANGE_APPROVED','PARTNER_RESOURCE',?3,?4,?5
      WHERE EXISTS(SELECT 1 FROM managed_events WHERE id=?6 AND updated_at=?5)`)
      .bind(auditId,actorRef,input.resourceId,
        JSON.stringify({mode:"DIRECT_PUBLIC_SAVE",fields:changes,baseUpdatedAt:editor.baseUpdatedAt,changes:changeLog}),nowIso,id),
    adminNotificationEventStatement(database,{
      eventType:"partner_event_direct_edit",sourceType:"PARTNER_PUBLIC_EDIT",
      resourceType:"partner_event",resourceRef:input.resourceId,
      actorType:"PARTNER",actorRef,
      targetUrl:"/admin/podujatia/"+id,
      title:"Partner upravil podujatie",
      body:editor.resource.title+" · "+changes.length+" upravených polí",
      tag:"partner-event-edit",dedupeKey:"partner-direct-event/"+auditId,
    },nowIso),
  ]);
  if(Number(results[0]?.meta?.changes??0)!==1)
    throw new PartnerEventError("Podujatie sa medzitým zmenilo alebo už nemáte oprávnenie. Obnovte editor.",409);
  if(["venue","city","region","address","cancelled"].some(key=>key in patch)){
    try{await reconcileGeoAfterSourceMutation({targetType:"MANAGED_EVENT",targetId:id,actorType:"SYSTEM",actorRef},database);}
    catch(error){console.error("Partner direct event geo reconciliation failed",error);}
  }
  if(input.publicOrigin&&editor.resource.status==="published"){
    const version=input.workerVersionId??(env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id;
    for(const path of [`/podujatia/${editor.resource.slug}`,...cachePaths]){
      try{await invalidateVersionedPublicHtmlCacheUrl(new URL(path,input.publicOrigin),version);}
      catch(error){console.error("Partner direct event cache invalidation failed",error);}
    }
  }
  return {resourceId:input.resourceId,baseUpdatedAt:nowIso,changedFields:changes,saved:true};
}
