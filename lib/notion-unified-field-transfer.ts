import { decideUnifiedField, isConfirmedBlankPush, type FieldIdentity, type FieldObservation, type ScopedFieldEdit } from "./notion-unified-field-sync.ts";
import { readUnifiedFieldState, writeUnifiedFieldState } from "./notion-unified-field-state.ts";

export type FieldReservation = {
  identity: FieldIdentity;
  version: number;
  value: unknown;
};

/** Reserve one field before attempting any cross-system write. Existing PENDING
 * rows are deliberately not stolen. Recovery requires an observed-state check,
 * not a repeat of the original mutation (step 10). */
export async function reserveUnifiedField(input: {
  database: D1Database;
  identity: FieldIdentity;
  historicalBaseline: { value: unknown; version: string } | null;
  notion: FieldObservation;
  psipedia: FieldObservation;
  direction: "pull" | "push" | "observe";
  psipediaEdit?: ScopedFieldEdit;
  notionEdit?: ScopedFieldEdit;
}): Promise<FieldReservation | null> {
  const { database, identity } = input;
  const old = await readUnifiedFieldState(database, identity);
  // Observation-only recovery may establish equality or record a conflict;
  // it must never grant permission to mutate canonical or remote content.
  if (old?.status === "PENDING") {
    const age = Date.now() - Date.parse(old.updatedAt);
    if (!Number.isFinite(age) || age < 600_000) throw Error("UNIFIED_FIELD_PENDING_RECOVERY");
    // An expired reservation is not permission to replay a possibly committed
    // mutation. Verify both live values; otherwise preserve evidence for review.
    const recovered = decideUnifiedField({
      identity, baseline: null, notion: input.notion, psipedia: input.psipedia,
    });
    const equal = recovered.action === "unchanged";
    const version = await writeUnifiedFieldState(database, identity, old.version, {
      baselineVersion: equal ? crypto.randomUUID() : old.baselineVersion,
      baseline: equal ? recovered.value : old.baseline,
      notion: equal ? recovered.value : old.notion,
      psipedia: equal ? recovered.value : old.psipedia,
      notionEdit: old.notionEdit, psipediaEdit: old.psipediaEdit,
      status: equal ? "SYNCED" : "REVIEW",
      reason: equal ? null : "RECOVERY_DIVERGED",
    });
    if (version === null) throw Error("UNIFIED_FIELD_CONCURRENT_RECOVERY");
    if (equal) return null;
    throw Error("UNIFIED_FIELD_RECOVERY_DIVERGED");
  }
  if (old?.status === "REVIEW" && old.reason === "RECOVERY_DIVERGED") {
    const observed = decideUnifiedField({ identity, baseline: null, notion: input.notion, psipedia: input.psipedia });
    if (observed.action !== "unchanged") throw Error("UNIFIED_FIELD_RECOVERY_DIVERGED");
  }
  const initialMarker = old?.reason === "INITIAL_FILL_PUSH" || old?.reason === "INITIAL_FILL_PULL";
  const initialCandidate = !input.historicalBaseline && !input.notionEdit && !input.psipediaEdit &&
    (!old || (old.status === "REVIEW" && old.baseline === undefined && !old.baselineVersion &&
      !old.notionEdit && !old.psipediaEdit && (old.reason === "BASELINE_UNAVAILABLE" || (identity.agenda==="breeds"&&identity.field==="sports"&&old.reason==="MISSING_FIELD") || initialMarker)));
  const confirmedMarker = old?.status === "REVIEW" && old.reason === "CONFIRMED_BLANK_PUSH";
  const confirmedCandidate = old?.status === "REVIEW" &&
    (old.reason === "RECOVERY_DIRECTION_REQUIRED" || confirmedMarker) &&
    !!old.baselineVersion && old.baseline !== undefined &&
    !old.notionEdit && !old.psipediaEdit && !input.notionEdit && !input.psipediaEdit;
  const invalidation = ((!old && input.historicalBaseline) || initialCandidate || confirmedCandidate || confirmedMarker) ? await database.prepare(
    "SELECT 1 AS invalidated FROM notion_unified_scope_invalidation WHERE agenda=? AND entity_id=?"
  ).bind(identity.agenda,identity.entityId).first<{invalidated:number}>() : null;
  const baseline = old
    ? old.baseline === undefined ? null : { value: old.baseline, version: old.baselineVersion ?? String(old.version) }
    : invalidation ? null : input.historicalBaseline;
  // The marker is only created by a live observation. A directional call
  // may consume it only for the same two observed values, never an arbitrary
  // new blank, stale receipt, changed mapping or uncertain earlier write.
  const samePair = !!old && input.notion.present && input.psipedia.present &&
    JSON.stringify(old.notion) === JSON.stringify(input.notion.value) &&
    JSON.stringify(old.psipedia) === JSON.stringify(input.psipedia.value);
  const initialReceipt = (initialCandidate || confirmedCandidate) && !invalidation ? await database.prepare(
    "SELECT 1 AS found FROM notion_unified_admin_field_edits WHERE agenda=? AND entity_id=? AND notion_page_id=? AND field_key=? LIMIT 1"
  ).bind(identity.agenda,identity.entityId,identity.pageId,identity.field).first<{found:number}>() : null;
  const initializeEmpty = initialCandidate && !invalidation && !initialReceipt &&
    (initialMarker ? samePair : input.direction === "observe");
  const confirmedBlankReady = confirmedCandidate && !invalidation && !initialReceipt &&
    isConfirmedBlankPush({identity,baseline,notion:input.notion,psipedia:input.psipedia}) &&
    (input.direction === "observe" || (confirmedMarker && samePair));
  const decision = decideUnifiedField({
    identity, baseline, notion: input.notion, psipedia: input.psipedia,
    notionEdit: input.notionEdit, psipediaEdit: input.psipediaEdit, initializeEmpty,
  });
  const notion = input.notion.present ? input.notion.value : undefined;
  const psipedia = input.psipedia.present ? input.psipedia.value : undefined;
  const unchanged = decision.action === "unchanged";
  // A recovery marker authorizes only the exact live pair just observed.
  // If any value, receipt or scope changes, a new observation is required.
  const confirmedBlocked = confirmedMarker && input.direction === "push" && !confirmedBlankReady;
  const allowed = input.direction !== "observe" && decision.action === input.direction && !confirmedBlocked;
  const reason = unchanged || allowed ? null :
    confirmedBlocked ? "CONFIRMED_BLANK_CHANGED" :
    confirmedBlankReady && input.direction === "observe" ? "CONFIRMED_BLANK_PUSH" :
    initialMarker && !samePair ? "INITIAL_FILL_CHANGED" :
    old?.reason === "INITIAL_FILL_CHANGED" && !baseline ? "INITIAL_FILL_CHANGED" :
    initializeEmpty && !baseline && decision.action === "push" ? "INITIAL_FILL_PUSH" :
    initializeEmpty && !baseline && decision.action === "pull" ? "INITIAL_FILL_PULL" :
    decision.action === "review" ? decision.reason : input.direction === "observe" ? "RECOVERY_DIRECTION_REQUIRED" : "OPPOSITE_DIRECTION_REQUIRED";
  const version = await writeUnifiedFieldState(database, identity, old?.version ?? null, {
    baselineVersion: unchanged ? (baseline && decideUnifiedField({identity,baseline:null,notion:{present:true,value:baseline.value},psipedia:{present:true,value:decision.value}}).action === "unchanged" ? baseline.version : crypto.randomUUID()) : baseline?.version,
    baseline: unchanged ? decision.value : baseline?.value,
    notion, psipedia,
    // Evidence is bound to the confirmed baseline generation, not a retry CAS.
    notionEdit: unchanged ? undefined : input.notionEdit,
    psipediaEdit: unchanged ? undefined : input.psipediaEdit,
    status: unchanged ? "SYNCED" : allowed ? "PENDING" : "REVIEW",
    reason,
  });
  if (version === null) throw Error("UNIFIED_FIELD_CONCURRENT_RESERVATION");
  if (unchanged) return null;
  if (input.direction === "observe") return null;
  if (!allowed) throw Error(reason ?? "UNIFIED_FIELD_REVIEW");
  return { identity, version, value: decision.value };
}

/** Only a freshly verified observation of both systems may advance baseline. */
export async function confirmUnifiedField(
  database: D1Database, reservation: FieldReservation,
  notion: FieldObservation, psipedia: FieldObservation,
): Promise<void> {
  const decision = decideUnifiedField({
    identity: reservation.identity,
    baseline: { value: reservation.value, version: String(reservation.version) },
    notion, psipedia,
  });
  const matches = decision.action === "unchanged" &&
    decideUnifiedField({
      identity: reservation.identity, baseline: null,
      notion: { present: true, value: reservation.value },
      psipedia: { present: true, value: decision.value },
    }).action === "unchanged";
  if (!matches) throw Error("UNIFIED_FIELD_WRITEBACK_UNVERIFIED");
  const version = await writeUnifiedFieldState(database, reservation.identity, reservation.version, {
    baselineVersion: crypto.randomUUID(),
    baseline: reservation.value, notion: reservation.value, psipedia: reservation.value,
    notionEdit: undefined, psipediaEdit: undefined, status: "SYNCED", reason: null,
  });
  if (version === null) throw Error("UNIFIED_FIELD_CONCURRENT_CONFIRMATION");
}

/** Recheck the actual reservation immediately before external side effects.
 * The provider has no CAS; this reduces, but cannot eliminate, that gap. */
export async function assertUnifiedReservationCurrent(database:D1Database,reservation:FieldReservation){
  const state=await readUnifiedFieldState(database,reservation.identity);
  if(!state||state.version!==reservation.version||state.status!=="PENDING")
    throw Error("UNIFIED_FIELD_RESERVATION_INVALIDATED");
}
