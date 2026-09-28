import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { runNotionBreedSyncSweep } from "@/lib/notion-breed-sync";

export const dynamic = "force-dynamic";

type RuntimeBindings = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_API_TOKEN?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
};

export async function POST() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) {
    return Response.json({ error: "Databáza Psipedia nie je pripojená." }, { status: 503 });
  }

  try {
    const summary = await runNotionBreedSyncSweep({
      database: bindings.DB,
      bindings,
    });
    return Response.json({ summary });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Notion synchronizácia plemien zlyhala." },
      { status: 500 },
    );
  }
}
