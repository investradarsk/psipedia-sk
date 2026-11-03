import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { allDirectoryCategories, directoryProfileHref, isDirectoryCategory } from "@/lib/directory";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { copyFacebookProfileImage } from "@/lib/facebook-profile-image";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("Databáza profilov nie je dostupná.");
  return db;
}

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  const params = new URL(request.url).searchParams;
  if (params.get("catalog") === "1") return Response.json({
    groups: [{ id: "directory", label: "Služby pre psov",
      categories: allDirectoryCategories.map(({ slug, label }) => ({ slug, label })) }],
  }, { headers: NO_STORE });

  const category = params.get("category") || "";
  if (!isDirectoryCategory(category))
    return Response.json({ error: "Vyber kategóriu profilov." }, { status: 400, headers: NO_STORE });
  const page = Math.max(1, Math.min(5000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const search = (params.get("query") || "").trim().slice(0, 100);
  const escaped = search.replace(/[\\%_]/g, "\\$&");
  const condition = search ? " AND LOWER(name) LIKE LOWER(?) ESCAPE '\\\\'" : "";
  const args: Array<string | number> = search ? [category, "%" + escaped + "%"] : [category];
  const db = database();
  try {
    const [items, count] = await db.batch([
      db.prepare(`SELECT id,name,slug,category,city,image_url FROM directory_profiles
        WHERE status='published' AND category=?${condition}
        ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?`)
        .bind(...args, 12, (page - 1) * 12),
      db.prepare(`SELECT COUNT(*) AS total FROM directory_profiles
        WHERE status='published' AND category=?${condition}`).bind(...args),
    ]);
    const rows = (items.results || []) as Array<{
      id: number; name: string; slug: string; category: string; city: string; image_url: string | null;
    }>;
    const total = Number((count.results?.[0] as {total?:number}|undefined)?.total || 0);
    return Response.json({
      items: rows.map(row => ({
        id: row.id, title: row.name, detail: row.city || "",
        imageUrl: row.image_url || "",
        url: "https://psipedia.sk" + directoryProfileHref({
          category: category, slug: row.slug,
        }),
      })),
      page, total, totalPages: Math.max(1, Math.ceil(total / 12)),
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Profily sa nepodarilo načítať." },
      { status: 503, headers: NO_STORE });
  }
}

/** Choosing a public profile transfers its image, but does not create or publish a post. */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const raw: unknown = await request.json().catch(() => null);
  const id = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).profileId : null;
  if (!Number.isSafeInteger(id) || Number(id) <= 0)
    return Response.json({ error: "Vyber platný profil." }, { status: 400, headers: NO_STORE });
  try {
    const profile = await getManagedDirectoryProfileById(Number(id));
    if (!profile || profile.status !== "published")
      return Response.json({ error: "Profil nie je verejne publikovaný." },
        { status: 409, headers: NO_STORE });
    let image = { imageKey: "", imageUrl: "" };
    let imageWarning = "";
    if (profile.imageUrl) {
      try { image = await copyFacebookProfileImage(profile.imageUrl); }
      catch { imageWarning = "Fotografia profilu sa nepodarila prevziať. Nahraj ju ručne."; }
    } else imageWarning = "Profil nemá fotografiu. Nahraj ju ručne.";
    return Response.json({
      profile: {
        id: profile.id, title: profile.name,
        url: "https://psipedia.sk" + directoryProfileHref(profile),
      }, image, imageWarning,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Profil sa nepodarilo načítať." },
      { status: 503, headers: NO_STORE });
  }
}
