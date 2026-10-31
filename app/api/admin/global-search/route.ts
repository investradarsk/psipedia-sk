import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { searchAdminRecords } from "@/lib/admin-global-search";

export const dynamic = "force-dynamic";

// Read-only endpoint; intentionally never exposes private contact fields.
export async function GET(request: Request) {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return Response.json({ results: [], incomplete: false }, { headers: { "Cache-Control": "no-store" } });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const found = await searchAdminRecords(db, q);
    return Response.json(found, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Global admin search failed", error);
    return Response.json({ error: "Vyhľadávanie záznamov nie je momentálne dostupné." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
