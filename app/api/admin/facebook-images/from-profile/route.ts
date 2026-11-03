import { requireAdminMutation } from "@/lib/admin-auth";
import { saveFacebookImagePost } from "@/lib/facebook-image-store";
import { copyFacebookProfileImage } from "@/lib/facebook-profile-image";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

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
    try { imagePayload = await copyFacebookProfileImage(image); }
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
