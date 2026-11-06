import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { runNotionBreedSyncSweep } from "@/lib/notion-breed-sync";
import { runNotionBreedWorkCopySyncSweep } from "@/lib/notion-breed-workcopy-sync";

export const dynamic = "force-dynamic";

type RuntimeBindings = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
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
    const summary = bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED === "true"
      ? await runNotionBreedWorkCopySyncSweep({ database: bindings.DB, bindings })
      : await runNotionBreedSyncSweep({ database: bindings.DB, bindings });
    return Response.json({ summary });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Notion synchronizácia plemien zlyhala." },
      { status: 500 },
    );
  }
}
