/**
 * Explicitly gated Notion 60+2 breed synchronization, independent from the
 * existing 109-property production mapping.
 *
 * Disabled by default. NEVER run alongside the old breed sync. Every profile
 * needs a separately verified ACTIVE shadow D1 link with a valid per-field
 * baseline receipt. No new breeds, Notion system-field PATCHes, publication,
 * gallery, image ingestion, or relation changes.
 */
import {
  getManagedBreed, updateManagedBreed, validateNotionBreedCandidate,
  type ManagedBreed,
} from "@/lib/breed-store";
import {
  notionRequest, notionFlagEnabled, notionRichTextProperty,
  notionNumberProperty, type NotionPage, type NotionSyncBindings,
} from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { notionPageMustSkipInboundSync } from "@/lib/admin-record-lifecycle";
import {
  breedFieldSnapshot, parseBreedFieldSnapshot,
  BREED_NOTION_EDITABLE_FIELDS, type BreedFieldSnapshot,
  type BreedNotionField,
} from "@/lib/notion-breed-field-delta";
import { planSafeBreedFields } from "@/lib/notion-breed-safe-patch";
import { planBreedWorkCopyEditorialDelta } from "@/lib/notion-breed-workcopy-delta";
import { planBreedWorkCopyFieldWrite } from "@/lib/notion-breed-workcopy-patch-bridge.mjs";
import { BREED_NOTION_SCHEMA } from "@/lib/notion-breed-property-registry";
import { isTransferableBreedWorkCopyValue } from "@/lib/notion-breed-workcopy-value.mjs";
import { isBreedStructuredMeasurement } from "@/lib/breed-controlled-fields.mjs";
import { receiveBreedControlledNotionEdit } from "@/lib/notion-breed-workcopy-controlled";
import {
  workCopyChangedEditorialIds, workCopyNonblankChangedFields,
  workCopyAdminChangedFields,
} from "@/lib/notion-breed-workcopy-field-events.mjs";

export type BreedWorkCopyBindings = NotionSyncBindings & {
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
};

type ShadowLink = {
  breed_id: number; original_notion_page_id: string;
  work_notion_page_id: string;
  original_data_source_id: string; work_data_source_id: string;
  canonical_slug: string; fci_number: number;
  status: string; work_sync_receipt: string | null;
};
type WorkReceipt = { notion: BreedFieldSnapshot; admin: BreedFieldSnapshot };
const actor = "notion-breed-sync@psipedia.sk";
const maxProfiles = 10;
const skippedSpecial = new Set<string>([
  "fciStandard", "editorial",
  "image", "gallery", "relatedBreedIds",
  "relatedArticleIds", "directoryProfileIds",
  "sports",
]);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalized = (id: string) => id.replaceAll("-", "").toLowerCase();

function requireWorkCopyOnly(bindings: BreedWorkCopyBindings) {
  if (!notionFlagEnabled(bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED))
    return false;
  if (notionFlagEnabled(bindings.NOTION_BREED_SYNC_ENABLED))
    throw Error("BREED_DUAL_SYNCHRONIZERS_FORBIDDEN");
  const oldSource = bindings.NOTION_BREEDS_DATA_SOURCE_ID?.trim() ?? "";
  const newSource = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID?.trim() ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(oldSource) ||
      !/^[a-f0-9-]{36}$/i.test(newSource) ||
      normalized(oldSource) === normalized(newSource))
    throw Error("BREED_WORKCOPY_DATASOURCE_INVALID");
  return true;
}

function readReceipt(value: string | null): WorkReceipt {
  if (!value?.startsWith("breed-field-v1:"))
    throw Error("BREED_WORKCOPY_PER_FIELD_BASELINE_MISSING");
  try {
    const encoded = JSON.parse(value.slice("breed-field-v1:".length));
    const notion = parseBreedFieldSnapshot(encoded.notion ?? null);
    const admin = parseBreedFieldSnapshot(encoded.admin ?? null);
    if (!notion || !admin) throw Error();
    return { notion, admin };
  } catch {
    throw Error("BREED_WORKCOPY_PER_FIELD_RECEIPT_INVALID");
  }
}
function encodeReceipt(receipt: WorkReceipt): string {
  // The distinct shadow table owns this new receipt. The original production
  // table and its rollback content_hash NEVER change in work-copy mode.
  return "breed-field-v1:" + JSON.stringify({
    hash: "0".repeat(64),
    notion: JSON.stringify(receipt.notion),
    admin: JSON.stringify(receipt.admin),
  });
}

function assertOwnedPage(
  page: NotionPage, link: ShadowLink, breed: ManagedBreed,
  bindings: BreedWorkCopyBindings,
) {
  const source = bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID!;
  if (normalized(page.id) !== normalized(link.work_notion_page_id) ||
      !notionPageBelongsToDataSource(page, source) ||
      notionRichTextProperty(page, "Psipedia ID") !== String(breed.id) ||
      notionNumberProperty(page, "FCI číslo") !== breed.fciNumber ||
      link.canonical_slug !== breed.slug || link.fci_number !== breed.fciNumber ||
      normalized(link.work_data_source_id) !== normalized(source) ||
      normalized(link.original_data_source_id) !==
        normalized(bindings.NOTION_BREEDS_DATA_SOURCE_ID!)) {
    throw Error("BREED_WORKCOPY_IDENTITY_OR_SOURCE_CHANGED");
  }
  const provenance = page.properties?.["Zdrojový profil Notion"];
  const raw = provenance && typeof provenance === "object" ?
    (provenance as { url?: string }).url ?? "" : "";
  const urlId = raw.replace(/[-/?#]/g, "").slice(-32).toLowerCase();
  if (urlId !== normalized(link.original_notion_page_id))
    throw Error("BREED_WORKCOPY_PROVENANCE_CHANGED");
}

async function getActiveLink(database: D1Database, breedId: number) {
  return database.prepare(
    "SELECT * FROM breed_notion_workcopy_links "+
    "WHERE breed_id=? AND status='ACTIVE' LIMIT 1",
  ).bind(breedId).first<ShadowLink>();
}

/** An ACTIVE cutover must be complete for ALL 344 profiles, never partial. */
async function requireActiveCohort(database: D1Database) {
  const count = await database.prepare(
    "SELECT COUNT(*) AS total, "+
    "SUM(CASE WHEN status='ACTIVE' AND work_sync_receipt IS NOT NULL "+
    "THEN 1 ELSE 0 END) AS ready FROM breed_notion_workcopy_links",
  ).first<{ total: number; ready: number | null }>();
  if (Number(count?.total) !== 344 || Number(count?.ready) !== 344)
    throw Error("BREED_WORKCOPY_COHORT_NOT_ACTIVE");
}
async function advanceReceipt(
  database: D1Database, link: ShadowLink,
  receipt: WorkReceipt,
) {
  const now = new Date().toISOString();
  const next = encodeReceipt(receipt);
  const result = await database.prepare(
    "UPDATE breed_notion_workcopy_links SET work_sync_receipt=?, "+
    "work_last_synced_at=?,work_last_error_code=NULL,updated_at=? "+
    "WHERE breed_id=? AND work_notion_page_id=? "+
    "AND status='ACTIVE' AND work_sync_receipt=?",
  ).bind(next, now, now, link.breed_id, link.work_notion_page_id,
    link.work_sync_receipt).run();
  if (result.meta.changes !== 1)
    throw Error("BREED_WORKCOPY_RECEIPT_CAS_CHANGED");
  link.work_sync_receipt = next;
}

/** Import independent, previously edited Notion cells into D1. */
export async function runNotionBreedWorkCopySyncSweep(args: {
  database: D1Database;
  bindings: BreedWorkCopyBindings;
  targetPageId?: string;
  changedPropertyIds?: readonly string[];
  /** Owner-clicked import of a single ACTIVE, verified work-copy breed. */
  manualImport?: boolean;
}) {
  if (args.manualImport && (!args.targetPageId || args.changedPropertyIds?.length))
    throw Error("BREED_WORKCOPY_MANUAL_SCOPE_INVALID");
  const summary = {
    enabled: notionFlagEnabled(args.bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED),
    scanned: 0, created: 0, updated: 0, unchanged: 0, failed: 0,
  };
  if (!requireWorkCopyOnly(args.bindings)) return summary;
  // As with breeders, periodic sweeps never replay whole profile values.
  // Only a signed targeted property event is an inbound editorial change.
  if (!args.targetPageId || (!args.manualImport && !args.changedPropertyIds?.length)) return summary;
  await requireActiveCohort(args.database);
  // Same as breeder field events: the verified edited Notion field is authoritative.
  const authority = {};
  const result = await args.database.prepare(
    "SELECT * FROM breed_notion_workcopy_links WHERE status='ACTIVE' "+
    "AND work_notion_page_id=? LIMIT ?",
  ).bind(args.targetPageId, maxProfiles).all<ShadowLink>();
  for (const link of result.results) {
    // An Admin-unpublished breed stays a draft even if a signed work-copy
    // webhook arrives later. Explicit republishing remains Admin-owned.
    if(await notionPageMustSkipInboundSync(args.database,link.work_notion_page_id)){
      summary.unchanged++;
      continue;
    }
    summary.scanned++;
    try {
      const receipt = readReceipt(link.work_sync_receipt);
      const canonical = await getManagedBreed(link.breed_id);
      if (!canonical) throw Error("BREED_WORKCOPY_CANONICAL_MISSING");
      const page = await notionRequest<NotionPage>(args.bindings,
        "/pages/" + encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(page, link, canonical, args.bindings);
      // The new typed columns have their own independent per-property receipts.
      // Never route them through the legacy descriptive-text parser.
      let controlledUpdated = false;
      try {
        const controlled = await receiveBreedControlledNotionEdit({
          database:args.database,bindings:args.bindings,breedId:link.breed_id,
          page,changedProperties:args.manualImport
            ? Object.keys(page.properties ?? {}) : (args.changedPropertyIds ?? []),
        });
        controlledUpdated = controlled.updated;
        if (controlled.invalidKeys.length)
          console.warn("breed_controlled_notion_fields_pending",{
            breedId:link.breed_id,count:controlled.invalidKeys.length,
          });
      } catch(error) {
        // A missing migration or invalid structured value must never prevent
        // an unrelated ordinary field from synchronizing.
        console.warn("breed_controlled_sync_pending",{
          breedId:link.breed_id,code:error instanceof Error?error.message:"UNKNOWN",
        });
      }
      const edited = workCopyChangedEditorialIds(
        page, args.manualImport ? Object.keys(page.properties??{}) : args.changedPropertyIds,
        BREED_NOTION_SCHEMA,
      );
      if (!edited.length) {
        if (controlledUpdated) summary.updated++; else summary.unchanged++;
        continue;
      }
      // Manual import is explicitly Notion-authoritative even if the latest
      // receipt previously acknowledged an unchanged Notion cell.
      const manualBaseline = args.manualImport ? breedFieldSnapshot(canonical) : null;
      const plan = planBreedWorkCopyEditorialDelta({
        page, canonical,
        previousNotion: manualBaseline ?? receipt.notion,
        previousAdmin: manualBaseline ?? receipt.admin,
        authority, eventFieldIds: edited,
      });
      if (!plan.ready || !plan.sourceSnapshot)
        throw Error("BREED_WORKCOPY_PARSE_INVALID");
      const candidates = workCopyNonblankChangedFields({
        allowed: edited, changed: plan.changed,
        values: plan.sourceSnapshot, accepted: plan.accepted,
      }).filter(field => !skippedSpecial.has(field));
      // If Notion AI replaces a numeric measurement with a sentence, ignore
      // ONLY that edited cell. Keep the previous D1 value and its receipt;
      // unrelated valid fields from the same event still transfer.
      const accepted = candidates.filter(field =>
        isBreedStructuredMeasurement(field, plan.sourceSnapshot[field]));
      const rejectedMeasurements = candidates.filter(field =>
        !isBreedStructuredMeasurement(field, plan.sourceSnapshot[field]));
      const safe = planSafeBreedFields(canonical, {
        latest: plan.sourceSnapshot,
        changed: accepted as BreedNotionField[],
        accepted: accepted as BreedNotionField[],
        conflicts: [] as BreedNotionField[],
        patch: plan.patch,
      }, new Set(), validateNotionBreedCandidate);
      const candidate = {
        ...safe.candidate,
        status: canonical.status,
        image: canonical.image, imageKey: canonical.imageKey,
        gallery: canonical.gallery,
        relatedBreedIds: canonical.relatedBreedIds,
        relatedArticleIds: canonical.relatedArticleIds,
        directoryProfileIds: canonical.directoryProfileIds,
      };
      const changed = accepted.length > 0 &&
        !same(breedFieldSnapshot(canonical), breedFieldSnapshot(candidate));
      const updated = changed
        ? await updateManagedBreed(canonical.id, candidate, actor,
          canonical.updatedAt, { preserveUnchangedInvalid: canonical })
        : canonical;
      if (!updated) throw Error("BREED_WORKCOPY_D1_UPDATE_FAILED");
      const latest = breedFieldSnapshot(updated);
      const next = {
        notion: { ...receipt.notion },
        admin: { ...receipt.admin },
      };
      for (const field of safe.accepted) {
        next.notion[field] = plan.sourceSnapshot[field];
        next.admin[field] = latest[field];
      }
      await advanceReceipt(args.database, link, next);
      if (changed || controlledUpdated) summary.updated++; else summary.unchanged++;
      // Bad or unsupported fields remain pending; unrelated valid fields still
      // commit independently without modifying old Notion or publication.
      if (safe.skipped.length || plan.skipped.length || rejectedMeasurements.length) {
        console.warn("breed_workcopy_fields_pending",{
          id: canonical.id,
          count: safe.skipped.length + plan.skipped.length + rejectedMeasurements.length,
        });
        if (args.manualImport) throw Error("BREED_WORKCOPY_MANUAL_PARTIAL_FIELDS");
      }
    } catch (error) {
      summary.failed++;
      const code = error instanceof Error ? error.message : "BREED_WORKCOPY_UNKNOWN";
      console.error("breed_workcopy_sync_failed", { breedId: link.breed_id, code });
      await args.database.prepare(
        "UPDATE breed_notion_workcopy_links SET work_last_error_code=? "+
        "WHERE breed_id=? AND status='ACTIVE'",
      ).bind(code.slice(0, 100), link.breed_id).run().catch(()=>{});
    }
  }
  return summary;
}

/**
 * Admin -> work-copy: one logical editorial field at a time. Notion has no
 * field CAS, so reread before PATCH and confirm after. Never patch identity,
 * publication, media, or any other property not mapped to the 60-field schema.
 */
export async function writeBackBreedToWorkCopy(input: {
  database: D1Database;
  bindings: BreedWorkCopyBindings;
  before: ManagedBreed;
  breed: ManagedBreed;
  changedFieldKeys?: readonly string[];
  /** Owner-approved one-shot Admin → Notion; keep the existing per-field CAS. */
  forceFieldKeys?: readonly string[];
}) {
  if (!requireWorkCopyOnly(input.bindings))
    return { linked:false, updated:false, reason:"disabled" as const };
  if (input.before.id !== input.breed.id ||
      input.before.slug !== input.breed.slug ||
      input.before.fciNumber !== input.breed.fciNumber)
    throw Error("BREED_WORKCOPY_ADMIN_IDENTITY_CHANGED");
  try {
    await requireActiveCohort(input.database);
  } catch (error) {
    if (error instanceof Error && error.message === "BREED_WORKCOPY_COHORT_NOT_ACTIVE")
      return { linked:false, updated:false, reason:"workcopy-inactive" as const };
    throw error;
  }
  const link = await getActiveLink(input.database, input.breed.id);
  if (!link) return { linked:false, updated:false, reason:"not-linked" as const };
  const receipt = readReceipt(link.work_sync_receipt);
  const actualAdmin = breedFieldSnapshot(input.breed);
  const beforeAdmin = breedFieldSnapshot(input.before);
  const selected = input.forceFieldKeys
    ? [...new Set(input.forceFieldKeys)].filter((field): field is BreedNotionField =>
        BREED_NOTION_EDITABLE_FIELDS.includes(field as BreedNotionField))
    : workCopyAdminChangedFields(
        beforeAdmin, actualAdmin, BREED_NOTION_EDITABLE_FIELDS, input.changedFieldKeys,
      );
  const keys = selected.filter((field): field is BreedNotionField =>
    !skippedSpecial.has(field) && isTransferableBreedWorkCopyValue(actualAdmin[field], true) &&
    isBreedStructuredMeasurement(field, actualAdmin[field]));
  // No record-wide receipt diff: never resend an untouched Admin field.
  if (!keys.length) return {
    linked: true, updated: false, reason: "no-mirrored-field-change" as const,
  };
  const pending:string[] = [];
  const acknowledged:string[] = [];
  for (const field of keys) {
    try {
      let page = await notionRequest<NotionPage>(input.bindings,
        "/pages/" + encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(page, link, input.breed, input.bindings);
      const plan = planBreedWorkCopyFieldWrite({
        schema: BREED_NOTION_SCHEMA,
        page,
        fieldId: field,
        value: actualAdmin[field],
        baseline: receipt.notion[field],
        expectedPageRevision: page.last_edited_time,
      });
      if (plan.changed) {
        page = await notionRequest<NotionPage>(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id));
        assertOwnedPage(page, link, input.breed, input.bindings);
        if (page.last_edited_time !== plan.pageRevision)
          throw Error("BREED_WORKCOPY_WRITE_CONCURRENT_EDIT");
        await notionRequest(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id),{
            method: "PATCH", body: JSON.stringify({ properties:plan.properties }),
          });
      }
      const confirmed = await notionRequest<NotionPage>(input.bindings,
        "/pages/" + encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(confirmed, link, input.breed, input.bindings);
      const recheck = planBreedWorkCopyFieldWrite({
        schema: BREED_NOTION_SCHEMA, page: confirmed,
        fieldId: field, value: actualAdmin[field], baseline: actualAdmin[field],
        expectedPageRevision: confirmed.last_edited_time,
      });
      if (recheck.changed) throw Error("BREED_WORKCOPY_WRITE_NOT_CONFIRMED");
      const next = {
        notion: { ...receipt.notion, [field]:actualAdmin[field] },
        admin: { ...receipt.admin, [field]:actualAdmin[field] },
      };
      await advanceReceipt(input.database, link, next);
      receipt.notion = next.notion;
      receipt.admin = next.admin;
      acknowledged.push(field);
    } catch (error) {
      pending.push(field);
      console.warn("breed_workcopy_field_write_pending",{
        breedId:input.breed.id, field,
        code:error instanceof Error?error.message:"UNKNOWN",
      });
    }
  }
  return {
    linked:true, updated:acknowledged.length>0,
    pendingFields:pending, acknowledgedFields:acknowledged,
  };
}

/** Read-only inspection for the owner-controlled 60+2 manual transfer queue.
 * Uses the SAME ACTIVE link, ownership guard and projection as manualImport.
 * Absent/unsupported fields are reported as skipped, never silently replaced.
 */
export async function inspectManualBreedWorkCopyProfile(input: {
  database: D1Database;
  bindings: BreedWorkCopyBindings;
  profileId: number;
  pageId: string;
}): Promise<{notion:Record<string,unknown>;admin:Record<string,unknown>;excluded:string[]}> {
  if (!requireWorkCopyOnly(input.bindings))
    throw Error("TRANSFER_BREED_WORKCOPY_INACTIVE");
  await requireActiveCohort(input.database);
  const link = await getActiveLink(input.database, input.profileId);
  if (!link || !link.work_sync_receipt ||
      normalized(link.work_notion_page_id) !== normalized(input.pageId))
    throw Error("TRANSFER_BREED_WORKCOPY_LINK_INVALID");
  readReceipt(link.work_sync_receipt);
  const canonical = await getManagedBreed(input.profileId);
  if (!canonical) throw Error("TRANSFER_BREED_NOT_FOUND");
  const page = await notionRequest<NotionPage>(input.bindings,
    "/pages/" + encodeURIComponent(input.pageId));
  assertOwnedPage(page, link, canonical, input.bindings);
  const edited = workCopyChangedEditorialIds(
    page, Object.keys(page.properties??{}), BREED_NOTION_SCHEMA,
  );
  const admin = breedFieldSnapshot(canonical);
  const plan = planBreedWorkCopyEditorialDelta({
    page, canonical, previousNotion:admin, previousAdmin:admin,
    authority:{}, eventFieldIds:edited,
  });
  if (!plan.ready || !plan.sourceSnapshot)
    throw Error("TRANSFER_BREED_WORKCOPY_INSPECTION_INVALID");
  const present = new Set(plan.presentFields);
  const excluded = new Set<string>([...skippedSpecial, ...plan.skipped]);
  const notion = plan.sourceSnapshot as Record<string,unknown>;
  for (const field of BREED_NOTION_EDITABLE_FIELDS) {
    if (!present.has(field) || !isBreedStructuredMeasurement(field, notion[field]))
      excluded.add(field);
  }
  return {notion,admin,excluded:[...excluded]};
}
