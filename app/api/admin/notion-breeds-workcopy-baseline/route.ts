import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { buildBreedWorkCopyBaseline } from "@/lib/notion-breed-workcopy-baseline";
import { BREED_WORKCOPY_BASELINE_CAS_SQL, breedBaselineCasBindings } from
  "@/lib/production-breed-workcopy-baseline-cas.mjs";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const normalize = (value: string) => value.replaceAll("-", "").toLowerCase();
type Bindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_STAGE_ENABLED?: string;
  NOTION_BREED_WORKCOPY_BASELINE_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
type WorkRow = {
  breed_id: number; original_notion_page_id: string;
  work_notion_page_id: string; original_sync_receipt: string;
  original_data_source_id: string; work_data_source_id: string;
  canonical_slug: string; fci_number: number;
  work_notion_last_edited_time: string | null;
  work_sync_receipt: string | null; status: string;
};

/**
 * Owner-confirmed, deliberately disabled by default. Builds up to TEN
 * independent NEW field receipts in the SHADOW table only. It never edits
 * canonical breeds, original 109-field receipts, Notion pages or sync flags.
 * A malformed profile is isolated; the others still get their baselines.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const bindings = env as unknown as Bindings;
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
      bindings.NOTION_BREED_WORKCOPY_BASELINE_ENABLED !== "true" ||
      bindings.NOTION_BREED_SYNC_ENABLED !== "true" ||
      bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "false" ||
      !bindings.NOTION_BREEDS_DATA_SOURCE_ID ||
      !bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID ||
      normalize(bindings.NOTION_BREEDS_DATA_SOURCE_ID) ===
        normalize(bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID)) {
    return Response.json({ code: "BREED_WORKCOPY_BASELINE_DISABLED" }, { status: 503, headers });
  }
  if (request.headers.get("x-psipedia-confirm-action") !== "BASELINE_344_BREEDS") {
    return Response.json({ code: "BREED_WORKCOPY_BASELINE_CONFIRMATION_REQUIRED" },
      { status: 409, headers });
  }
  // The bounded cursor allows one failing profile to remain pending without
  // blocking the remaining 343; a later pass can safely retry that profile.
  const afterRaw = request.headers.get("x-psipedia-breed-baseline-after") ?? "0";
  if (!/^(0|[1-9][0-9]{0,9})$/.test(afterRaw) ||
      Number(afterRaw) > 2147483647) {
    return Response.json({ code: "BREED_WORKCOPY_BASELINE_CURSOR_INVALID" },
      { status: 400, headers });
  }
  const db = bindings.DB;
  try {
    const cohort = await db.prepare(
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN status='SHADOW' THEN 1 ELSE 0 END) AS shadow " +
      "FROM breed_notion_workcopy_links",
    ).first<{ total: number; shadow: number | null }>();
    if (Number(cohort?.total) !== 344 || Number(cohort?.shadow) !== 344)
      throw Error("BREED_WORKCOPY_BASELINE_NOT_344_INACTIVE");
    const rows = await db.prepare(
      "SELECT * FROM breed_notion_workcopy_links WHERE status='SHADOW' " +
      "AND work_sync_receipt IS NULL AND breed_id>? " +
      "ORDER BY breed_id LIMIT 10",
    ).bind(afterId).all<WorkRow>();
    let initialized = 0, failed = 0, differentValueCount = 0;
    for (const row of rows.results) {
      try {
        if (normalize(row.work_data_source_id) !==
            normalize(bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID!) ||
            normalize(row.original_data_source_id) !==
            normalize(bindings.NOTION_BREEDS_DATA_SOURCE_ID!)) {
          throw Error("BREED_WORKCOPY_BASELINE_SOURCE_MISMATCH");
        }
        const source = await db.prepare(
          "SELECT notion_page_id,content_hash FROM breed_notion_sync WHERE breed_id=?",
        ).bind(row.breed_id).first<{ notion_page_id: string; content_hash: string }>();
        if (!source || normalize(source.notion_page_id) !==
            normalize(row.original_notion_page_id) ||
            source.content_hash !== row.original_sync_receipt) {
          throw Error("BREED_WORKCOPY_BASELINE_OLD_MAPPING_CHANGED");
        }
        const breed = await getManagedBreed(row.breed_id);
        if (!breed || breed.slug !== row.canonical_slug ||
            breed.fciNumber !== row.fci_number) {
          throw Error("BREED_WORKCOPY_BASELINE_CANONICAL_CHANGED");
        }
        const page = await notionRequest<NotionPage>(bindings,
          "/pages/" + encodeURIComponent(row.work_notion_page_id));
        if (normalize(page.id) !== normalize(row.work_notion_page_id) ||
            !notionPageBelongsToDataSource(page, bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID!)) {
          throw Error("BREED_WORKCOPY_BASELINE_PAGE_MOVED");
        }
        // 0159 SHADOW staging left this revision NULL by design. Bootstrap
        // from the live page instead of rejecting every staged profile.
        if (!page.last_edited_time ||
            (row.work_notion_last_edited_time &&
              page.last_edited_time !== row.work_notion_last_edited_time)) {
          throw Error("BREED_WORKCOPY_BASELINE_NOTION_REVISION_CHANGED");
        }
        const provenance = page.properties?.["Zdrojový profil Notion"] as
          { type?: string; url?: string | null } | undefined;
        const url = provenance?.type === "url" ? provenance.url ?? "" : "";
        const original = url.split(/[?#]/)[0]
          .replace(/[-/?#]/g, "").slice(-32).toLowerCase();
        if (original !== normalize(row.original_notion_page_id))
          throw Error("BREED_WORKCOPY_BASELINE_PROVENANCE_CHANGED");
        const baseline = buildBreedWorkCopyBaseline(page, breed);
        // Re-read Notion before committing and use a D1 updated_at CAS.
        const freshPage = await notionRequest<NotionPage>(bindings,
          "/pages/" + encodeURIComponent(row.work_notion_page_id));
        if (freshPage.last_edited_time !== page.last_edited_time ||
            normalize(freshPage.id) !== normalize(row.work_notion_page_id) ||
            !notionPageBelongsToDataSource(
              freshPage, bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID!))
          throw Error("BREED_WORKCOPY_BASELINE_NOTION_CHANGED_DURING_READ");
        const update = await db.prepare(BREED_WORKCOPY_BASELINE_CAS_SQL)
          .bind(...breedBaselineCasBindings({
            value: baseline.value, revision: page.last_edited_time,
            row, canonicalUpdatedAt: breed.updatedAt,
          })).run();
        if (update.meta.changes !== 1) throw Error("BREED_WORKCOPY_BASELINE_CAS_FAILED");
        initialized++;
        differentValueCount += baseline.differenceCount;
      } catch (error) {
        failed++;
        const code = error instanceof Error ? error.message : "BREED_WORKCOPY_BASELINE_FAILED";
        console.error("breed_workcopy_baseline_field_failed", { breedId: row.breed_id, code });
        // Keep row as SHADOW. Do not let one bad profile stop other baselines.
        await db.prepare(
          "UPDATE breed_notion_workcopy_links SET work_last_error_code=? " +
          "WHERE breed_id=? AND status='SHADOW' AND work_sync_receipt IS NULL",
        ).bind(code.slice(0, 100), row.breed_id).run().catch(() => undefined);
      }
    }
    const pending = await db.prepare(
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN work_sync_receipt IS NULL THEN 1 ELSE 0 END) AS missing, " +
      "SUM(CASE WHEN work_last_error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors " +
      "FROM breed_notion_workcopy_links",
    ).first<{ total: number; missing: number; errors: number }>();
    return Response.json({
      scanned: rows.results.length,
      nextCursor: rows.results.length
        ? rows.results[rows.results.length - 1].breed_id : null,
      initialized, failed, differentValueCount,
      stagedTotal: pending?.total ?? 0,
      baselinesReady: Number(pending?.total ?? 0) - Number(pending?.missing ?? 0),
      baselinesMissing: pending?.missing ?? 0,
      rowsNeedingReview: pending?.errors ?? 0,
      cutoverReady: false,
      // Never run 0159, activate, enable cron or restart editorial automations.
    }, { headers });
  } catch (error) {
    console.error("breed_workcopy_baseline_failed",
      error instanceof Error ? error.message : "unknown");
    return Response.json({ code: "BREED_WORKCOPY_BASELINE_FAILED" },
      { status: 503, headers });
  }
}
