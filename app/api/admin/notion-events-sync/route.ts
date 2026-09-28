import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  runNotionEventSyncSweep,
  type NotionEventSyncBindings,
} from "@/lib/notion-event-sync";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionEventSyncBindings & { DB?: D1Database };

export async function POST() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) {
    return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  }

  try {
    return Response.json(await runNotionEventSyncSweep({
      database: bindings.DB,
      bindings,
    }));
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Notion sync podujatí zlyhal.",
    }, { status: 500 });
  }
}
