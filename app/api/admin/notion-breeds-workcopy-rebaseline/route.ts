import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedBreed } from "@/lib/breed-store";
import {
  notionRequest, notionRichTextProperty, notionNumberProperty,
  type NotionPage, type NotionSyncBindings,
} from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { buildBreedWorkCopyBaseline } from "@/lib/notion-breed-workcopy-baseline";
import { breedWorkCopyRebaselineBindings, BREED_WORKCOPY_REBASELINE_CAS_SQL } from
  "@/lib/notion-breed-workcopy-rebaseline-cas.mjs";
import { isCompatibleBreedWorkcopyReceipt } from "@/lib/notion-breed-workcopy-receipt";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Bindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_REBASELINE_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
type Row = {
  breed_id: number; canonical_slug: string; fci_number: number;
  original_notion_page_id: string; work_notion_page_id: string;
  original_data_source_id: string; work_data_source_id: string;
  work_sync_receipt: string | null; work_notion_last_edited_time: string | null;
  status: string;
};
type Original = {
  notion_page_id: string; content_hash: string;
  last_synced_at: string | null; notion_last_edited_time: string | null;
};
const normalize = (value: string) => value.replaceAll("-", "").toLowerCase();
const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;
// Short, hard expiry even if a later deployment forgets to disable the flag.
const REBASELINE_EXPIRES_AT = Date.parse("2026-11-16T23:59:59Z");

/**
 * Step 5: owner-confirmed refresh of INACTIVE SHADOW baselines only.
 *
 * The 344 original baselines remain historical evidence. Before cutover, we
 * independently observe the current Notion 60-field page + current Admin D1
 * values and refresh the SHADOW receipt/revision with a single-row CAS.
 *
 * This deliberately DOES NOT replay 12,401 historical differences, modify
 * canonical breed content, update the old mapping, PATCH Notion, activate
 * sync, deploy a migration or restart editorial automations.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const bindings = env as unknown as Bindings;
  const oldId = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const workId = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
      bindings.NOTION_BREED_WORKCOPY_REBASELINE_ENABLED !== "true" ||
      Date.now() > REBASELINE_EXPIRES_AT ||
      bindings.NOTION_BREED_SYNC_ENABLED !== "true" ||
      bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "false" ||
      !UUID.test(oldId) || !UUID.test(workId) ||
      normalize(oldId) === normalize(workId)) {
    return Response.json({ code:"BREED_WORKCOPY_REBASELINE_DISABLED" },
      { status:503, headers });
  }
  if (request.headers.get("x-psipedia-confirm-action") !== "REBASELINE_344_BREEDS") {
    return Response.json({ code:"BREED_WORKCOPY_REBASELINE_CONFIRMATION_REQUIRED" },
      { status:409, headers });
  }
  const cursor = request.headers.get("x-psipedia-breed-baseline-after") ?? "0";
  if (!/^(0|[1-9][0-9]{0,9})$/.test(cursor) || Number(cursor) > 2147483647) {
    return Response.json({ code:"BREED_WORKCOPY_REBASELINE_CURSOR_INVALID" },
      { status:400, headers });
  }
  try {
    const db = bindings.DB;
    const cohort = await db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status='SHADOW' THEN 1 ELSE 0 END) AS shadow " +
      "FROM breed_notion_workcopy_links",
    ).first<{ total: number; shadow: number | null }>();
    if (Number(cohort?.total) !== 344 || Number(cohort?.shadow) !== 344) {
      return Response.json({ code:"BREED_WORKCOPY_REBASELINE_NOT_344_SHADOW" },
        { status:409, headers });
    }
    const rows = await db.prepare(
      "SELECT breed_id,canonical_slug,fci_number,original_notion_page_id," +
      "work_notion_page_id,original_data_source_id,work_data_source_id," +
      "work_sync_receipt,work_notion_last_edited_time,status " +
      "FROM breed_notion_workcopy_links " +
      "WHERE status='SHADOW' AND breed_id>? ORDER BY breed_id LIMIT 10",
    ).bind(Number(cursor)).all<Row>();

    let refreshed = 0, failed = 0, changedNotionRevisions = 0, observedDifferences = 0;
    for (const row of rows.results) {
      try {
        if (normalize(row.original_data_source_id) !== normalize(oldId) ||
            normalize(row.work_data_source_id) !== normalize(workId)) {
          throw Error("BREED_WORKCOPY_REBASELINE_SOURCE_CHANGED");
        }
        if (!isCompatibleBreedWorkcopyReceipt(row.work_sync_receipt)) {
          throw Error("BREED_WORKCOPY_REBASELINE_RECEIPT_INVALID");
        }
        const original = await db.prepare(
          "SELECT notion_page_id,content_hash,last_synced_at,notion_last_edited_time " +
          "FROM breed_notion_sync WHERE breed_id=? LIMIT 1",
        ).bind(row.breed_id).first<Original>();
        if (!original || normalize(original.notion_page_id) !==
            normalize(row.original_notion_page_id)) {
          throw Error("BREED_WORKCOPY_REBASELINE_OLD_LINK_CHANGED");
        }
        const canonical = await getManagedBreed(row.breed_id);
        if (!canonical || canonical.slug !== row.canonical_slug ||
            canonical.fciNumber !== row.fci_number) {
          throw Error("BREED_WORKCOPY_REBASELINE_CANONICAL_CHANGED");
        }
        const page = await notionRequest<NotionPage>(bindings,
          "/pages/" + encodeURIComponent(row.work_notion_page_id));
        if (normalize(page.id) !== normalize(row.work_notion_page_id) ||
            !notionPageBelongsToDataSource(page, workId) ||
            notionRichTextProperty(page, "Psipedia ID") !== String(canonical.id) ||
            notionNumberProperty(page, "FCI číslo") !== canonical.fciNumber ||
            !page.last_edited_time) {
          throw Error("BREED_WORKCOPY_REBASELINE_WORK_IDENTITY_CHANGED");
        }
        const origin = page.properties?.["Zdrojový profil Notion"];
        const sourceUrl = origin && typeof origin === "object" &&
          "url" in origin && typeof origin.url === "string" ? origin.url : "";
        if (normalize(sourceUrl.split(/[?#]/)[0].replace(/[-/?#]/g, "").slice(-32)) !==
            normalize(row.original_notion_page_id)) {
          throw Error("BREED_WORKCOPY_REBASELINE_PROVENANCE_CHANGED");
        }
        // Observe independently, never choose a winner for old differences.
        const baseline = buildBreedWorkCopyBaseline(page, canonical);
        const fresh = await notionRequest<NotionPage>(bindings,
          "/pages/" + encodeURIComponent(row.work_notion_page_id));
        if (fresh.last_edited_time !== page.last_edited_time ||
            normalize(fresh.id) !== normalize(page.id) ||
            !notionPageBelongsToDataSource(fresh, workId)) {
          throw Error("BREED_WORKCOPY_REBASELINE_NOTION_CHANGED_DURING_READ");
        }
        const updated = await db.prepare(BREED_WORKCOPY_REBASELINE_CAS_SQL).bind(
          ...breedWorkCopyRebaselineBindings({
            row, source:original, value:baseline.value,
            pageRevision:page.last_edited_time, canonicalUpdatedAt:canonical.updatedAt,
          }),
        ).run();
        if (updated.meta.changes !== 1)
          throw Error("BREED_WORKCOPY_REBASELINE_CAS_FAILED");
        refreshed++;
        observedDifferences += baseline.differenceCount;
        if (row.work_notion_last_edited_time !== page.last_edited_time)
          changedNotionRevisions++;
      } catch (error) {
        failed++;
        const code = error instanceof Error ? error.message : "BREED_WORKCOPY_REBASELINE_FAILED";
        console.error("breed_workcopy_rebaseline_failed", { breedId:row.breed_id, code });
        await db.prepare(
          "UPDATE breed_notion_workcopy_links SET work_last_error_code=? " +
          "WHERE breed_id=? AND status='SHADOW'",
        ).bind(code.slice(0,100),row.breed_id).run().catch(()=>undefined);
      }
    }
    const counts = await db.prepare(
      "SELECT COUNT(*) AS total, " +
      "SUM(CASE WHEN work_sync_receipt IS NOT NULL THEN 1 ELSE 0 END) AS ready, " +
      "SUM(CASE WHEN work_last_error_code IS NOT NULL THEN 1 ELSE 0 END) AS errors " +
      "FROM breed_notion_workcopy_links",
    ).first<{ total:number; ready:number | null; errors:number | null }>();
    return Response.json({
      scanned: rows.results.length,
      nextCursor: rows.results.length === 10 ? rows.results[9].breed_id : null,
      refreshed, failed, changedNotionRevisions, observedDifferences,
      stagedTotal: counts?.total ?? 0,
      baselinesReady: counts?.ready ?? 0,
      rowsNeedingReview: counts?.errors ?? 0,
      cutoverReady:false,
    }, { headers });
  } catch (error) {
    console.error("breed_workcopy_rebaseline_request_failed",
      error instanceof Error ? error.message : "unknown");
    return Response.json({ code:"BREED_WORKCOPY_REBASELINE_FAILED" },
      { status:503, headers });
  }
}
