import { decideUnifiedField, type FieldIdentity, type FieldObservation, type ScopedFieldEdit } from "./notion-unified-field-sync.ts";
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
  const invalidation = !old && input.historicalBaseline ? await database.prepare(
    "SELECT 1 AS invalidated FROM notion_unified_scope_invalidation WHERE agenda=? AND entity_id=?"
  ).bind(identity.agenda,identity.entityId).first<{invalidated:number}>() : null;
  const baseline = old
    ? old.baseline === undefined ? null : { value: old.baseline, version: old.baselineVersion ?? String(old.version) }
    : invalidation ? null : input.historicalBaseline;
  const decision = decideUnifiedField({
    identity, baseline, notion: input.notion, psipedia: input.psipedia,
    notionEdit: input.notionEdit, psipediaEdit: input.psipediaEdit,
  });
  const notion = input.notion.present ? input.notion.value : undefined;
  const psipedia = input.psipedia.present ? input.psipedia.value : undefined;
  const unchanged = decision.action === "unchanged";
  const allowed = input.direction !== "observe" && decision.action === input.direction;
  const reason = unchanged || allowed ? null :
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
  if (!allowed || decision.action === "review") throw Error(reason ?? "UNIFIED_FIELD_REVIEW");
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
