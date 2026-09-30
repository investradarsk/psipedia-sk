import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { runNotionEshopSyncSweep, type NotionEshopSyncBindings } from "@/lib/notion-eshop-sync";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionEshopSyncBindings & { DB?: D1Database };

export async function POST() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) {
    return Response.json({ error: "Databáza Psipedia nie je pripojená." }, { status: 503 });
  }

  try {
    const summary = await runNotionEshopSyncSweep({ database: bindings.DB, bindings });
    return Response.json({ summary });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Notion synchronizácia e-shopov zlyhala." },
      { status: 500 },
    );
  }
}
