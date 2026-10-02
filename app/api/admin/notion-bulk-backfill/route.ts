import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import {
  isNotionBulkMode,
  isNotionBulkScope,
  runNotionBulkBackfill,
  type NotionBulkBindings,
} from "@/lib/notion-bulk-backfill";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionBulkBindings & { DB?: D1Database };

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;

  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.DB) {
    return Response.json({ error: "Databáza nie je pripojená." }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatné JSON telo." }, { status: 400 });
  }

  if (!isNotionBulkMode(payload.mode)) {
    return Response.json({ error: "mode musí byť dry-run alebo execute." }, { status: 400 });
  }
  if (!isNotionBulkScope(payload.scope ?? "all")) {
    return Response.json({ error: "Neplatný scope." }, { status: 400 });
  }
  if (payload.mode === "execute" && payload.confirm !== "NOTION_BULK_BACKFILL") {
    return Response.json({
      error: "Execute vyžaduje explicitné confirm=NOTION_BULK_BACKFILL.",
    }, { status: 409 });
  }

  try {
    const result = await runNotionBulkBackfill({
      database: bindings.DB,
      bindings,
      mode: payload.mode,
      scope: (payload.scope ?? "all") as Parameters<typeof runNotionBulkBackfill>[0]["scope"],
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Notion bulk backfill zlyhal.",
    }, { status: 500 });
  }
}
