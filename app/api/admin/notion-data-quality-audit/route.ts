import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { summarizeNotionAuditBatch, type NotionAuditAgenda, type NotionAuditPage } from "@/lib/notion-data-quality-audit";
import { resolveNotionCanonicalTarget } from "@/lib/notion-canonical-target";
import { notionRequest, type NotionSyncBindings } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
};
type QueryResponse = {
  results?: NotionAuditPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

const ALLOWED = new Set<NotionAuditAgenda>(["directory", "events", "organizations"]);

/**
 * Read-only, admin-only Notion diagnostic. Exactly one Notion page of at most
 * 100 records per invocation. Never edits Notion or D1 and never exposes
 * editorial content or private physical addresses.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  const bindings = env as unknown as RuntimeBindings;
  if (!bindings.NOTION_API_TOKEN?.trim() || !bindings.DB) {
    return Response.json({ error: "Notion alebo D1 nie je nakonfigurovaný." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch {
    return Response.json({ error: "Neplatné JSON telo." }, { status: 400 });
  }
  if (!ALLOWED.has(body.agenda as NotionAuditAgenda) || body.mode !== "dry-run") {
    return Response.json({ error: "Vyber agenda=directory/events/organizations a mode=dry-run." }, { status: 400 });
  }
  if (body.cursor !== undefined && (typeof body.cursor !== "string" || body.cursor.length > 500 || !body.cursor)) {
    return Response.json({ error: "Neplatný stránkovací kurzor." }, { status: 400 });
  }
  const agenda = body.agenda as NotionAuditAgenda;

  try {
    let dataSourceId = agenda === "directory"
      ? bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim()
      : agenda === "events"
        ? bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim()
        : undefined;

    if (agenda === "organizations") {
      const target = await resolveNotionCanonicalTarget({
        database: bindings.DB,
        bindings: bindings as RuntimeBindings & Record<string, unknown>,
        definition: {
          key: "organizations",
          label: "Organizácie",
          targetTitle: "Organizácie",
          titleProperty: "Názov",
        },
        allowCreate: false,
        persist: false,
      });
      dataSourceId = target.dataSourceId ?? undefined;
    }
    if (!dataSourceId) {
      return Response.json({ error: "Notion data source pre túto kategóriu nie je dostupný." }, { status: 503 });
    }

    const response = await notionRequest<QueryResponse>(bindings, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(body.cursor ? { start_cursor: body.cursor } : {}),
      }),
    });

    return Response.json({
      mode: "dry-run",
      readOnly: true,
      agenda,
      batchSize: 100,
      ...summarizeNotionAuditBatch(agenda, response.results ?? []),
      hasMore: Boolean(response.has_more),
      nextCursor: response.has_more ? response.next_cursor ?? null : null,
      truncated: Boolean(response.has_more && !response.next_cursor),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Notion audit zlyhal.",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
