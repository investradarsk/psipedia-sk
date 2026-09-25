import { env } from "cloudflare:workers";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import {
  ingestPrivateImage,
  MAX_PRIVATE_IMAGE_BYTES,
  publishSafeImage,
  type ImagesBindingLike,
  type PrivateBucketLike,
} from "@/lib/private-media";

export const partnerMediaIntents = ["PARTNER_PROFILE_CREATE","PARTNER_PROFILE_UPDATE","PARTNER_EVENT_CREATE","PARTNER_EVENT_UPDATE"] as const;
export type PartnerMediaIntent = (typeof partnerMediaIntents)[number];
export type PartnerMediaTerminalState = "APPROVED" | "REJECTED" | "ORPHANED";
type Bindings = { DB?: D1Database; BUCKET?: R2Bucket; IMAGES?: ImagesBindingLike };

export class PartnerMediaError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.name = "PartnerMediaError"; this.status = status; }
}
export function isPartnerMediaIntent(value: unknown): value is PartnerMediaIntent {
  return typeof value === "string" && (partnerMediaIntents as readonly string[]).includes(value);
}
export function normalizePartnerMediaId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new PartnerMediaError("Neplatný identifikátor obrázka.");
  return value;
}
function database(input?: D1Database) { return getPartnerDatabase(input ?? (env as unknown as Bindings).DB); }
function bucket(input?: PrivateBucketLike) {
  const value = input ?? (env as unknown as Bindings).BUCKET;
  if (!value) throw new PartnerMediaError("Úložisko obrázkov nie je dostupné.", 503);
  return value as unknown as PrivateBucketLike;
}
function images(input?: ImagesBindingLike) {
  const value = input ?? (env as unknown as Bindings).IMAGES;
  if (!value) throw new PartnerMediaError("Spracovanie obrázkov nie je dostupné.", 503);
  return value;
}

export async function createPartnerPendingMedia(input: {
  accountId: string;
  intent: PartnerMediaIntent;
  bytes: Uint8Array;
  declaredMime: string;
  database?: D1Database;
  bucket?: PrivateBucketLike;
  images?: ImagesBindingLike;
  now?: Date;
}) {
  const db = database(input.database);
  const pending = await db.prepare(`
    SELECT COUNT(*) count FROM media_assets
    WHERE owner_id=?1 AND owner_type LIKE 'PARTNER_%' AND state='PENDING' AND deleted_at IS NULL
  `).bind(input.accountId).first<{count:number}>();
  if ((pending?.count ?? 0) >= 8) throw new PartnerMediaError("Máte priveľa rozpracovaných obrázkov. Odstráňte niektorý a skúste to znova.", 409);
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_PRIVATE_IMAGE_BYTES) {
    throw new PartnerMediaError("Obrázok môže mať najviac 8 MB.", 413);
  }

  let result;
  try {
    result = await ingestPrivateImage({
      bytes: input.bytes,
      declaredMime: input.declaredMime,
      ownerType: input.intent,
      ownerId: input.accountId,
      privateBucket: bucket(input.bucket),
      images: images(input.images),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/format|MIME/i.test(message)) throw new PartnerMediaError("Použite obrázok JPG, PNG alebo WebP.", 415);
    if (/size|dimensions|pixels|limit/i.test(message)) throw new PartnerMediaError("Obrázok je príliš veľký alebo má nepodporované rozmery.", 413);
    throw new PartnerMediaError("Obrázok sa nepodarilo bezpečne spracovať.", 400);
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  try {
    await db.prepare(`
      INSERT INTO media_assets(
        id,owner_type,owner_id,state,private_key,safe_key,public_key,original_mime,safe_mime,
        size_bytes,safe_size_bytes,width,height,sha256,created_at
      ) VALUES(?1,?2,?3,'PENDING',?4,?5,NULL,?6,?7,?8,?9,?10,?11,?12,?13)
    `).bind(
      result.assetId,input.intent,input.accountId,result.rawKey,result.safeKey,result.originalMime,result.safeMime,
      result.sizeBytes,result.safeSizeBytes,result.width,result.height,result.sha256,nowIso,
    ).run();
  } catch (error) {
    const store=bucket(input.bucket);
    await Promise.allSettled([store.delete(result.rawKey),store.delete(result.safeKey)]);
    throw error;
  }
  return {
    id: result.assetId,
    intent: input.intent,
    state: "PENDING" as const,
    originalMime: result.originalMime,
    safeMime: result.safeMime,
    sizeBytes: result.sizeBytes,
    safeSizeBytes: result.safeSizeBytes,
    width: result.width,
    height: result.height,
    previewUrl: `/api/partner/media/${result.assetId}`,
  };
}

type MediaRow = {
  id:string; ownerType:string; ownerId:string; state:string; privateKey:string; safeKey:string|null; publicKey:string|null;
  originalMime:string; safeMime:string|null; sizeBytes:number; safeSizeBytes:number|null; width:number|null; height:number|null;
  createdAt:string; deletedAt:string|null;
};
export async function getPartnerMediaAsset(id: string, dbInput?: D1Database) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return database(dbInput).prepare(`
    SELECT id,owner_type ownerType,owner_id ownerId,state,private_key privateKey,safe_key safeKey,public_key publicKey,
      original_mime originalMime,safe_mime safeMime,size_bytes sizeBytes,safe_size_bytes safeSizeBytes,
      width,height,created_at createdAt,deleted_at deletedAt
    FROM media_assets WHERE id=?1 LIMIT 1
  `).bind(id).first<MediaRow>();
}
export async function getPartnerSubmissionMedia(submissionId: string, dbInput?: D1Database) {
  return database(dbInput).prepare(`
    SELECT m.id,m.owner_type ownerType,m.owner_id ownerId,m.state,m.private_key privateKey,m.safe_key safeKey,m.public_key publicKey,
      m.original_mime originalMime,m.safe_mime safeMime,m.size_bytes sizeBytes,m.safe_size_bytes safeSizeBytes,
      m.width,m.height,m.created_at createdAt,m.deleted_at deletedAt
    FROM moderation_submissions s JOIN media_assets m ON m.id=s.media_asset_id
    WHERE s.id=?1 LIMIT 1
  `).bind(submissionId).first<MediaRow>();
}

export async function abandonPartnerPendingMedia(input:{id:string;accountId:string;database?:D1Database;now?:Date}) {
  const nowIso=(input.now??new Date()).toISOString();
  const result=await database(input.database).prepare(`
    UPDATE media_assets SET state='ORPHANED',reviewed_at=?1
    WHERE id=?2 AND owner_id=?3 AND owner_type LIKE 'PARTNER_%' AND state='PENDING' AND deleted_at IS NULL
    RETURNING id
  `).bind(nowIso,input.id,input.accountId).first<{id:string}>();
  if(!result) throw new PartnerMediaError("Obrázok sa nenašiel alebo už patrí k odoslanej žiadosti.",409);
  return {id:input.id,state:"ORPHANED" as const};
}
export function terminalPartnerMediaStatement(input:{
  database:D1Database;submissionId:string;state:PartnerMediaTerminalState;nowIso:string;actorRef:string;publicKey?:string|null;
}) {
  const published=input.state==="APPROVED"?input.nowIso:null;
  return input.database.prepare(`
    UPDATE media_assets SET state=?1,reviewed_at=?2,public_key=COALESCE(?3,public_key),published_at=COALESCE(?4,published_at)
    WHERE id=(SELECT media_asset_id FROM moderation_submissions WHERE id=?5 AND updated_at=?2 AND reviewed_by=?6)
      AND state='ATTACHED'
  `).bind(input.state,input.nowIso,input.publicKey??null,published,input.submissionId,input.actorRef);
}

function publicFolderFor(ownerType:string){
  if(ownerType==="PARTNER_EVENT_CREATE"||ownerType==="PARTNER_EVENT_UPDATE")return "events";
  return "directory";
}
export async function publishPartnerSubmissionMedia(input:{
  submissionId:string;database?:D1Database;bucket?:PrivateBucketLike;publicFolder?:"directory"|"help"|"events";
}) {
  const media=await getPartnerSubmissionMedia(input.submissionId,input.database);
  if(!media)return null;
  if(media.state==="APPROVED"&&media.publicKey)return {assetId:media.id,imageKey:media.publicKey,imageUrl:`/media/${media.publicKey}`,media};
  if(media.state!=="ATTACHED"||!media.safeKey)throw new PartnerMediaError("Priložený obrázok už nie je možné schváliť.",409);
  const year=new Date(media.createdAt).getUTCFullYear();
  const publicKey=`${input.publicFolder??publicFolderFor(media.ownerType)}/${year}/partner-${media.id}.webp`;
  const store=bucket(input.bucket);
  await publishSafeImage({safeKey:media.safeKey,publicKey,privateBucket:store,publicBucket:store});
  return {assetId:media.id,imageKey:publicKey,imageUrl:`/media/${publicKey}`,media};
}

export async function readPartnerMediaPreview(input:{id:string;accountId?:string;admin?:boolean;database?:D1Database;bucket?:PrivateBucketLike}) {
  const media=await getPartnerMediaAsset(input.id,input.database);
  if(!media||media.deletedAt||!media.safeKey)throw new PartnerMediaError("Obrázok sa nenašiel.",404);
  if(!input.admin&&media.ownerId!==input.accountId)throw new PartnerMediaError("Obrázok sa nenašiel.",404);
  if(!["PENDING","ATTACHED","APPROVED","REJECTED","ORPHANED"].includes(media.state))throw new PartnerMediaError("Obrázok sa nenašiel.",404);
  const object=await bucket(input.bucket).get(media.safeKey);
  if(!object)throw new PartnerMediaError("Náhľad obrázka už nie je dostupný.",404);
  return {media,object};
}

export async function cleanupPartnerMedia(input:{database?:D1Database;bucket?:PrivateBucketLike;now?:Date;limit?:number}={}) {
  const db=database(input.database),store=bucket(input.bucket),now=input.now??new Date();
  const pendingBefore=new Date(now.getTime()-24*60*60*1000).toISOString();
  const terminalBefore=new Date(now.getTime()-7*24*60*60*1000).toISOString();
  const limit=Math.max(1,Math.min(200,input.limit??100));
  const rows=(await db.prepare(`
    SELECT id,private_key privateKey,safe_key safeKey,public_key publicKey,state
    FROM media_assets
    WHERE owner_type LIKE 'PARTNER_%' AND deleted_at IS NULL
      AND ((state='PENDING' AND created_at<?1) OR (state IN ('REJECTED','ORPHANED') AND COALESCE(reviewed_at,created_at)<?2))
    ORDER BY created_at ASC LIMIT ?3
  `).bind(pendingBefore,terminalBefore,limit).all<{id:string;privateKey:string;safeKey:string|null;publicKey:string|null;state:string}>()).results;
  let cleaned=0,failed=0;
  for(const row of rows){
    try{
      const keys=[row.privateKey,row.safeKey,row.publicKey].filter((key):key is string=>Boolean(key));
      await Promise.all(keys.map(key=>store.delete(key)));
      const changed=await db.prepare(`
        UPDATE media_assets SET state='CLEANED',deleted_at=?1
        WHERE id=?2 AND deleted_at IS NULL AND state IN ('PENDING','REJECTED','ORPHANED')
        RETURNING id
      `).bind(now.toISOString(),row.id).first<{id:string}>();
      if(changed)cleaned+=1;
    }catch{failed+=1;}
  }
  return {candidates:rows.length,cleaned,failed};
}
