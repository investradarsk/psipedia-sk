import { env } from "cloudflare:workers";
import {
  ingestPrivateImage,
  MAX_PRIVATE_IMAGE_BYTES,
  publishSafeImage,
  type ImagesBindingLike,
  type PrivateBucketLike,
  type PublicBucketLike,
} from "@/lib/private-media";
import { PublicLostFoundSubmissionError } from "@/lib/lost-found-public-submission";
import { attachPendingPublicLostFoundImage, getPublicLostFoundDatabase } from "@/lib/lost-found-public-store";

type Bindings = {
  DB?: D1Database;
  SUBMISSION_UPLOADS?: PrivateBucketLike;
  BUCKET?: R2Bucket;
  IMAGES?: ImagesBindingLike;
};

type MediaRow = {
  id: string;
  privateKey: string;
  safeKey: string | null;
  publicKey: string | null;
  state: string;
};

function runtime() {
  return env as unknown as Bindings;
}

function privateBucket(input?: PrivateBucketLike) {
  const bucket = input ?? runtime().SUBMISSION_UPLOADS;
  if (!bucket) {
    throw new PublicLostFoundSubmissionError("Nahratie fotografie momentálne nie je dostupné.", 503, "MEDIA_UNAVAILABLE", "image");
  }
  return bucket;
}

function imageBinding(input?: ImagesBindingLike) {
  const value = input ?? runtime().IMAGES;
  if (!value) {
    throw new PublicLostFoundSubmissionError("Nahratie fotografie momentálne nie je dostupné.", 503, "MEDIA_UNAVAILABLE", "image");
  }
  return value;
}

function publicBucket(input?: PublicBucketLike) {
  const value = input ?? runtime().BUCKET;
  if (!value) throw new Error("Public LOST/FOUND media bucket is unavailable");
  return value as unknown as PublicBucketLike;
}

async function mediaRow(reportId: number, database: D1Database) {
  return database.prepare(
    "SELECT id,private_key privateKey,safe_key safeKey,public_key publicKey,state " +
    "FROM media_assets WHERE owner_type='LOST_FOUND_PUBLIC' AND owner_id=?1 " +
    "AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
  ).bind(String(reportId)).first<MediaRow>();
}

export async function createLostFoundPublicMedia(input: {
  reportId: number;
  file: File;
  database?: D1Database;
  privateBucket?: PrivateBucketLike;
  images?: ImagesBindingLike;
  now?: Date;
}) {
  if (!input.file.size || input.file.size > MAX_PRIVATE_IMAGE_BYTES) {
    throw new PublicLostFoundSubmissionError("Fotografia môže mať najviac 8 MB.", 413, "IMAGE_TOO_LARGE", "image");
  }
  const declaredMime = input.file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(declaredMime)) {
    throw new PublicLostFoundSubmissionError("Použite fotografiu JPG, PNG alebo WebP.", 415, "INVALID_IMAGE", "image");
  }

  const database = getPublicLostFoundDatabase(input.database);
  const store = privateBucket(input.privateBucket);
  const assetId = crypto.randomUUID();
  let ingested;
  try {
    ingested = await ingestPrivateImage({
      assetId,
      bytes: new Uint8Array(await input.file.arrayBuffer()),
      declaredMime,
      ownerType: "LOST_FOUND_PUBLIC",
      ownerId: String(input.reportId),
      privateBucket: store,
      images: imageBinding(input.images),
    });
  } catch (error) {
    if (error instanceof PublicLostFoundSubmissionError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/format|MIME/i.test(message)) {
      throw new PublicLostFoundSubmissionError("Použite fotografiu JPG, PNG alebo WebP.", 415, "INVALID_IMAGE", "image");
    }
    if (/size|dimensions|pixels|limit/i.test(message)) {
      throw new PublicLostFoundSubmissionError("Fotografia je príliš veľká alebo má nepodporované rozmery.", 413, "INVALID_IMAGE_SIZE", "image");
    }
    throw new PublicLostFoundSubmissionError("Fotografiu sa nepodarilo bezpečne spracovať.", 422, "INVALID_IMAGE", "image");
  }

  const nowIso = (input.now ?? new Date()).toISOString();
  try {
    await database.prepare(
      "INSERT INTO media_assets (" +
      "id,owner_type,owner_id,state,private_key,safe_key,public_key,original_mime,safe_mime," +
      "size_bytes,safe_size_bytes,width,height,sha256,created_at" +
      ") VALUES (?1,'LOST_FOUND_PUBLIC',?2,'ATTACHED',?3,?4,NULL,?5,?6,?7,?8,?9,?10,?11,?12)",
    ).bind(
      ingested.assetId,
      String(input.reportId),
      ingested.rawKey,
      ingested.safeKey,
      ingested.originalMime,
      ingested.safeMime,
      ingested.sizeBytes,
      ingested.safeSizeBytes,
      ingested.width,
      ingested.height,
      ingested.sha256,
      nowIso,
    ).run();
    await attachPendingPublicLostFoundImage(input.reportId, ingested.safeKey, database);
  } catch (error) {
    await Promise.allSettled([store.delete(ingested.rawKey), store.delete(ingested.safeKey)]);
    await database.prepare("DELETE FROM media_assets WHERE id=?1").bind(ingested.assetId).run().catch(() => undefined);
    throw error;
  }

  return { id: ingested.assetId, safeKey: ingested.safeKey };
}

export async function cleanupLostFoundPublicMedia(
  reportId: number,
  options: { database?: D1Database; privateBucket?: PrivateBucketLike } = {},
) {
  const database = getPublicLostFoundDatabase(options.database);
  const row = await mediaRow(reportId, database);
  if (!row) return;
  const store = privateBucket(options.privateBucket);
  await Promise.allSettled([
    store.delete(row.privateKey),
    row.safeKey ? store.delete(row.safeKey) : Promise.resolve(),
  ]);
  await database.prepare("DELETE FROM media_assets WHERE id=?1").bind(row.id).run();
}

export async function getLostFoundPrivateMediaForAdmin(
  reportId: number,
  options: { database?: D1Database; privateBucket?: PrivateBucketLike } = {},
) {
  const database = getPublicLostFoundDatabase(options.database);
  const row = await mediaRow(reportId, database);
  if (!row?.safeKey || !row.safeKey.startsWith("safe/LOST_FOUND_PUBLIC/")) return null;
  const object = await privateBucket(options.privateBucket).get(row.safeKey);
  if (!object) return null;
  return { object, safeKey: row.safeKey };
}

export async function publishLostFoundPublicMedia(
  reportId: number,
  options: {
    database?: D1Database;
    privateBucket?: PrivateBucketLike;
    publicBucket?: PublicBucketLike;
    now?: Date;
  } = {},
) {
  const database = getPublicLostFoundDatabase(options.database);
  const row = await mediaRow(reportId, database);
  if (!row?.safeKey || row.state !== "ATTACHED") return null;
  const year = (options.now ?? new Date()).getUTCFullYear();
  const publicKey = "lost-found/" + year + "/" + crypto.randomUUID() + ".webp";
  await publishSafeImage({
    safeKey: row.safeKey,
    publicKey,
    privateBucket: privateBucket(options.privateBucket),
    publicBucket: publicBucket(options.publicBucket),
  });
  return { assetId: row.id, imageKey: publicKey, imageUrl: "/media/" + publicKey };
}

export async function finalizeLostFoundPublicMedia(
  reportId: number,
  state: "APPROVED" | "REJECTED",
  publicKey: string | null,
  databaseInput?: D1Database,
) {
  const database = getPublicLostFoundDatabase(databaseInput);
  const nowIso = new Date().toISOString();
  await database.prepare(
    "UPDATE media_assets SET state=?1,reviewed_at=?2,public_key=COALESCE(?3,public_key)," +
    "published_at=CASE WHEN ?1='APPROVED' THEN COALESCE(published_at,?2) ELSE published_at END " +
    "WHERE owner_type='LOST_FOUND_PUBLIC' AND owner_id=?4 AND state='ATTACHED'",
  ).bind(state, nowIso, publicKey, String(reportId)).run();
}
