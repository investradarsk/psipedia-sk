import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { summarizeNotionAuditBatch, type NotionAuditAgenda } from "@/lib/notion-data-quality-audit";
import { readNotionAuditBatch, auditReadFailure } from "@/lib/notion-audit-read-contract";
import { resolveReadOnlyNotionAuditTarget } from "@/lib/notion-canonical-target";
import { notionRequest, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { loadAuditD1Evidence, analyzeAuditEvidence } from "@/lib/notion-data-quality-audit-v2";
import { triageNotionQuality } from "@/lib/notion-conflict-quality-triage";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
};

const ALLOWED = new Set<NotionAuditAgenda>([
  "directory", "events", "organizations", "adoptions", "help-cases", "lost-found",
]);

const sourceDefinitions = {
  directory: { label: "Adresár", titleProperty: "Názov" },
  events: { label: "Podujatia", titleProperty: "Názov" },
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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
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
  if (body.cursor && !body.sourceId) return Response.json({ error: "AUDIT_SOURCE_REQUIRED" }, { status: 400 });
  const pass = body.pass === 2 ? 2 : 1;
  const agenda = body.agenda as NotionAuditAgenda;

  // Return only a safe stage code on failure: provider exceptions can contain private values.
  let stage: "SOURCE" | "NOTION_QUERY" | "D1_EVIDENCE" | "TRIAGE" = "SOURCE";
  try {
    const deadline = Date.now() + 30_000;
    const configuredId = agenda === "directory" ? bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim()
      : agenda === "events" ? bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim() : undefined;
    // Directory sync requires an explicitly configured source. Never discover a
    // different directory by title when the binding is missing.
    if (agenda === "directory" && !configuredId) throw new Error("AUDIT_SOURCE_SCHEMA");
    const definition = sourceDefinitions[agenda];
    const target = await resolveReadOnlyNotionAuditTarget({
      database: bindings.DB, bindings,
      definition: { key: agenda, label: definition.label, targetTitle: definition.label, titleProperty: definition.titleProperty },
      configuredId, deadline, allowCreate: false, persist: false,
    });
    if (target.duplicateDataSourceIds.length) {
      return Response.json({ error: "MULTIPLE_NOTION_SOURCES_REQUIRE_REVIEW", agenda, readOnly: true, status: "FAILED" },
        { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const dataSourceId = target.dataSourceId;
    if (body.sourceId && body.sourceId !== dataSourceId) {
      return Response.json({ error: "AUDIT_SOURCE_CHANGED", status: "FAILED", readOnly: true }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (!dataSourceId) {
      return Response.json({ error: "NOTION_SOURCE_NOT_FOUND", status: "FAILED", readOnly: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    stage = "NOTION_QUERY";
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("AUDIT_TIMEOUT");
    const response = await notionRequest<unknown>(bindings, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        // Cursor pagination remains source-owned. Created-time ordering reduces
        // reorder but equal timestamps and concurrent edits are still UNKNOWN.
        sorts: [{ timestamp: "created_time", direction: "ascending" }],
        ...(body.cursor ? { start_cursor: body.cursor } : {}),
      }),
    }, { retryTransient: false, timeoutMs: Math.min(8_000, remaining) });

    const { pages, hasMore, nextCursor, truncated } = readNotionAuditBatch(response, typeof body.cursor === "string" ? body.cursor : null);
    stage = "D1_EVIDENCE";
    const d1 = await loadAuditD1Evidence(bindings.DB, agenda, pages);
    const independent = analyzeAuditEvidence(agenda, pages, d1);
    const summary = summarizeNotionAuditBatch(agenda, pages);
    stage = "TRIAGE";
    const triage = triageNotionQuality(agenda, summary.reviewItems, independent);
    const partial = truncated || d1.coverage !== "VERIFIED";
    return Response.json({
      mode: "dry-run",
      readOnly: true,
      agenda,
      batchSize: 100,
      status: partial ? "PARTIAL" : "COMPLETE_BATCH",
      warnings: [...(truncated ? ["AUDIT_CURSOR_INCOMPLETE"] : []), ...(d1.failure ? [d1.failure] : [])],
      pass,
      sourceId: dataSourceId,
      ...summary,
      independent,
      triage,
      productionCounts: "UNKNOWN",
      checkedAgainstD1: d1.coverage === "VERIFIED",
      comparisonBasis: "MAPPING_AND_CANONICAL_ID_ONLY",
      summaryText: "Audit bez zápisov: " + pages.length + " Notion záznamov; D1 identita "
        + (d1.coverage === "VERIFIED" ? "skontrolovaná" : "UNKNOWN")
        + "; aktuálne snapshot hashe UNKNOWN; nerozhodnuté hodnoty vyžadujú REVIEW.",
      hasMore,
      nextCursor,
      nextPass: !truncated && !hasMore && pass === 1 ? 2 : null,
      passesComplete: !truncated && !hasMore && pass === 2,
      resume: { agenda, pass, sourceId: dataSourceId, cursor: nextCursor },
      cursorConsistency: "BEST_EFFORT_CREATED_TIME_ORDER",
      truncated,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (failure) {
    // Notion errors may include submitted property text. Never echo them.
    return Response.json({
      error: "NOTION_AUDIT_UNAVAILABLE",
      stage,
      reason: auditReadFailure(failure),
      status: "FAILED",
      readOnly: true,
      productionCounts: "UNKNOWN",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
