import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { fetchBreedNotionInventory } from "@/lib/notion-breed-workcopy-inventory";
import { planBreedWorkcopyIdentity } from "@/lib/notion-breed-workcopy-identity-plan.mjs";
import { inspectBreedWorkCopy } from "@/lib/notion-breed-workcopy-parity.mjs";
import { expandBreed60WorkPage } from "@/lib/notion-breed-workcopy-adapter.mjs";
import { planBreedWorkcopyShadowRows } from "@/lib/notion-breed-workcopy-shadow-plan.mjs";
import { isCompatibleBreedWorkcopyReceipt } from "@/lib/notion-breed-workcopy-receipt";
import type { NotionSyncBindings } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";
type Bindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_STAGE_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
const headers = { "Cache-Control": "no-store" };
const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;

type DbLink = {
  breed_id: number; notion_page_id: string; content_hash: string;
  last_synced_at: string | null; notion_last_edited_time: string | null;
};
type DbBreed = {
  id: number; slug: string; name: string; fci_number: number | null; status: string;
};
type ShadowRow = {
  breed_id: number; original_notion_page_id: string;
  work_notion_page_id: string; canonical_slug: string; fci_number: number;
  status: string; work_sync_receipt: string | null;
};

/**
 * Owner-triggered SHADOW ONLY staging. The old 109-field sync stays active.
 * Does not update breed_notion_sync, managed_breeds, Notion or public pages.
 * No activation, no cron, no automated staging from PR merge.
 */
export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const bindings = env as unknown as Bindings;
  const oldId = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const newId = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
    bindings.NOTION_BREED_WORKCOPY_STAGE_ENABLED !== "true" ||
    bindings.NOTION_BREED_SYNC_ENABLED !== "true" ||
    bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "false" ||
    !UUID.test(oldId) || !UUID.test(newId) ||
    oldId.replaceAll("-", "") === newId.replaceAll("-", "")) {
    return Response.json({ code: "BREED_WORKCOPY_STAGING_DISABLED" },
      { status: 503, headers });
  }
  if (request.headers.get("x-psipedia-confirm-action") !== "STAGE_344_BREEDS") {
    return Response.json({ code: "BREED_WORKCOPY_STAGE_CONFIRMATION_REQUIRED" },
      { status: 409, headers });
  }
  try {
    const [sourcePages, workPages, canonical, originalLinks] = await Promise.all([
      fetchBreedNotionInventory(oldId, bindings),
      fetchBreedNotionInventory(newId, bindings),
      bindings.DB.prepare(
        "SELECT id,slug,name,fci_number,status FROM managed_breeds",
      ).all<DbBreed>(),
      bindings.DB.prepare(
        "SELECT breed_id,notion_page_id,content_hash,last_synced_at,notion_last_edited_time "+
        "FROM breed_notion_sync",
      ).all<DbLink>(),
    ]);
    const identity = planBreedWorkcopyIdentity({
      sourcePages, workPages,
      canonicalBreeds: canonical.results, productionLinks: originalLinks.results,
    });
    const parity = inspectBreedWorkCopy(sourcePages, workPages);
    const malformed = workPages.flatMap(page =>
      expandBreed60WorkPage(page).errors.map(e => ({
        pageId: page.id, target: e.target, code: e.code,
      })),
    );
    if (!identity.identityReady || !parity.dataParity || malformed.length) {
      return Response.json({
        code: "BREED_WORKCOPY_SOURCE_PARITY_FAILED",
        matched: identity.summary.matchingLinks,
        mismatches: parity.stats.mismatchedCells,
        invalidSections: malformed.length,
      }, { status: 409, headers });
    }
    const rows = planBreedWorkcopyShadowRows({
      identityPlan: identity,
      productionLinks: originalLinks.results,
      originalDataSourceId: oldId, workDataSourceId: newId,
    });
    const revisionByPage = new Map(workPages.map(page => [
      page.id.replaceAll("-", ""), page.last_edited_time ?? null,
    ]));
    let changed = 0;
    // D1.batch executes each small group atomically. Any CAS miss remains
    // a SHADOW (never ACTIVE); repeating the request is safe/idempotent.
    for (let offset = 0; offset < rows.length; offset += 25) {
      const batch = rows.slice(offset, offset + 25).map(row =>
        bindings.DB!.prepare(
          "INSERT INTO breed_notion_workcopy_links ("+
          "breed_id,original_notion_page_id,work_notion_page_id,"+
          "original_data_source_id,work_data_source_id,canonical_slug,fci_number,"+
          "original_sync_receipt,work_sync_receipt,original_sync_last_synced_at,"+
          "original_notion_last_edited_time,work_notion_last_edited_time,status"+
          ") SELECT ?,?,?,?,?,?,?,source.content_hash,"+
          "CASE WHEN source.content_hash LIKE 'breed-field-v1:%' "+
          "THEN source.content_hash ELSE NULL END,"+
          "source.last_synced_at,source.notion_last_edited_time,?,'SHADOW' "+
          "FROM breed_notion_sync AS source "+
          "JOIN managed_breeds AS breed ON breed.id=source.breed_id "+
          "WHERE source.breed_id=? AND source.notion_page_id=? "+
          "AND breed.slug=? AND breed.fci_number=? AND source.content_hash=? "+
          "ON CONFLICT(breed_id) DO UPDATE SET "+
          "original_sync_receipt=excluded.original_sync_receipt,"+
          "work_sync_receipt=excluded.work_sync_receipt,"+
          "original_sync_last_synced_at=excluded.original_sync_last_synced_at,"+
          "original_notion_last_edited_time=excluded.original_notion_last_edited_time,"+
          "work_notion_last_edited_time=excluded.work_notion_last_edited_time,"+
          "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
          "WHERE breed_notion_workcopy_links.status='SHADOW' "+
          "AND breed_notion_workcopy_links.original_notion_page_id=excluded.original_notion_page_id "+
          "AND breed_notion_workcopy_links.work_notion_page_id=excluded.work_notion_page_id "+
          "AND breed_notion_workcopy_links.canonical_slug=excluded.canonical_slug "+
          "AND breed_notion_workcopy_links.fci_number=excluded.fci_number",
        ).bind(
          row.breedId,row.originalPageId,row.workPageId,
          row.originalDataSourceId,row.workDataSourceId,row.slug,row.fciNumber,
          revisionByPage.get(row.workPageId.replaceAll("-", "")) ?? null,
          row.breedId,row.originalPageId,row.slug,row.fciNumber,
          row.originalSyncReceipt,
        ),
      );
      const results = await bindings.DB.batch(batch);
      changed += results.reduce((n, result) => n + (result.meta.changes ?? 0), 0);
    }
    const saved = await bindings.DB.prepare(
      "SELECT breed_id,original_notion_page_id,work_notion_page_id,"+
      "canonical_slug,fci_number,status,work_sync_receipt FROM breed_notion_workcopy_links",
    ).all<ShadowRow>();
    const existing = new Map(saved.results.map(row => [row.breed_id, row]));
    const good = rows.every(row => {
      const check = existing.get(row.breedId);
      return check?.status === "SHADOW" &&
        check.original_notion_page_id === row.originalPageId &&
        check.work_notion_page_id === row.workPageId &&
        check.canonical_slug === row.slug &&
        check.fci_number === row.fciNumber;
    });
    const receiptsReady = rows.filter(row =>
      isCompatibleBreedWorkcopyReceipt(existing.get(row.breedId)?.work_sync_receipt)).length;
    return Response.json({
      shadowStaged: good && saved.results.length === 344,
      stagedRows: saved.results.length,
      receiptsReady,
      legacyOrInvalidReceipts: 344 - receiptsReady,
      casApplied: changed,
      cutoverReady: false,
      // This endpoint NEVER changes status to VERIFIED or ACTIVE.
    }, { status: good ? 200 : 409, headers });
  } catch (error) {
    console.error("breed_workcopy_staging_failed",
      error instanceof Error ? error.message : "unknown");
    return Response.json({ code: "BREED_WORKCOPY_STAGE_FAILED" },
      { status: 503, headers });
  }
}
