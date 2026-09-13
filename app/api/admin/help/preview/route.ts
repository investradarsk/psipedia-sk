import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { allHelpCategories } from "@/lib/help";
import { slovakRegions } from "@/lib/events";
import { previewHelpItems } from "@/lib/help-import-preview";
import { getD1Binding } from "@/lib/help-store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ITEMS = 5_000;

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BYTES) return Response.json({ error: "Súbor je príliš veľký." }, { status: 413 });
  const database = getD1Binding();
  if (!database) return Response.json({ error: "Produkčná D1 nie je pripojená; preview sa nevykonalo." }, { status: 503 });

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BYTES) return Response.json({ error: "Súbor je príliš veľký." }, { status: 413 });
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray((payload as { items?: unknown }).items)) {
      return Response.json({ error: "Očakáva sa JSON objekt s poľom items." }, { status: 400 });
    }
    const items = (payload as { items: unknown[] }).items;
    if (!items.length || items.length > MAX_ITEMS) return Response.json({ error: "Počet items musí byť od 1 do 5000." }, { status: 400 });
    const preview = await previewHelpItems(database, items, allHelpCategories.map((item) => item.slug), slovakRegions);
    return Response.json({ preview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_help_preview_failed", message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Preview sa nepodarilo bezpečne dokončiť. Údaje neboli importované." }, { status: 500 });
  }
}
