import { env } from "cloudflare:workers";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";
import { helpSearchIndexAssignment } from "@/lib/partner-help-search-index";
import { adminNotificationEventStatement } from "@/lib/admin-notifications";
import { partnerFieldDiff } from "@/lib/partner-audit-diff";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { getPartnerMediaAsset, normalizePartnerMediaId } from "@/lib/partner-media";
import { normalizePartnerGalleryMediaIds } from "@/lib/partner-profile-gallery-media";
import { publishSafeImage, type PrivateBucketLike } from "@/lib/private-media";
import { parseHelpResourceId } from "@/lib/partner-help-claims";
import { requirePartnerPermission } from "@/lib/partner-platform";
import {
  helpEditorFields, normalizeHelpEditorPatch,
  type HelpEditorPatch, type HelpEditorValue,
} from "@/lib/partner-help-editor-fields";

export class PartnerHelpEditorError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "PartnerHelpEditorError"; }
}

const targets = {
  ADOPTION_DOG: { table: "adoption_dogs", claim: "adoption_dog_id", image: "main_image", gallery: "gallery_json" },
  LOST_FOUND_DOG: { table: "lost_found_dog_reports", claim: "lost_found_report_id", image: "main_image", gallery: "gallery_json" },
  HELP_CASE: { table: "help_cases", claim: "help_case_id", image: "image_url", gallery: null },
} as const;

/** Reads only the allowlisted public fields, not SEO, private contacts, source metadata, ownership or auth. */
export async function getPartnerHelpEditor(accountId: string, resourceId: string, database?: D1Database) {
  const parsed = parseHelpResourceId(resourceId);
  if (!parsed) throw new PartnerHelpEditorError("Záznam Pomoci psom neexistuje.", 404);
  const db = getPartnerDatabase(database);
  await requirePartnerPermission(accountId, resourceId, "HELP_EDIT_PUBLIC", db);
  const config = targets[parsed.entityType];
  const raw = await db.prepare(`SELECT * FROM ${config.table} WHERE id=?1 LIMIT 1`)
    .bind(parsed.canonicalId).first<Record<string, unknown>>();
  if (!raw) throw new PartnerHelpEditorError("Záznam neexistuje.", 404);
  const values: Record<string, HelpEditorValue> = {};
  for (const field of helpEditorFields[parsed.entityType]) {
    const value = raw[field.key];
    values[field.key] = field.kind === "checkbox" ? value === 1 || value === true
      : field.kind === "nullableBoolean" ? (value === null || value === undefined ? null : value === 1 || value === true)
      : field.kind === "number" ? (typeof value === "number" ? value : null)
      : typeof value === "string" ? value : "";
  }
  const title = parsed.entityType === "ADOPTION_DOG" ? String(raw.name ?? "Adopcia")
    : parsed.entityType === "LOST_FOUND_DOG" ? String(raw.dog_name || "Pes")
      : String(raw.title ?? "Pomoc psom");
  const galleryRaw = config.gallery ? raw[config.gallery] : null;
  let gallery: string[] = [];
  try {
    const arr: unknown = typeof galleryRaw === "string" ? JSON.parse(galleryRaw) : [];
    if (Array.isArray(arr)) gallery = arr.filter((url): url is string => typeof url === "string").slice(0, 20);
  } catch { /* Keep old malformed content unchanged. */ }
  const originalImage = raw[config.image];
  const imageUrl = typeof originalImage === "string" ? originalImage : null;
  return {
    resourceId, entityType: parsed.entityType, canonicalId: parsed.canonicalId,
    title, values, fields: helpEditorFields[parsed.entityType],
    imageUrl, gallery, baseRevision: String(raw.updated_at ?? ""),
    status: String(raw.status ?? ""),
    publicHref: parsed.entityType === "ADOPTION_DOG"
      ? ["ACTIVE","RESERVED"].includes(String(raw.status)) ? `/pomoc-psom/adopcia/${raw.slug}` : null
      : parsed.entityType === "LOST_FOUND_DOG"
        ? raw.status === "ACTIVE" && raw.published_at ? `/pomoc-psom/${raw.type === "FOUND" ? "najdene-psy" : "stratene-psy"}/${raw.slug}` : null
        : raw.status === "published" && Number(raw.resolved)===0 ? `/pomoc-psom/${raw.category}/${raw.slug}` : null,
  };
}

function versionAfter(baseRevision: string, now: Date) {
  const before = Date.parse(baseRevision);
  const proposed = now.getTime();
  return new Date(Number.isFinite(before) && proposed <= before ? before+1 : proposed).toISOString();
}

/** Direct public-field save for an already-approved canonical Help manager.
 * SQL includes the owner predicate in the mutation, preventing a revoked manager
 * from racing an approval/revocation event. Only patch keys change; other columns
 * remain untouched, including status, SEO, IDs, published_at and private data.
 */
export async function updatePartnerHelpPublic(input: {
  accountId: string;
  resourceId: string;
  baseRevision: unknown;
  patch: unknown;
  mediaAssetId?: unknown;
  galleryUrls?: unknown;
  galleryMediaIds?: unknown;
  database?: D1Database;
  now?: Date;
  publicOrigin?: string;
  workerVersionId?: string;
}) {
  const parsed = parseHelpResourceId(input.resourceId);
  if (!parsed) throw new PartnerHelpEditorError("Neplatný záznam Pomoci psom.",404);
  const database = getPartnerDatabase(input.database);
  await requirePartnerPermission(input.accountId, input.resourceId, "HELP_EDIT_PUBLIC", database);
  const originalEditor=await getPartnerHelpEditor(input.accountId,input.resourceId,database);
  const oldPublicHref=input.publicOrigin?originalEditor.publicHref:null;
  const baseRevision = input.baseRevision;
  if (typeof baseRevision !== "string" || baseRevision.length < 10 || baseRevision.length > 64)
    throw new PartnerHelpEditorError("Chýba verzia záznamu.");
  const mediaAssetId = normalizePartnerMediaId(input.mediaAssetId);
  const galleryMediaIds = normalizePartnerGalleryMediaIds(input.galleryMediaIds);
  const hasGalleryEdit = input.galleryUrls !== undefined || galleryMediaIds.length > 0;
  if (hasGalleryEdit && parsed.entityType === "HELP_CASE") throw new PartnerHelpEditorError("Tento typ záznamu nemá fotogalériu.");
  if (input.galleryUrls !== undefined && (!Array.isArray(input.galleryUrls) ||
    input.galleryUrls.some(v => typeof v !== "string" || v.length > 2048))) {
    throw new PartnerHelpEditorError("Neplatná fotogaléria.");
  }
  const galleryUrls = input.galleryUrls as string[] | undefined;
  let existingGallery: string[] = [];
  if (hasGalleryEdit && galleryUrls === undefined) {
    // Upload-only gallery changes must retain the canonical gallery. Never
    // convert an omitted list into an explicit request to clear all images.
    const current = await database.prepare(`SELECT gallery_json FROM ${targets[parsed.entityType].table} WHERE id=?1 LIMIT 1`)
      .bind(parsed.canonicalId).first<{gallery_json:string|null}>();
    if (!current) throw new PartnerHelpEditorError("Záznam sa nenašiel.",404);
    try {
      const saved:unknown = JSON.parse(current.gallery_json || "[]");
      if (!Array.isArray(saved) || saved.some(url => typeof url !== "string")) throw new Error("invalid gallery");
      existingGallery = saved as string[];
    } catch { throw new PartnerHelpEditorError("Pôvodná galéria má neplatný formát. Zápis je zablokovaný.",409); }
  }
  const externalGallery = (galleryUrls?.map(url => url.trim()) ?? existingGallery);
  if (hasGalleryEdit && (externalGallery.length + galleryMediaIds.length > 6 ||
    new Set(externalGallery).size !== externalGallery.length ||
    externalGallery.some(url => !(url.startsWith("/media/") || url.startsWith("/images/") || /^https?:\/\//i.test(url))))) {
    throw new PartnerHelpEditorError("Fotogaléria musí mať najviac 6 platných fotografií bez duplicít.");
  }
  const mediaIds = [mediaAssetId, ...galleryMediaIds].filter((id):id is string => Boolean(id));
  if (new Set(mediaIds).size !== mediaIds.length) throw new PartnerHelpEditorError("Obrázok sa nemôže použiť dvakrát.");
  const patch: HelpEditorPatch = normalizeHelpEditorPatch(parsed.entityType, input.patch, Boolean(mediaAssetId || hasGalleryEdit));
  const keys = Object.keys(patch);
  const target = targets[parsed.entityType];
  const mediaReady = await Promise.all(mediaIds.map(async id => {
    const asset = await getPartnerMediaAsset(id, database);
    if (!asset || asset.ownerId !== input.accountId || asset.ownerType !== "PARTNER_HELP_UPDATE" ||
      asset.deletedAt || asset.state !== "PENDING" || !asset.safeKey) {
      throw new PartnerHelpEditorError("Nová fotografia nie je dostupná alebo už bola použitá.", 409);
    }
    const year = new Date(asset.createdAt).getUTCFullYear();
    if (!Number.isFinite(year)) throw new PartnerHelpEditorError("Neplatný dátum fotografie.");
    return { id, asset, publicKey: `help/${year}/partner-${id}.webp`, url: `/media/help/${year}/partner-${id}.webp` };
  }));
  const publicStore = (env as unknown as { BUCKET?: PrivateBucketLike }).BUCKET;
  if (mediaReady.length && !publicStore) throw new PartnerHelpEditorError("Úložisko fotografií nie je dostupné.",503);
  // Permission and optimistic revision are checked before publishing objects. A
  // final SQL guarded update below protects against a concurrent revoke or edit.
  if (mediaReady.length) {
    const current = await database.prepare(`SELECT updated_at version FROM ${target.table} WHERE id=?1 LIMIT 1`)
      .bind(parsed.canonicalId).first<{version:string}>();
    if (current?.version !== baseRevision) throw new PartnerHelpEditorError("Záznam sa medzitým zmenil. Obnovte stránku.",409);
    for (const item of mediaReady) {
      await publishSafeImage({
        safeKey:item.asset.safeKey!, publicKey:item.publicKey,
        privateBucket:publicStore!,publicBucket:publicStore!,
      });
    }
  }
  const newMain = mediaAssetId ? mediaReady.find(item => item.id === mediaAssetId)! : null;
  const galleryPublished = galleryMediaIds.map(id => mediaReady.find(item => item.id === id)!);
  const mediaSet: string[] = [];
  const mediaValues: unknown[] = [];
  if (newMain) {
    mediaSet.push(`${target.image}=?`); mediaValues.push(newMain.url);
    if (parsed.entityType !== "ADOPTION_DOG") {
      mediaSet.push(parsed.entityType === "LOST_FOUND_DOG" ? "main_image_key=?" : "image_key=?"); mediaValues.push(newMain.publicKey);
    }
  }
  if (hasGalleryEdit) {
    mediaSet.push("gallery_json=?");
    mediaValues.push(JSON.stringify([...externalGallery,...galleryPublished.map(item => item.url)]));
  }
  const nowIso = versionAfter(baseRevision, input.now ?? new Date());
  const actor = `partner:${input.accountId}`;
  const values = keys.map((key) => {
    const v = patch[key];
    return typeof v === "boolean" ? v ? 1 : 0 : v;
  });
  const indexUpdate = helpSearchIndexAssignment(parsed.entityType, patch);
  const assetGuard = mediaReady.length
    ? ` AND (SELECT COUNT(*) FROM media_assets WHERE id IN (${mediaReady.map(() => "?").join(",")})
      AND owner_id=? AND owner_type='PARTNER_HELP_UPDATE' AND state='PENDING' AND deleted_at IS NULL)=?`
    : "";
  const updateParts = [...keys.map(key => `${key}=?`),...mediaSet];
  if (indexUpdate.sql) updateParts.push(indexUpdate.sql);
  updateParts.push("updated_at=?");
  if (parsed.entityType !== "LOST_FOUND_DOG") updateParts.push("updated_by=?");
  const updateSql = `UPDATE ${target.table}
    SET ${updateParts.join(", ")}
    WHERE id=? AND updated_at=?
      AND EXISTS (
        SELECT 1 FROM partner_help_claims c JOIN partner_accounts a ON a.id=c.account_id
        WHERE c.${target.claim}=? AND c.entity_type=? AND c.account_id=?
          AND c.status='APPROVED' AND a.status='ACTIVE'
      )${assetGuard}`;
  // All SQL identifiers come from static server-owned field definitions; only values are bound.
  const args: unknown[] = [
    ...values, ...mediaValues, ...indexUpdate.bindings, nowIso, ...(parsed.entityType==="LOST_FOUND_DOG"?[]:[actor]),
    parsed.canonicalId,baseRevision,parsed.canonicalId,parsed.entityType,input.accountId,
    ...(mediaReady.length?[...mediaIds,input.accountId,mediaReady.length]:[]),
  ];
  const eventId = crypto.randomUUID();
  const changeLog=partnerFieldDiff(originalEditor.values as Record<string,unknown>,patch as Record<string,unknown>);
  if(newMain)changeLog.image={old:originalEditor.imageUrl,new:newMain.url};
  if(hasGalleryEdit)changeLog.gallery={
    old:originalEditor.gallery,new:[...externalGallery,...galleryPublished.map(item=>item.url)],
  };
  const result = await database.batch([
    database.prepare(updateSql).bind(...args),
    database.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('PARTNER_HELP_CAS_CONFLICT',char(36)) END"),
    ...mediaReady.map(item=>database.prepare(`UPDATE media_assets SET state='APPROVED',public_key=?1,
      reviewed_at=?2,published_at=?2
      WHERE id=?3 AND owner_id=?4 AND owner_type='PARTNER_HELP_UPDATE' AND state='PENDING'
        AND deleted_at IS NULL AND EXISTS(
          SELECT 1 FROM ${target.table} WHERE id=?5 AND updated_at=?2
        )`).bind(item.publicKey,nowIso,item.id,input.accountId,parsed.canonicalId)),
    database.prepare(`INSERT INTO partner_audit_events
      (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'PROFILE_CHANGE_APPROVED','PARTNER_HELP_CLAIM',?3,?4,?5
      WHERE EXISTS (
        SELECT 1 FROM ${target.table} WHERE id=?6 AND updated_at=?5
      )`)
      .bind(eventId,actor,input.resourceId,
        JSON.stringify({mode:"DIRECT_PUBLIC_SAVE",entityType:parsed.entityType,fields:[...keys,...(newMain?["image"]:[]),...(hasGalleryEdit?["gallery"]:[])],fromRevision:baseRevision,changes:changeLog}),
        nowIso,parsed.canonicalId),
    adminNotificationEventStatement(database,{
      eventType:"partner_help_direct_edit",sourceType:"PARTNER_PUBLIC_EDIT",
      resourceType:"partner_help",resourceRef:input.resourceId,
      actorType:"PARTNER",actorRef:actor,
      targetUrl:(parsed.entityType==="ADOPTION_DOG"?"/admin/adopcie/":
        parsed.entityType==="LOST_FOUND_DOG"?"/admin/stratene-najdene/":"/admin/pomoc/")+parsed.canonicalId,
      title:"Partner upravil záznam",
      body:originalEditor.title+" · "+(keys.length+(newMain?1:0)+(hasGalleryEdit?1:0))+" upravených polí",
      tag:"partner-help-edit",dedupeKey:"partner-direct-help/"+eventId,
    },nowIso),
  ]);
  if (Number(result[0]?.meta?.changes ?? 0) !== 1) throw new PartnerHelpEditorError("Záznam sa medzitým zmenil alebo už nemáte oprávnenie. Obnovte stránku.",409);
  if(input.publicOrigin){
    try{
      const current=await getPartnerHelpEditor(input.accountId,input.resourceId,database);
      const paths=new Set<string>(["/pomoc-psom"]);
      if(oldPublicHref)paths.add(oldPublicHref);
      if(current.publicHref)paths.add(current.publicHref);
      if(parsed.entityType==="ADOPTION_DOG")paths.add("/pomoc-psom/adopcia");
      if(parsed.entityType==="LOST_FOUND_DOG"){paths.add("/pomoc-psom/stratene-psy");paths.add("/pomoc-psom/najdene-psy");}
      if(parsed.entityType==="HELP_CASE"){
        for(const path of [oldPublicHref,current.publicHref]){
          const category=path?.split("/").filter(Boolean)[1];
          if(category)paths.add(`/pomoc-psom/${category}`);
        }
      }
      const version=input.workerVersionId??(env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id;
      for(const path of paths){
        try{await invalidateVersionedPublicHtmlCacheUrl(new URL(path,input.publicOrigin),version);}
        catch(error){console.error("Partner Help public cache invalidation failed",error);}
      }
    }catch(error){console.error("Partner Help cache refresh failed after successful canonical save",error);}
  }
  return { resourceId: input.resourceId, baseRevision: nowIso,
    updatedFields: [...keys,...(newMain?["image"]:[]),...(hasGalleryEdit?["gallery"]:[])], saved: true };
}
