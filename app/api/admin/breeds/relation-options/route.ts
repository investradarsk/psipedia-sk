import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database };
type DirectoryResult = { id: number; name: string; city: string | null };
type ArticleResult = { id: number; title: string; status: string };

export async function GET(request: Request) {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  const database = (env as unknown as Bindings).DB;
  if (!database) return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  if (!["stations", "clubs", "articles"].includes(kind ?? "")) {
    return Response.json({ error: "Neplatný typ prepojenia." }, { status: 400 });
  }
  if (q.length < 2) return Response.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });

  // The slug contains an accent-free version of the name, so searching
  // "sastinskeho" also finds "Šaštínskeho". Bind all user-supplied patterns.
  const slugQuery = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "%").replace(/^%+|%+$/g, "");
  const namePattern = "%" + q + "%";
  const slugPattern = "%" + slugQuery + "%";

  try {
    if (kind === "articles") {
      const rows = await database.prepare(
        "SELECT id,title,status FROM managed_articles WHERE " +
        "(title LIKE ? COLLATE NOCASE OR slug LIKE ? COLLATE NOCASE) " +
        "ORDER BY title COLLATE NOCASE LIMIT 40"
      ).bind(namePattern, slugPattern).all<ArticleResult>();
      return Response.json({ items: (rows.results ?? []).map((row) => ({
        id: row.id, label: row.title, meta: row.status,
      })) }, { headers: { "Cache-Control": "no-store" } });
    }
    const category = kind === "stations" ? "chovatelske-stanice" : "chovatelske-kluby";
    const rows = await database.prepare(
      "SELECT id,name,city FROM directory_profiles WHERE category=? " +
      "AND (name LIKE ? COLLATE NOCASE OR slug LIKE ? COLLATE NOCASE) " +
      "ORDER BY name COLLATE NOCASE LIMIT 40"
    ).bind(category, namePattern, slugPattern).all<DirectoryResult>();
    return Response.json({ items: (rows.results ?? []).map((row) => ({
      id: row.id, label: row.name, meta: row.city || "",
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Prepojenia sa nepodarilo načítať." }, { status: 500 });
  }
}
