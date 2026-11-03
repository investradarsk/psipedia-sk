import { env } from "cloudflare:workers";
import { downloadRemoteImage, optimizeRemoteImageForStorage } from "@/lib/notion-sync-shared";

const MAX_BYTES = 8 * 1024 * 1024;
const validMedia = /^\\/media\\/([a-z0-9][a-z0-9/_.-]{1,390})$/i;

/** Copy an existing profile's image into the Facebook Images namespace. */
export async function copyFacebookProfileImage(imageUrl: string) {
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket || !imageUrl) throw new Error("Obrázok nie je dostupný v R2.");
  let source = imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.hostname === "psipedia.sk" || url.hostname === "www.psipedia.sk")
      source = url.pathname;
  } catch { /* Relative media path. */ }
  let bytes: Uint8Array | ReadableStream<Uint8Array>;
  let mime: string | null = null;
  if (source.startsWith("/media/")) {
    const match = validMedia.exec(source);
    if (!match || match[1].split("/").includes("..")) throw new Error("Nepovolený interný obrázok.");
    const original = await bucket.get(match[1]);
    if (!original || original.size > MAX_BYTES) throw new Error("Obrázok sa nenašiel alebo je priveľký.");
    bytes = original.body;
    mime = original.httpMetadata?.contentType ?? null;
  } else {
    const remote = await downloadRemoteImage(source);
    const optimized = await optimizeRemoteImageForStorage(env, remote);
    bytes = optimized.bytes;
    mime = optimized.contentType;
  }
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : null;
  if (!ext) throw new Error("Facebook obrázky prijímajú JPG, PNG alebo WebP.");
  const key = "facebook-images/" + new Date().getUTCFullYear() + "/" + crypto.randomUUID() + "." + ext;
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
  return { imageKey: key, imageUrl: "/media/" + key };
}
