import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { summarizeNotionAuditBatch, type NotionAuditAgenda, type NotionAuditPage } from "@/lib/notion-data-quality-audit";
import { resolveNotionCanonicalTarget } from "@/lib/notion-canonical-target";
import { notionRequest, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { loadAuditD1Evidence, analyzeAuditEvidence } from "@/lib/notion-data-quality-audit-v2";

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

const ALLOWED = new Set<NotionAuditAgenda>([
  "directory", "events", "organizations", "adoptions", "help-cases", "lost-found",
]);

const sourceDefinitions = {
  organizations: { label: "Organizácie", titleProperty: "Názov" },
  adoptions: { label: "Adopcie", titleProperty: "Meno" },
  "help-cases": { label: "Pomoc psom", titleProperty: "Názov" },
  "lost-found": { label: "Stratené a nájdené", titleProperty: "Názov" },
} as const;

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
    return Response.json({ error: "Vyber platnú kategóriu a mode=dry-run." }, { status: 400 });
  }
  if (body.cursor !== undefined && (typeof body.cursor !== "string" || body.cursor.length > 500 || !body.cursor)) {
    return Response.json({ error: "Neplatný stránkovací kurzor." }, { status: 400 });
  }
  if (body.pass !== undefined && body.pass !== 1 && body.pass !== 2) {
    return Response.json({ error: "Neplatné číslo kontrolného prechodu." }, { status: 400 });
  }
  if (body.sourceId !== undefined && (typeof body.sourceId !== "string" || body.sourceId.length > 100)) {
    return Response.json({ error: "Neplatný identifikátor zdroja." }, { status: 400 });
  }
  const pass = body.pass === 2 ? 2 : 1;
  const agenda = body.agenda as NotionAuditAgenda;

  try {
    let dataSourceId = agenda === "directory"
      ? bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim()
      : agenda === "events"
        ? bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim()
        : undefined;

    if (agenda !== "directory" && agenda !== "events") {
      const definition = sourceDefinitions[agenda];
      const target = await resolveNotionCanonicalTarget({
        database: bindings.DB,
        bindings: bindings as RuntimeBindings & Record<string, unknown>,
        definition: {
          key: agenda,
          label: definition.label,
          targetTitle: definition.label,
          titleProperty: definition.titleProperty,
        },
        allowCreate: false,
        persist: false,
      });
      // Separate historical Notion sources (notably lost/found) must never
      // be combined or silently resolved into an arbitrary winner.
      if (target.duplicateDataSourceIds.length) {
        return Response.json({
          error: "MULTIPLE_NOTION_SOURCES_REQUIRE_REVIEW",
          agenda,
          readOnly: true,
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      dataSourceId = target.dataSourceId ?? undefined;
    }
    if (body.sourceId && body.sourceId !== dataSourceId) {
      return Response.json({ error: "AUDIT_SOURCE_CHANGED" }, { status: 409 });
    }
    if (!dataSourceId) {
      return Response.json({ error: "Notion data source pre túto kategóriu nie je dostupný." }, { status: 503 });
    }

    const response = await notionRequest<QueryResponse>(bindings, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        // Cursor pagination remains source-owned. Created-time ordering reduces
        // reorder but equal timestamps and concurrent edits are still UNKNOWN.
        sorts: [{ timestamp: "created_time", direction: "ascending" }],
        ...(body.cursor ? { start_cursor: body.cursor } : {}),
      }),
    });

    const pages = response.results ?? [];
    if (pages.length > 100) {
      return Response.json({ error: "AUDIT_BATCH_LIMIT" }, { status: 502 });
    }
    const d1 = await loadAuditD1Evidence(bindings.DB, agenda, pages);
    const independent = analyzeAuditEvidence(agenda, pages, d1);
    const hasMore = Boolean(response.has_more);
    const nextCursor = hasMore ? response.next_cursor ?? null : null;
    return Response.json({
      mode: "dry-run",
      readOnly: true,
      agenda,
      batchSize: 100,
      pass,
      sourceId: dataSourceId,
      ...summarizeNotionAuditBatch(agenda, pages),
      independent,
      productionCounts: "UNKNOWN",
      checkedAgainstD1: d1.coverage === "VERIFIED",
      comparisonBasis: "MAPPING_AND_CANONICAL_ID_ONLY",
      summaryText: "Audit bez zápisov: " + pages.length + " Notion záznamov; D1 identita "
        + (d1.coverage === "VERIFIED" ? "skontrolovaná" : "UNKNOWN")
        + "; aktuálne snapshot hashe UNKNOWN; nerozhodnuté hodnoty vyžadujú REVIEW.",
      hasMore,
      nextCursor,
      nextPass: !hasMore && pass === 1 ? 2 : null,
      passesComplete: !hasMore && pass === 2,
      resume: { agenda, pass, sourceId: dataSourceId, cursor: nextCursor },
      cursorConsistency: "BEST_EFFORT_CREATED_TIME_ORDER",
      truncated: Boolean(hasMore && !nextCursor),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Notion errors may include submitted property text. Never echo them.
    return Response.json({
      error: "NOTION_AUDIT_UNAVAILABLE",
      readOnly: true,
      productionCounts: "UNKNOWN",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
