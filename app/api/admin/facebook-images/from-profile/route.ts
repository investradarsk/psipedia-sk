import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { saveFacebookImagePost } from "@/lib/facebook-image-store";
import { downloadRemoteImage, optimizeRemoteImageForStorage } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const MAX_BYTES = 8 * 1024 * 1024;
const validMedia = /^\/media\/([a-z0-9][a-z0-9/_.-]{1,390})$/i;

async function copyImage(imageUrl: string) {
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket || !imageUrl) throw new Error("Obrázok nie je dostupný v R2.");
  let key = "";
  let source = imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.hostname === "psipedia.sk" || url.hostname === "www.psipedia.sk")
      source = url.pathname;
  } catch { /* Relative /media path. */ }
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
  key = "facebook-images/" + new Date().getUTCFullYear() + "/" + crypto.randomUUID() + "." + ext;
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
  return { imageKey: key, imageUrl: "/media/" + key };
}

/** Explicit owner action: create a private Facebook Images draft, never publish. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return Response.json({ error: "Neplatná požiadavka." }, { status: 400, headers: NO_STORE });
  const data = raw as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const publicPath = typeof data.publicPath === "string" ? data.publicPath.trim() : "";
  const image = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
  // Restrict the generated link to public Psipedia routes; no arbitrary links.
  if (!title || title.length > 200 || !publicPath.startsWith("/") || publicPath.startsWith("//") ||
      publicPath.length > 400 || /[?#\\]/.test(publicPath) ||
      !/^\/(adresar|pomoc-psom|podujatia|plemena|clanky|novinky|steniatka|starostlivost|aktivity|recenzie)(?:\/|$)/.test(publicPath) ||
      image.length > 1000)
    return Response.json({ error: "Záznam nemá platný verejný odkaz." }, { status: 400, headers: NO_STORE });

  let imagePayload = { imageKey: "", imageUrl: "" };
  let imageWarning = "";
  if (image) {
    try { imagePayload = await copyImage(image); }
    catch { imageWarning = "Obrázok sa nepodarilo prevziať. Doplň ho ručne v Facebook obrázkoch."; }
  } else imageWarning = "Profil nemá obrázok. Doplň ho pred naplánovaním.";
  try {
    const post = await saveFacebookImagePost(null, {
      title, ...imagePayload,
      caption: "Viac informácií: https://psipedia.sk" + publicPath,
      date: "", time: "", status: "draft",
    }, auth.user.email);
    return Response.json({ postId: post.id, imageAttached: Boolean(imagePayload.imageKey), imageWarning },
      { status: 201, headers: NO_STORE });
  } catch {
    return Response.json({ error: "Facebook koncept sa nepodarilo vytvoriť." },
      { status: 503, headers: NO_STORE });
  }
}
