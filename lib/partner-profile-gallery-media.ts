import { env } from "cloudflare:workers";
import { getPartnerMediaAsset, PartnerMediaError } from "@/lib/partner-media";
import { publishSafeImage, type PrivateBucketLike } from "@/lib/private-media";

export const PARTNER_GALLERY_MEDIA_KEY = "__partnerGalleryMediaIds";
export const PARTNER_PROFILE_GALLERY_LIMIT = 6;
const ID = /^[0-9a-f-]{36}$/i;

export function normalizePartnerGalleryMediaIds(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > PARTNER_PROFILE_GALLERY_LIMIT) {
    throw new PartnerMediaError("Galéria môže obsahovať najviac 6 nových fotografií.");
  }
  const ids = raw.map((value) => {
    if (typeof value !== "string" || !ID.test(value)) {
      throw new PartnerMediaError("Neplatná fotografia vo fotogalérii.");
    }
    return value;
  });
  if (new Set(ids).size !== ids.length) throw new PartnerMediaError("Fotografia je v galérii viackrát.");
  return ids;
}

export function partnerGalleryMediaIdsFromStoredPatch(json: string): string[] {
  try {
    const patch = JSON.parse(json) as Record<string, unknown>;
    return normalizePartnerGalleryMediaIds(patch?.[PARTNER_GALLERY_MEDIA_KEY]);
  } catch {
    return [];
  }
}

export async function assertPendingPartnerGalleryMedia(
  database: D1Database,
  accountId: string,
  ids: readonly string[],
) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  const row = await database.prepare(
    `SELECT COUNT(*) AS total FROM media_assets
      WHERE id IN (${placeholders}) AND owner_id=? AND owner_type='PARTNER_PROFILE_UPDATE'
        AND state='PENDING' AND deleted_at IS NULL`
  ).bind(...ids, accountId).first<{ total: number }>();
  if (row?.total !== ids.length) {
    throw new PartnerMediaError("Niektoré fotografie galérie už nie sú dostupné na odoslanie.", 409);
  }
}

/** Atomic insert guard: if any image has been consumed, the submission insert is skipped,
 * and its dependent metadata FK aborts the entire D1 batch. */
export function galleryPendingInsertGuard(ids: readonly string[]) {
  if (!ids.length) return { sql: "", bindings: [] as unknown[] };
  const placeholders = ids.map(() => "?").join(",");
  return {
    sql: ` WHERE (SELECT COUNT(*) FROM media_assets WHERE id IN (${placeholders})
      AND owner_id=? AND owner_type='PARTNER_PROFILE_UPDATE'
      AND state='PENDING' AND deleted_at IS NULL)=?`,
    bindings: [...ids] as unknown[],
  };
}

export function attachPartnerGalleryMediaStatements(
  database: D1Database, accountId: string, ids: readonly string[],
) {
  return ids.map((id) => database.prepare(
    "UPDATE media_assets SET state='ATTACHED' WHERE id=? AND owner_id=? AND owner_type='PARTNER_PROFILE_UPDATE' AND state='PENDING' AND deleted_at IS NULL"
  ).bind(id, accountId));
}

export async function publishPartnerGalleryMedia(input: {
  database: D1Database;
  ids: readonly string[];
  accountId: string;
  folder: "directory" | "help";
  bucket?: PrivateBucketLike;
}) {
  const store = input.bucket ?? (env as unknown as { BUCKET?: PrivateBucketLike }).BUCKET;
  if (!input.ids.length) return [];
  if (!store) throw new PartnerMediaError("Úložisko galérie nie je dostupné.", 503);
  const published: { id: string; imageUrl: string; imageKey: string }[] = [];
  for (const id of input.ids) {
    const media = await getPartnerMediaAsset(id, input.database);
    if (!media || media.ownerId !== input.accountId ||
      media.ownerType !== "PARTNER_PROFILE_UPDATE" || !media.safeKey || media.deletedAt ||
      !["ATTACHED", "APPROVED"].includes(media.state)) {
      throw new PartnerMediaError("Fotografia galérie nie je pripravená na schválenie.", 409);
    }
    const year = new Date(media.createdAt).getUTCFullYear();
    const imageKey = `${input.folder}/${year}/partner-${id}.webp`;
    if (media.state !== "APPROVED") {
      await publishSafeImage({ safeKey: media.safeKey, publicKey: imageKey, privateBucket: store, publicBucket: store });
    }
    published.push({ id, imageKey, imageUrl: `/media/${imageKey}` });
  }
  return published;
}

export function terminalPartnerGalleryMediaStatements(input: {
  database: D1Database;
  submissionId: string;
  ids: readonly string[];
  state: "APPROVED" | "REJECTED" | "ORPHANED";
  nowIso: string;
  actorRef: string;
  publicKeys?: ReadonlyMap<string, string>;
}) {
  return input.ids.map((id) => input.database.prepare(`
    UPDATE media_assets SET state=?1,reviewed_at=?2,
      public_key=COALESCE(?3,public_key),
      published_at=CASE WHEN ?1='APPROVED' THEN ?2 ELSE published_at END
    WHERE id=?4 AND state='ATTACHED'
      AND EXISTS(SELECT 1 FROM moderation_submissions
        WHERE id=?5 AND status=?6 AND updated_at=?2 AND reviewed_by=?7)
  `).bind(input.state, input.nowIso, input.publicKeys?.get(id) ?? null, id,
    input.submissionId, input.state === "ORPHANED" ? "WITHDRAWN" : input.state, input.actorRef));
}
