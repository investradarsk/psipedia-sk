import { isLegacyBreedDuplicate } from "./notion-breed-legacy-duplicates.mjs";
import { readUnifiedFieldState, writeUnifiedFieldState } from "./notion-unified-field-state.ts";
import { reserveUnifiedField, confirmUnifiedField, assertUnifiedReservationCurrent } from "./notion-unified-field-transfer.ts";
import { readUnifiedAdminEdit } from "./notion-unified-admin-edits.ts";
import { breedWorkcopyObservation, isUnifiedBreedEditorialField } from "./notion-breed-unified-policy.ts";
import { assertManualRemoteIdentity } from "./notion-manual-transfer-mapping";
/**
 * Notion 74-property breed work-copy sync, mutually exclusive with the old
 * source. A signed Notion page with an ACTIVE link and matching numeric
 * Psipedia ID is enough for independent field updates.
 *
 * No creation or deletion of breeds, no changes to canonical publication.
 * Real FCI, media and structured fields are editable with type-safe storage;
 * invalid siblings never lock otherwise valid fields.
 */
import {
  getManagedBreed,
  type ManagedBreed,
} from "@/lib/breed-store";
import {
  notionRequest, notionFlagEnabled, notionRichTextProperty, notionNumberProperty,
  type NotionPage, type NotionSyncBindings,
} from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import { notionPageIsTombstoned } from "@/lib/admin-record-lifecycle";
import {
  breedFieldSnapshot, parseBreedFieldSnapshot,
  BREED_NOTION_EDITABLE_FIELDS, type BreedFieldSnapshot,
  type BreedNotionField,
} from "@/lib/notion-breed-field-delta";
import { planBreedWorkCopyEditorialDelta } from "@/lib/notion-breed-workcopy-delta";
import { planBreedWorkCopyFieldWrite } from "@/lib/notion-breed-workcopy-patch-bridge.mjs";
import { BREED_NOTION_SCHEMA } from "@/lib/notion-breed-property-registry";
import { isTransferableBreedWorkCopyValue } from "@/lib/notion-breed-workcopy-value.mjs";
import { receiveBreedControlledNotionEdit } from "@/lib/notion-breed-workcopy-controlled";
import { breedWorkcopyEventValues } from "@/lib/notion-breed-workcopy-field-values.mjs";
import { saveBreedNotionField } from "@/lib/notion-breed-workcopy-direct-field";
import {
  workCopyAdminChangedFields, workCopyChangedEditorialIds,
} from "@/lib/notion-breed-workcopy-field-events.mjs";

export type BreedWorkCopyBindings = NotionSyncBindings & {
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?: string;
  NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string;
};

type ShadowLink = {
  breed_id: number; original_notion_page_id: string;
  work_notion_page_id: string;
  original_data_source_id: string; work_data_source_id: string;
  canonical_slug: string; fci_number: number;
  status: string; work_sync_receipt: string | null;
};
type WorkReceipt = { notion: BreedFieldSnapshot; admin: BreedFieldSnapshot };
const skippedSpecial = new Set<string>([
  // Only virtual aggregates and relationships without real Notion columns.
  "accent", "fciStandard", "editorial", "relatedBreedIds",
  "relatedArticleIds", "directoryProfileIds",
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

function readReceipt(value: string | null, canonical: ManagedBreed): WorkReceipt {
  // Receipts are for deduplication, not a second form of identity. Missing or
  // historical malformed receipts must not lock an otherwise ID-matched breed.
  const fallback = () => {
    const current = breedFieldSnapshot(canonical);
    return { notion: { ...current }, admin: { ...current } };
  };
  if (!value?.startsWith("breed-field-v1:")) return fallback();
  try {
    const encoded = JSON.parse(value.slice("breed-field-v1:".length));
    const notion = parseBreedFieldSnapshot(encoded.notion ?? null);
    const admin = parseBreedFieldSnapshot(encoded.admin ?? null);
    return notion && admin ? { notion, admin } : fallback();
  } catch {
    return fallback();
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
  // Page/source ownership prevents cross-database writes. The ONLY breed
  // matching key is the immutable Admin / Psipedia numeric ID. Every other
  // Notion value (including name, FCI, slug-adjacent text and provenance) is
  // ordinary editorial data, never a prerequisite for changing a field.
  if (normalized(page.id) !== normalized(link.work_notion_page_id) ||
      !notionPageBelongsToDataSource(page, source) ||
      notionRichTextProperty(page, "Psipedia ID") !== String(breed.id) ||
      link.breed_id !== breed.id) {
    throw Error("BREED_WORKCOPY_ID_MISMATCH");
  }
}

async function getActiveLink(database: D1Database, breedId: number) {
  return database.prepare(
    "SELECT * FROM breed_notion_workcopy_links "+
    "WHERE breed_id=? AND status='ACTIVE' LIMIT 1",
  ).bind(breedId).first<ShadowLink>();
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
    "AND status='ACTIVE' AND work_sync_receipt IS ?",
  ).bind(next, now, now, link.breed_id, link.work_notion_page_id,
    link.work_sync_receipt).run();
  if (result.meta.changes !== 1)
    throw Error("BREED_WORKCOPY_RECEIPT_CAS_CHANGED");
  link.work_sync_receipt = next;
}

function unifiedBreedEnabled(bindings: BreedWorkCopyBindings) {
  return bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
}

async function observeUnifiedBreedField(database: D1Database, bindings: BreedWorkCopyBindings,
  link: ShadowLink, field: string) {
  const before = await getManagedBreed(link.breed_id);
  const liveLink = await getActiveLink(database, link.breed_id);
  if (!before || !liveLink || liveLink.work_notion_page_id !== link.work_notion_page_id ||
      await notionPageIsTombstoned(database, link.work_notion_page_id))
    throw Error("BREED_UNIFIED_MAPPING_CHANGED");
  const page = await notionRequest<NotionPage>(bindings,
    "/pages/" + encodeURIComponent(link.work_notion_page_id));
  assertOwnedPage(page, liveLink, before, bindings);
  const after = await getManagedBreed(link.breed_id);
  if (!after || after.updatedAt !== before.updatedAt)
    throw Error("BREED_UNIFIED_REVISION_CHANGED");
  const parsed = breedWorkcopyEventValues(page, Object.keys(page.properties ?? {}), BREED_NOTION_SCHEMA, true);
  const remote = parsed.values.find(item => item.field === field);
  const snapshot = breedFieldSnapshot(after) as Record<string, unknown>;
  const value = field === "fciNumber" ? after.fciNumber : snapshot[field];
  return { page, revision: after.updatedAt, snapshot: {...snapshot,workingTrial:after.workingTrial,validStandardDate:after.validStandardDate}, 
    notionSiblings:Object.fromEntries(parsed.values.map(item=>[item.field,item.value])),
    notion: breedWorkcopyObservation(remote?.value, !!remote),
    psipedia: breedWorkcopyObservation(value, field === "fciNumber" || Object.hasOwn(snapshot, field)),
  };
}

async function reserveBreedField(database: D1Database, bindings: BreedWorkCopyBindings,
  link: ShadowLink, field: string, direction: "pull" | "push" | "observe") {
  if (!isUnifiedBreedEditorialField(field)) throw Error("BREED_UNIFIED_PROTECTED_FIELD");
  const observed = await observeUnifiedBreedField(database, bindings, link, field);
  const identity = { agenda: "breeds" as const, entityId: String(link.breed_id),
    pageId: link.work_notion_page_id, field };
  const receipt = await readUnifiedAdminEdit(database, identity, observed.revision);
  const reservation = await reserveUnifiedField({ database, identity, authorityBindings: bindings,
    authorityProperty: observed.page.properties?.[BREED_NOTION_SCHEMA.find(entry=>entry.id===field)?.notion ?? ""], historicalBaseline: null,
    notion: observed.notion, psipedia: observed.psipedia, psipediaEdit: receipt, direction });
  return { ...observed, reservation };
}

/** Import independent, previously edited Notion cells into D1. */
export async function runNotionBreedWorkCopySyncSweep(args: {
  database: D1Database;
  bindings: BreedWorkCopyBindings;
  targetPageId?: string;
  changedPropertyIds?: readonly string[];
  /** Owner-clicked import of only the already-linked work-copy breed. */
  manualImport?: boolean;
}) {
  if (args.manualImport && (!args.targetPageId || args.changedPropertyIds?.length))
    throw Error("BREED_WORKCOPY_MANUAL_SCOPE_INVALID");
  const summary={
    enabled:notionFlagEnabled(args.bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED),
    scanned:0,notionScanned:0,created:0,updated:0,unchanged:0,failed:0,
  };
  if (!requireWorkCopyOnly(args.bindings)) return summary;
  // Never reconcile 344 records from a stale hash or rewrite an entire profile.
  // Only the signed edited property IDs, or explicit one-profile import, apply.
  if (!args.targetPageId || (!args.manualImport && !args.changedPropertyIds?.length))
    return summary;
  const result=await args.database.prepare(
    // Notion sends dashed UUIDs; historical ACTIVE links store compact UUIDs.
    // Treat them as the SAME page before looking up the individual field edit.
    "SELECT * FROM breed_notion_workcopy_links WHERE status='ACTIVE' "+
    "AND replace(lower(work_notion_page_id),'-','')=? LIMIT 1",
  ).bind(normalized(args.targetPageId)).all<ShadowLink>();
  for (const link of result.results) {
    if (await notionPageIsTombstoned(args.database,link.work_notion_page_id)) {
      summary.unchanged++; continue;
    }
    summary.scanned++;
    summary.notionScanned++;
    const failedFields:string[]=[];
    let updated=false;
    try {
      const breed=await getManagedBreed(link.breed_id);
      if (!breed) throw Error("BREED_EVENT_PROFILE_MISSING");
      const page=await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(page,link,breed,args.bindings);
      const edited=args.manualImport
        ?Object.keys(page.properties??{}) : [...(args.changedPropertyIds??[])];
      try {
        const controlled=await receiveBreedControlledNotionEdit({
          database:args.database,bindings:args.bindings,breedId:link.breed_id,
          page,changedProperties:edited,
        });
        if (controlled.updated) updated=true;
        failedFields.push(...controlled.invalidKeys.map(key=>"controlled."+key));
      } catch(error) {
        console.error("breed_workcopy_controlled_field_failed",{
          breedId:link.breed_id,
          code:error instanceof Error?error.message:"UNKNOWN",
        });
        failedFields.push("controlled");
      }
      const parsed=unifiedBreedEnabled(args.bindings) && !args.manualImport
        ? breedWorkcopyEventValues(page,edited,BREED_NOTION_SCHEMA,true)
        : breedWorkcopyEventValues(page,edited,BREED_NOTION_SCHEMA);
      failedFields.push(...parsed.failures.map(item=>item.field));
      for (const field of parsed.values) {
        try {
          const pilot = unifiedBreedEnabled(args.bindings) && !args.manualImport
            ? await reserveBreedField(args.database, args.bindings, link, field.field, "pull") : null;
          if (pilot && !pilot.reservation) continue;
          const saved=await saveBreedNotionField({
            database:args.database,breedId:link.breed_id,
            field:field.field,value:pilot?.reservation ? pilot.reservation.value : field.value,
            expectedRevision: pilot?.revision,
          });
          if (pilot?.reservation) {
            const fresh = await observeUnifiedBreedField(args.database, args.bindings, link, field.field);
            await confirmUnifiedField(args.database, pilot.reservation, fresh.notion, fresh.psipedia);
          }
          if (saved.updated) {
            updated=true;
            console.info("breed_workcopy_field_applied",{
              breedId:link.breed_id,field:field.field,
            });
          }
        } catch(error) {
          failedFields.push(field.field);
          console.error("breed_workcopy_field_failed",{
            breedId:link.breed_id,field:field.field,
            code:error instanceof Error?error.message:"UNKNOWN",
          });
        }
      }
      // Equivalent to breeders' per-field acknowledgement: failed cells remain
      // retryable and the successful D1 field writes are NOT rolled back.
      const first=failedFields[0]??null;
      await args.database.prepare(
        "UPDATE breed_notion_workcopy_links SET work_last_error_code=? "+
        "WHERE breed_id=? AND work_notion_page_id=? AND status='ACTIVE'",
      ).bind(first?("FIELD:"+first).slice(0,100):null,
        link.breed_id,link.work_notion_page_id).run();
      if (failedFields.length) summary.failed++;
      if (updated) summary.updated++; else summary.unchanged++;
    } catch(error) {
      summary.failed++;
      console.error("breed_workcopy_sync_failed",{
        breedId:link.breed_id,code:error instanceof Error?error.message:"UNKNOWN",
      });
      await args.database.prepare(
        "UPDATE breed_notion_workcopy_links SET work_last_error_code=? "+
        "WHERE breed_id=? AND status='ACTIVE'",
      ).bind((error instanceof Error?error.message:"UNKNOWN").slice(0,100),
        link.breed_id).run().catch(()=>{});
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
  /** Internal recovery only; never owner-force or synthesize a before value. */
  retryFieldKeys?: readonly string[];
}) {
  if (!requireWorkCopyOnly(input.bindings))
    return { linked:false, updated:false, reason:"disabled" as const };
  if (input.before.id !== input.breed.id)
    throw Error("BREED_WORKCOPY_ADMIN_ID_MISMATCH");
  const link = await getActiveLink(input.database, input.breed.id);
  if (!link) return { linked:false, updated:false, reason:"not-linked" as const };
  const receipt = readReceipt(link.work_sync_receipt, input.before);
  const actualAdmin = breedFieldSnapshot(input.breed);
  const beforeAdmin = breedFieldSnapshot(input.before);
  if(input.retryFieldKeys&&(!unifiedBreedEnabled(input.bindings)||input.forceFieldKeys))throw Error("BREED_V2_RETRY_SCOPE");
  const selected = input.retryFieldKeys
    ? [...new Set(input.retryFieldKeys)].filter((field): field is BreedNotionField=>BREED_NOTION_EDITABLE_FIELDS.includes(field as BreedNotionField))
    : input.forceFieldKeys
    ? [...new Set(input.forceFieldKeys)].filter((field): field is BreedNotionField =>
        BREED_NOTION_EDITABLE_FIELDS.includes(field as BreedNotionField))
    : workCopyAdminChangedFields(
        beforeAdmin, actualAdmin, BREED_NOTION_EDITABLE_FIELDS, input.changedFieldKeys,
      );
  const keys = selected.filter((field): field is BreedNotionField =>
    !skippedSpecial.has(field) && isTransferableBreedWorkCopyValue(actualAdmin[field], true));
  const fciChanged = input.retryFieldKeys?.includes("fciNumber") || input.before.fciNumber !== input.breed.fciNumber &&
    (!input.changedFieldKeys || input.changedFieldKeys.includes("fciNumber") ||
      input.forceFieldKeys?.includes("fciNumber"));
  // No record-wide receipt diff: never resend an untouched Admin field.
  if (!keys.length && !fciChanged) return {
    linked: true, updated: false, reason: "no-mirrored-field-change" as const,
  };
  const pending:string[] = [];
  const acknowledged:string[] = [];
  for (const field of keys) {
    try {
      const pilot = unifiedBreedEnabled(input.bindings) && !input.forceFieldKeys
        ? await reserveBreedField(input.database, input.bindings, link, field, "push") : null;
      if (pilot && !pilot.reservation) { acknowledged.push(field); continue; }
      let page = pilot?.page ?? await notionRequest<NotionPage>(input.bindings,
        "/pages/" + encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(page, link, input.breed, input.bindings);
      const intended = pilot?.reservation ? pilot.reservation.value : actualAdmin[field];
      const plan = planBreedWorkCopyFieldWrite({
        schema: BREED_NOTION_SCHEMA,
        page,
        fieldId: field,
        value: intended,
        baseline: receipt.notion[field],
        allowCurrentRemote: true,
        expectedPageRevision: page.last_edited_time,
      });
      if (plan.changed) {
        page = await notionRequest<NotionPage>(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id));
        assertOwnedPage(page, link, input.breed, input.bindings);
        if (page.last_edited_time !== plan.pageRevision)
          throw Error("BREED_WORKCOPY_WRITE_CONCURRENT_EDIT");
        if (pilot) {
          const current = await getManagedBreed(link.breed_id);
          const currentLink = await getActiveLink(input.database, link.breed_id);
          if (!current || current.updatedAt !== pilot.revision || currentLink?.work_notion_page_id !== link.work_notion_page_id ||
              await notionPageIsTombstoned(input.database, link.work_notion_page_id))
            throw Error("BREED_UNIFIED_REVISION_CHANGED");
        }
        if(pilot?.reservation)await assertUnifiedReservationCurrent(input.database,pilot.reservation);
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
        fieldId: field, value: intended, baseline: intended,
        allowCurrentRemote: true,
        expectedPageRevision: confirmed.last_edited_time,
      });
      if (recheck.changed) throw Error("BREED_WORKCOPY_WRITE_NOT_CONFIRMED");
      if (pilot?.reservation) {
        const fresh = await observeUnifiedBreedField(input.database, input.bindings, link, field);
        await confirmUnifiedField(input.database, pilot.reservation, fresh.notion, fresh.psipedia);
      }
      const next = {
        notion: { ...receipt.notion, [field]:intended },
        admin: { ...receipt.admin, [field]:intended },
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
  if (fciChanged) {
    try {
      const pilot = unifiedBreedEnabled(input.bindings) && !input.forceFieldKeys
        ? await reserveBreedField(input.database, input.bindings, link, "fciNumber", "push") : null;
      if (pilot && !pilot.reservation) return { linked:true, updated:acknowledged.length>0,
        pendingFields:pending, acknowledgedFields:[...acknowledged,"fciNumber"] };
      const number = input.breed.fciNumber;
      if (pilot?.reservation && pilot.reservation.value !== number) throw Error("BREED_UNIFIED_REVISION_CHANGED");
      let page = await notionRequest<NotionPage>(input.bindings,
        "/pages/" + encodeURIComponent(link.work_notion_page_id));
      assertOwnedPage(page, link, input.breed, input.bindings);
      if (notionNumberProperty(page, "FCI číslo") !== number) {
        const fresh = await notionRequest<NotionPage>(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id));
        assertOwnedPage(fresh, link, input.breed, input.bindings);
        if (fresh.last_edited_time !== page.last_edited_time)
          throw Error("BREED_WORKCOPY_FCI_CONCURRENT_EDIT");
        if (pilot) {
          const current = await getManagedBreed(link.breed_id);
          const active = await getActiveLink(input.database, link.breed_id);
          if (!current || current.updatedAt !== pilot.revision || active?.work_notion_page_id !== link.work_notion_page_id ||
              await notionPageIsTombstoned(input.database, link.work_notion_page_id))
            throw Error("BREED_UNIFIED_REVISION_CHANGED");
        }
        if(pilot?.reservation)await assertUnifiedReservationCurrent(input.database,pilot.reservation);
        await notionRequest(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id),{
            method:"PATCH",body:JSON.stringify({properties:{
              "FCI číslo":{number},
            }}),
          });
        page = await notionRequest<NotionPage>(input.bindings,
          "/pages/" + encodeURIComponent(link.work_notion_page_id));
        assertOwnedPage(page, link, input.breed, input.bindings);
      }
      if (notionNumberProperty(page,"FCI číslo") !== number)
        throw Error("BREED_WORKCOPY_FCI_NOT_CONFIRMED");
      if (pilot?.reservation) {
        const fresh = await observeUnifiedBreedField(input.database, input.bindings, link, "fciNumber");
        await confirmUnifiedField(input.database, pilot.reservation, fresh.notion, fresh.psipedia);
      }
      acknowledged.push("fciNumber");
    } catch (error) {
      pending.push("fciNumber");
      console.warn("breed_workcopy_field_write_pending",{
        breedId:input.breed.id,field:"fciNumber",
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
  const link = await getActiveLink(input.database, input.profileId);
  if (!link || normalized(link.work_notion_page_id) !== normalized(input.pageId))
    throw Error("TRANSFER_BREED_WORKCOPY_LINK_INVALID");
  const canonical = await getManagedBreed(input.profileId);
  if (!canonical) throw Error("TRANSFER_BREED_NOT_FOUND");
  readReceipt(link.work_sync_receipt, canonical);
  const page = await notionRequest<NotionPage>(input.bindings,
    "/pages/" + encodeURIComponent(input.pageId));
  assertManualRemoteIdentity({
    page, pageId: input.pageId, profileId: input.profileId,
    belongsToSource: notionPageBelongsToDataSource(page,input.bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID??""),
    claimedId: notionRichTextProperty(page,"Psipedia ID"),
  });
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
    if (!present.has(field)) excluded.add(field);
  }
  return {notion,admin,excluded:[...excluded]};
}

/** Repair only a proven historical concatenation, on an existing REVIEW row
 * without baseline, receipts or invalidation. A failed write remains PENDING
 * for ordinary observed-state recovery, never blind replay. */
async function repairLegacyBreedDuplicate(database:D1Database,bindings:BreedWorkCopyBindings,link:ShadowLink,field:string){
  const identity={agenda:"breeds" as const,entityId:String(link.breed_id),pageId:link.work_notion_page_id,field};
  const old=await readUnifiedFieldState(database,identity);
  if(!old||old.status!=="REVIEW"||old.reason!=="BASELINE_UNAVAILABLE"||old.baseline!==undefined||old.baselineVersion||old.notionEdit||old.psipediaEdit)return false;
  const guarded=async()=>{
    const invalid=await database.prepare("SELECT 1 AS n FROM notion_unified_scope_invalidation WHERE agenda=? AND entity_id=?").bind(identity.agenda,identity.entityId).first();
    const receipt=await database.prepare("SELECT 1 AS n FROM notion_unified_admin_field_edits WHERE agenda=? AND entity_id=? AND notion_page_id=? AND field_key=?").bind(identity.agenda,identity.entityId,identity.pageId,field).first();
    const current=await getActiveLink(database,link.breed_id);
    return !invalid&&!receipt&&current?.work_notion_page_id===link.work_notion_page_id&&!(await notionPageIsTombstoned(database,link.work_notion_page_id));
  };
  if(!await guarded())return false;
  const live=await observeUnifiedBreedField(database,bindings,link,field);
  if(!live.notion.present||!live.psipedia.present||
    JSON.stringify(old.notion)!==JSON.stringify(live.notion.value)||JSON.stringify(old.psipedia)!==JSON.stringify(live.psipedia.value)||
    !isLegacyBreedDuplicate(field,live.notion.value,live.psipedia.value,live.snapshot,live.notionSiblings))return false;
  const plan=planBreedWorkCopyFieldWrite({schema:BREED_NOTION_SCHEMA,page:live.page,fieldId:field,value:live.psipedia.value,baseline:live.notion.value,allowCurrentRemote:false,expectedPageRevision:live.page.last_edited_time});
  if(!plan.changed)return false;
  const version=await writeUnifiedFieldState(database,identity,old.version,{baselineVersion:undefined,baseline:undefined,notion:live.notion.value,psipedia:live.psipedia.value,notionEdit:undefined,psipediaEdit:undefined,status:"PENDING",reason:null});
  if(version===null)throw Error("BREED_LEGACY_DUPLICATE_RESERVATION_CHANGED");
  const reservation={identity,version,value:live.psipedia.value};
  const fresh=await observeUnifiedBreedField(database,bindings,link,field);
  if(fresh.revision!==live.revision||fresh.page.last_edited_time!==plan.pageRevision||
    !fresh.notion.present||!fresh.psipedia.present||
    fresh.notion.value!==live.notion.value||fresh.psipedia.value!==live.psipedia.value||
    !isLegacyBreedDuplicate(field,fresh.notion.value,fresh.psipedia.value,fresh.snapshot,fresh.notionSiblings)||!await guarded())
    throw Error("BREED_LEGACY_DUPLICATE_CHANGED");
  await assertUnifiedReservationCurrent(database,reservation);
  await notionRequest(bindings,"/pages/"+encodeURIComponent(link.work_notion_page_id),{method:"PATCH",body:JSON.stringify({properties:plan.properties})});
  const verified=await observeUnifiedBreedField(database,bindings,link,field);
  await confirmUnifiedField(database,reservation,verified.notion,verified.psipedia);
  return true;
}

export async function recoverBreedV2Field(database:D1Database,bindings:BreedWorkCopyBindings,id:number,pageId:string,field:string,direction:"observe"|"pull"="observe"){
  if(!unifiedBreedEnabled(bindings)||!requireWorkCopyOnly(bindings))throw Error("BREED_V2_RECOVERY_DISABLED");
  const link=await getActiveLink(database,id);
  if(!link||link.work_notion_page_id!==pageId)throw Error("BREED_V2_RECOVERY_SCOPE");
  if(!BREED_NOTION_EDITABLE_FIELDS.includes(field as BreedNotionField)&&field!=="fciNumber")throw Error("BREED_V2_RECOVERY_SCOPE");
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"&&direction==="observe"&&await repairLegacyBreedDuplicate(database,bindings,link,field))return;
  const planned=await reserveBreedField(database,bindings,link,field,direction);
  if(direction==="pull"&&planned.reservation){
    const fresh=await observeUnifiedBreedField(database,bindings,link,field);
    if(fresh.revision!==planned.revision||JSON.stringify(fresh.notion)!==JSON.stringify(planned.notion))throw Error("BREED_UNIFIED_REVISION_CHANGED");
    await assertUnifiedReservationCurrent(database,planned.reservation);
    await saveBreedNotionField({database,breedId:id,field,value:planned.reservation.value,expectedRevision:planned.revision});
    const verified=await observeUnifiedBreedField(database,bindings,link,field);
    await confirmUnifiedField(database,planned.reservation,verified.notion,verified.psipedia);
  }
}

export function breedV2RecoveryFields():string[]{
  return [...new Set([...BREED_NOTION_EDITABLE_FIELDS.filter(isUnifiedBreedEditorialField),"fciNumber"])].sort();
}

export async function retryBreedV2AdminField(database:D1Database,bindings:BreedWorkCopyBindings,id:number,pageId:string,field:string){
  if(!unifiedBreedEnabled(bindings)||!requireWorkCopyOnly(bindings))throw Error("BREED_V2_RETRY_DISABLED");
  const link=await getActiveLink(database,id),breed=await getManagedBreed(id);
  if(!link||link.work_notion_page_id!==pageId||!breed||!isUnifiedBreedEditorialField(field))throw Error("BREED_V2_RETRY_SCOPE");
  const result=await writeBackBreedToWorkCopy({database,bindings,before:breed,breed,retryFieldKeys:[field]});
  return Boolean(result.linked&&result.acknowledgedFields?.includes(field));
}
