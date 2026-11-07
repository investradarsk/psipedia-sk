import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import type { NotionSyncBindings } from "@/lib/notion-sync-shared";
import { fetchBreedNotionInventory as inventory } from "@/lib/notion-breed-workcopy-inventory";
import { planBreedWorkcopyIdentity } from "@/lib/notion-breed-workcopy-identity-plan.mjs";
import { planBreedWorkcopyShadowRows } from "@/lib/notion-breed-workcopy-shadow-plan.mjs";
import { materializeBreedWorkCopyForRead } from "@/lib/notion-breed-workcopy-compatible-page.mjs";
import { isCompatibleBreedWorkcopyReceipt } from "@/lib/notion-breed-workcopy-receipt";
import { summarizeBreedWorkcopyD1Readiness } from "@/lib/notion-breed-workcopy-d1-readiness.mjs";

import { inspectBreedWorkCopy } from "@/lib/notion-breed-workcopy-parity.mjs";
import { expandBreed60WorkPage } from "@/lib/notion-breed-workcopy-adapter.mjs";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;

type CanonicalBreedRow = { id: number; slug: string; name: string; fci_number: number | null; status: string };
type ProductionBreedLinkRow = { breed_id: number; notion_page_id: string; content_hash: string;
  last_synced_at: string | null; notion_last_edited_time: string | null };
async function readD1Base(database: D1Database) {
  const [canonical, productionMappings] = await Promise.all([
    database.prepare("SELECT id,slug,name,fci_number,status FROM managed_breeds")
      .all<CanonicalBreedRow>(),
    database.prepare("SELECT breed_id,notion_page_id,content_hash,last_synced_at,"+
      "notion_last_edited_time FROM breed_notion_sync").all<ProductionBreedLinkRow>(),
  ]);
  return { canonical, productionMappings };
}

async function readD1Diagnostics(database: D1Database,
  canonicalBreeds: CanonicalBreedRow[],
  productionLinks: ProductionBreedLinkRow[]) {
  // Read-only physical D1 schema check; presence of a SQL source file is
  // NOT evidence that migration 0159 has run on production.
  const shadowTable = await database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' " +
    "AND name='breed_notion_workcopy_links' LIMIT 1",
  ).first<{ name: string }>();
  const shadowTablePresent = Boolean(shadowTable?.name);
  const shadowColumns = shadowTablePresent
    ? (await database.prepare(
      "SELECT name FROM pragma_table_info('breed_notion_workcopy_links')",
    ).all<{ name: string }>()).results
    : [];
  const shadowStatuses = shadowTablePresent &&
    shadowColumns.some(column => column.name === "status")
    ? (await database.prepare(
      "SELECT status, COUNT(*) AS count FROM breed_notion_workcopy_links GROUP BY status",
    ).all<{ status: string; count: number }>()).results
    : [];
  return summarizeBreedWorkcopyD1Readiness({
    canonicalBreeds,
    productionLinks,
    shadowTablePresent,
    shadowColumns,
    shadowStatuses,
    isCompatibleReceipt: isCompatibleBreedWorkcopyReceipt,
  });

}

/**
 * Owner-only, read-only operational preflight. This endpoint NEVER writes to
 * Notion or D1, and NEVER changes active sync or automation data source IDs.
 */
export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const bindings = env as unknown as RuntimeBindings;
  const source = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const work = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  const headers = { "Cache-Control": "private, no-store" };
  const d1Only = new URL(request.url).searchParams.get("scope") === "d1";
  if (!bindings.DB || (!d1Only && (!bindings.NOTION_API_TOKEN ||
    !UUID.test(source) || !UUID.test(work) ||
    source.replaceAll("-", "").toLowerCase() === work.replaceAll("-", "").toLowerCase()))) {
    return Response.json({ code: "BREED_WORKCOPY_PREFLIGHT_NOT_CONFIGURED" },
      { status: 503, headers });
  }

  try {
    if (d1Only) {
      // Lightweight owner-only D1 check, with no Notion request and no writes.
      const { canonical, productionMappings } = await readD1Base(bindings.DB);
      const d1Diagnostics = await readD1Diagnostics(
        bindings.DB, canonical.results, productionMappings.results,
      );
      return Response.json({
        scope: "d1", cutoverReady: false, d1Diagnostics,
        next: "This report does not authorize applying SQL 0159 or switching sync",
      }, { headers });
    }
    const [sourcePages, workPages, d1] = await Promise.all([
      inventory(source, bindings),
      inventory(work, bindings),
      readD1Base(bindings.DB),
    ]);
    const { canonical, productionMappings } = d1;
    const d1Diagnostics = await readD1Diagnostics(
      bindings.DB, canonical.results, productionMappings.results,
    );
    const result = planBreedWorkcopyIdentity({
      sourcePages,
      workPages,
      canonicalBreeds: canonical.results,
      productionLinks: productionMappings.results,
    });
    const parity = inspectBreedWorkCopy(sourcePages, workPages);
    const malformedMergedFields: Array<{ pageId: string; target: string; code: string }> = [];
    for (const page of workPages) {
      const expanded = expandBreed60WorkPage(page);
      for (const failure of expanded.errors) {
        malformedMergedFields.push({
          pageId: page.id,
          target: failure.target,
          code: failure.code,
        });
      }
    }
    const workCopyContentReady = parity.dataParity && malformedMergedFields.length === 0;
    const d1ById = new Map(canonical.results.map(breed => [breed.id, breed]));
    const workByPage = new Map(workPages.map(page => [page.id.replaceAll("-", ""), page]));
    const readAdapterErrors: Array<{ breedId: number; code: string }> = [];
    if (result.identityReady && workCopyContentReady) {
      for (const mapping of result.rows) {
        const d1Breed = d1ById.get(mapping.breedId);
        const workPage = workByPage.get(mapping.newPageId.replaceAll("-", ""));
        if (!d1Breed || !workPage) {
          readAdapterErrors.push({ breedId: mapping.breedId, code: "BREED_WORKCOPY_ADAPTER_SOURCE_MISSING" });
          continue;
        }
        try {
          const projected = materializeBreedWorkCopyForRead(workPage, {
            id: d1Breed.id, slug: d1Breed.slug, fciNumber: d1Breed.fci_number,
          });
          if (!projected.valid) {
            readAdapterErrors.push({ breedId: mapping.breedId, code: "BREED_WORKCOPY_ADAPTER_MERGE_INVALID" });
          }
        } catch (error) {
          readAdapterErrors.push({
            breedId: mapping.breedId,
            code: error instanceof Error ? error.message : "BREED_WORKCOPY_ADAPTER_FAILED",
          });
        }
      }
    }
    const readAdapterReady = result.identityReady && workCopyContentReady &&
      readAdapterErrors.length === 0;
    let shadowReceiptReady = false;
    let compatibleReceiptCount = 0;
    let shadowReceiptIssue: string | null = null;
    if (result.identityReady && workCopyContentReady) {
      try {
        const rows = planBreedWorkcopyShadowRows({
          identityPlan: result,
          productionLinks: productionMappings.results,
          originalDataSourceId: source,
          workDataSourceId: work,
        });
        compatibleReceiptCount = rows.filter(row =>
          isCompatibleBreedWorkcopyReceipt(row.originalSyncReceipt)).length;
        shadowReceiptReady = rows.length === 344 && compatibleReceiptCount === 344;
      } catch (reason) {
        shadowReceiptIssue = reason instanceof Error ? reason.message : "BREED_SHADOW_UNKNOWN";
      }
    }
    return Response.json({
      identityReady: result.identityReady,
      d1Diagnostics,
      cutoverReady: false,
      workCopyContentReady,
      shadowReceiptReady,
      compatibleReceiptCount,
      legacyOrInvalidReceiptCount: result.identityReady ? 344 - compatibleReceiptCount : null,
      shadowReceiptIssue,
      readAdapterReady,
      readAdapterErrorCount: readAdapterErrors.length,
      readAdapterErrors: readAdapterErrors.slice(0, 50),
      summary: result.summary,
      contentComparison: {
        ...parity.stats,
        issueCount: parity.issues.length,
        issues: parity.issues.slice(0, 50),
        malformedMergedFieldCount: malformedMergedFields.length,
        malformedMergedFields: malformedMergedFields.slice(0, 50),
      },
      issues: result.issues.slice(0, 50),
      issueCount: result.issues.length,
      // Operational content freshness and bidirectional sync remain unproven.
      next: "Review D1 field receipts and bi-directional sync before any remapping",
    }, { headers });
  } catch (error) {
    // Do not reveal Notion tokens, request bodies or D1 values to the client.
    console.error("breed_workcopy_preflight_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ code: "BREED_WORKCOPY_PREFLIGHT_FAILED" },
      { status: 503, headers });
  }
}
