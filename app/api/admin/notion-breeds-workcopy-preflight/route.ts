import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { planBreedWorkcopyIdentity } from "@/lib/notion-breed-workcopy-identity-plan.mjs";
import { planBreedWorkcopyShadowRows } from "@/lib/notion-breed-workcopy-shadow-plan.mjs";

import { inspectBreedWorkCopy } from "@/lib/notion-breed-workcopy-parity.mjs";
import { expandBreed60WorkPage } from "@/lib/notion-breed-workcopy-adapter.mjs";

export const dynamic = "force-dynamic";

type OwnedNotionPage = NotionPage & {
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
};
type RuntimeBindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;

async function inventory(source: string, bindings: RuntimeBindings) {
  const pages: OwnedNotionPage[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const response: {
      results?: OwnedNotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    } = await notionRequest(bindings,
      "/data_sources/" + encodeURIComponent(source) + "/query", {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      });
    if (!Array.isArray(response.results) || typeof response.has_more !== "boolean")
      throw Error("BREED_WORKCOPY_NOTION_LIST_INCOMPLETE");
    for (const page of response.results) {
      if (!notionPageBelongsToDataSource(page, source) || seen.has(page.id))
        throw Error("BREED_WORKCOPY_NOTION_OWNERSHIP_OR_DUPLICATE");
      seen.add(page.id);
      pages.push(page);
    }
    if (pages.length > 500) throw Error("BREED_WORKCOPY_TOO_MANY_PAGES");
    if (response.has_more && !response.next_cursor)
      throw Error("BREED_WORKCOPY_NOTION_CURSOR_MISSING");
    cursor = response.has_more ? response.next_cursor ?? null : null;
  } while (cursor);
  return pages;
}

/**
 * Owner-only, read-only operational preflight. This endpoint NEVER writes to
 * Notion or D1, and NEVER changes active sync or automation data source IDs.
 */
export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const bindings = env as unknown as RuntimeBindings;
  const source = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const work = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
    !UUID.test(source) || !UUID.test(work) ||
    source.replaceAll("-", "").toLowerCase() === work.replaceAll("-", "").toLowerCase()) {
    return Response.json({ code: "BREED_WORKCOPY_PREFLIGHT_NOT_CONFIGURED" },
      { status: 503, headers });
  }

  try {
    const [sourcePages, workPages, canonical, productionMappings] = await Promise.all([
      inventory(source, bindings),
      inventory(work, bindings),
      bindings.DB.prepare(
        "SELECT id,slug,name,fci_number,status FROM managed_breeds",
      ).all<{ id: number; slug: string; name: string; fci_number: number | null; status: string }>(),
      bindings.DB.prepare(
        "SELECT breed_id,notion_page_id,content_hash,last_synced_at,notion_last_edited_time FROM breed_notion_sync",
      ).all<{ breed_id: number; notion_page_id: string; content_hash: string;
        last_synced_at: string | null; notion_last_edited_time: string | null }>(),
    ]);
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
    let shadowReceiptReady = false;
    let shadowReceiptIssue: string | null = null;
    if (result.identityReady && workCopyContentReady) {
      try {
        const rows = planBreedWorkcopyShadowRows({
          identityPlan: result,
          productionLinks: productionMappings.results,
          originalDataSourceId: source,
          workDataSourceId: work,
        });
        shadowReceiptReady = rows.length === 344;
      } catch (reason) {
        shadowReceiptIssue = reason instanceof Error ? reason.message : "BREED_SHADOW_UNKNOWN";
      }
    }
    return Response.json({
      identityReady: result.identityReady,
      cutoverReady: false,
      workCopyContentReady,
      shadowReceiptReady,
      shadowReceiptIssue,
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
