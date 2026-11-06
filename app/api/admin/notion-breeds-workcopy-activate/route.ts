import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { fetchBreedNotionInventory } from "@/lib/notion-breed-workcopy-inventory";
import { planBreedWorkcopyIdentity } from "@/lib/notion-breed-workcopy-identity-plan.mjs";
import { inspectBreedWorkCopy } from "@/lib/notion-breed-workcopy-parity.mjs";
import { expandBreed60WorkPage } from "@/lib/notion-breed-workcopy-adapter.mjs";
import { planBreedWorkcopyShadowRows } from "@/lib/notion-breed-workcopy-shadow-plan.mjs";
import { planBreedWorkcopyActivation } from "@/lib/notion-breed-workcopy-activation-plan.mjs";
import { isCompatibleBreedWorkcopyReceipt } from "@/lib/notion-breed-workcopy-receipt";
import { breedWorkcopyAtomicActivationSql } from "@/lib/notion-breed-workcopy-activation-sql.mjs";
import type { NotionSyncBindings } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Bindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};
type DbBreed = {
  id: number; slug: string; name: string; fci_number: number | null; status: string;
};
type DbLink = {
  breed_id: number; notion_page_id: string; content_hash: string;
  last_synced_at: string | null; notion_last_edited_time: string | null;
};
type ShadowRow = {
  breed_id: number; original_notion_page_id: string;
  work_notion_page_id: string; original_data_source_id: string;
  work_data_source_id: string; canonical_slug: string; fci_number: number;
  original_sync_receipt: string; work_sync_receipt: string | null;
  work_notion_last_edited_time: string | null; status: string;
};
const UUID = /^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i;
const norm = (s:string) => s.replaceAll("-", "").toLowerCase();

/**
 * Owner-confirmed, one-shot D1 status transition for all 344 breeds.
 * Both cron sync engines MUST first be off. External ChatGPT editorial
 * automations must be paused by the operator. Never edits Notion, canonical
 * profiles, publication, SEO or original production page-ID mappings.
 *
 * Deployed disabled. This is NOT called on merge or by any cron.
 */
export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const bindings = env as unknown as Bindings;
  const oldId = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const newId = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  if (!bindings.DB || !bindings.NOTION_API_TOKEN ||
      bindings.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED !== "true" ||
      bindings.NOTION_BREED_SYNC_ENABLED !== "false" ||
      bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "false" ||
      !UUID.test(oldId) || !UUID.test(newId) || norm(oldId) === norm(newId)) {
    return Response.json({code:"BREED_WORKCOPY_ACTIVATION_DISABLED"},
      {status:503,headers});
  }
  if (request.headers.get("x-psipedia-confirm-action") !== "ACTIVATE_344_BREEDS" ||
      request.headers.get("x-psipedia-editorial-automations") !== "BOTH_PAUSED") {
    return Response.json({code:"BREED_WORKCOPY_ACTIVATION_CONFIRMATION_REQUIRED"},
      {status:409,headers});
  }

  try {
    const db = bindings.DB;
    const [sourcePages, workPages, canonical, originalLinks, staged] =
      await Promise.all([
        fetchBreedNotionInventory(oldId, bindings),
        fetchBreedNotionInventory(newId, bindings),
        db.prepare("SELECT id,slug,name,fci_number,status FROM managed_breeds")
          .all<DbBreed>(),
        db.prepare("SELECT breed_id,notion_page_id,content_hash,last_synced_at,"+
          "notion_last_edited_time FROM breed_notion_sync").all<DbLink>(),
        db.prepare("SELECT breed_id,original_notion_page_id,work_notion_page_id,"+
          "original_data_source_id,work_data_source_id,canonical_slug,"+
          "fci_number,original_sync_receipt,work_sync_receipt,"+
          "work_notion_last_edited_time,status FROM breed_notion_workcopy_links")
          .all<ShadowRow>(),
      ]);
    const identity = planBreedWorkcopyIdentity({
      sourcePages, workPages,
      canonicalBreeds: canonical.results, productionLinks: originalLinks.results,
    });
    const parity = inspectBreedWorkCopy(sourcePages, workPages);
    const mergedValid = workPages.every(page =>
      expandBreed60WorkPage(page).errors.length === 0);
    if (!identity.identityReady || !parity.dataParity || !mergedValid) {
      return Response.json({code:"BREED_WORKCOPY_LIVE_PREFLIGHT_FAILED"},
        {status:409,headers});
    }
    const planned = planBreedWorkcopyShadowRows({
      identityPlan: identity,
      productionLinks: originalLinks.results,
      originalDataSourceId: oldId,
      workDataSourceId: newId,
    });
    const activation = planBreedWorkcopyActivation({
      planned, staged: staged.results, workPages,
      oldSourceId: oldId, newSourceId: newId,
    });
    // A syntactically valid receipt is insufficient: the full existing
    // per-field engine must also understand both saved field snapshots.
    const baselinesValid = staged.results.every(row =>
      isCompatibleBreedWorkcopyReceipt(row.work_sync_receipt));
    if (!baselinesValid) {
      return Response.json({code:"BREED_WORKCOPY_BASELINE_INCOMPATIBLE"},
        {status:409,headers});
    }
    if (!activation.ready) {
      return Response.json({
        code:"BREED_WORKCOPY_NOT_READY",
        count:activation.count, failures:activation.failures,
      },{status:409,headers});
    }

    // MATERIALIZED eligibility and the exact 344/344 guard execute before the
    // one-shot D1 update. Any mismatch produces ZERO ACTIVE rows.
    const result = await db.prepare(breedWorkcopyAtomicActivationSql)
      .bind(oldId, newId).run();

    if (result.meta.changes !== 344) {
      return Response.json({code:"BREED_WORKCOPY_ACTIVATION_CAS_FAILED"},
        {status:409,headers});
    }
    return Response.json({
      activated:true, activeLinks:344,
      oldSyncEnabled:false, workCopySyncEnabled:false,
      next:"Enable only the new sync after readback, then switch both editorial automations.",
    },{headers});
  } catch (error) {
    console.error("breed_workcopy_activation_failed",
      error instanceof Error ? error.message : "unknown");
    return Response.json({code:"BREED_WORKCOPY_ACTIVATION_FAILED"},
      {status:503,headers});
  }
}
