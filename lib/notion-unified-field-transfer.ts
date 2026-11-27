import { decideUnifiedField, isConfirmedBlankPush, type FieldIdentity, type FieldObservation, type ScopedFieldEdit, type ProfileAuthorityContext } from "./notion-unified-field-sync.ts";
import { readProfileAuthorityOwner, profileAuthorityEnabled, profileAuthorityTextFieldAllowed, type ProfileAuthorityBindings } from "./notion-profile-authority.ts";
import { readUnifiedFieldState, writeUnifiedFieldState } from "./notion-unified-field-state.ts";

export type FieldReservation = {
  identity: FieldIdentity;
  version: number;
  value: unknown;
  profileAuthority?: true;
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
  authorityBindings?: ProfileAuthorityBindings;
  authorityProperty?: unknown;
}): Promise<FieldReservation | null> {
  const { database, identity } = input;
  const old = await readUnifiedFieldState(database, identity);
  if (profileAuthorityEnabled(input.authorityBindings)) {
    const owner = await readProfileAuthorityOwner(database,identity);
    const authority: ProfileAuthorityContext = {
      owner, fieldAllowed: profileAuthorityTextFieldAllowed(identity),
      notionValidated: isVerifiedAuthorityProperty(input.authorityProperty,input.notion),
    };
    const decision=decideUnifiedField({identity,baseline:null,notion:input.notion,psipedia:input.psipedia,profileAuthority:authority});
    if(old?.status==="PENDING"){
      const age=Date.now()-Date.parse(old.updatedAt);
      if(!Number.isFinite(age)||age<600_000)throw Error("UNIFIED_FIELD_PENDING_RECOVERY");
      // Resolve uncertain earlier writes only from fresh equality. A new
      // observation on a later attempt can then obtain a new pull reservation.
      const equal=decision.action==="unchanged";
      const recovered=await writeUnifiedFieldState(database,identity,old.version,{
        baselineVersion:equal?crypto.randomUUID():old.baselineVersion,
        baseline:equal?decision.value:old.baseline,notion:equal?decision.value:old.notion,psipedia:equal?decision.value:old.psipedia,
        notionEdit:undefined,psipediaEdit:undefined,status:equal?"SYNCED":"REVIEW",
        reason:equal?null:"RECOVERY_DIVERGED",
      });
      if(recovered===null)throw Error("UNIFIED_FIELD_CONCURRENT_RECOVERY");
      if(equal)return null;
      throw Error("UNIFIED_FIELD_RECOVERY_DIVERGED");
    }
    const unchanged=decision.action==="unchanged";
    const allowed=decision.action==="pull"&&input.direction==="pull";
    const reason=unchanged||allowed?null:decision.action==="review"?decision.reason:"NOTION_AUTHORITY_PULL_REQUIRED";
    const version=await writeUnifiedFieldState(database,identity,old?.version??null,{
      baselineVersion:unchanged?crypto.randomUUID():old?.baselineVersion,
      baseline:unchanged?decision.value:old?.baseline,
      notion:input.notion.present?input.notion.value:undefined,
      psipedia:input.psipedia.present?input.psipedia.value:undefined,
      notionEdit:undefined,psipediaEdit:undefined,status:unchanged?"SYNCED":allowed?"PENDING":"REVIEW",reason,
    });
    if(version===null)throw Error("UNIFIED_FIELD_CONCURRENT_RESERVATION");
    if(unchanged||input.direction==="observe")return null;
    if(!allowed)throw Error(reason??"UNIFIED_FIELD_REVIEW");
    return {identity,version,value:decision.value,profileAuthority:true};
  }
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
  if(reservation.profileAuthority && await readProfileAuthorityOwner(database,reservation.identity)!=="notion")
    throw Error("UNIFIED_FIELD_AUTHORITY_CHANGED");
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
  if(reservation.profileAuthority && await readProfileAuthorityOwner(database,reservation.identity)!=="notion")
    throw Error("UNIFIED_FIELD_AUTHORITY_CHANGED");
  const state=await readUnifiedFieldState(database,reservation.identity);
  if(!state||state.version!==reservation.version||state.status!=="PENDING")
    throw Error("UNIFIED_FIELD_RESERVATION_INVALIDATED");
}


/** Independently prove an exact, complete rich-text observation. A decoder
 * fallback, wrong type, partial pagination or missing property is not a clear. */
export function isVerifiedAuthorityText(raw:unknown,observation:FieldObservation):boolean{
  if(!observation.present||typeof observation.value!=="string"||!raw||typeof raw!=="object")return false;
  const prop=raw as Record<string,unknown>;
  if(prop.type!=="rich_text"||prop.has_more===true||!Array.isArray(prop.rich_text)||prop.rich_text.length>=25)return false;
  const parts=prop.rich_text as Array<{plain_text?:unknown;type?:unknown}>;
  if(parts.some(part=>!part||typeof part.plain_text!=="string"||part.type==="mention"))return false;
  const normalize=(value:string)=>value.replace(/\r\n?/g,"\n").trim();
  return normalize(parts.map(part=>part.plain_text).join(""))===normalize(observation.value);
}


/** Verify the raw typed provider cell independently of any adapter fallback.
 * Domain validators still decide whether a value can be stored in D1. */
export function isVerifiedAuthorityProperty(raw:unknown,observed:FieldObservation):boolean{
  if(!observed.present||!raw||typeof raw!=="object")return false;
  const prop=raw as Record<string,unknown>;
  const type=prop.type;
  if(typeof type!=="string"||prop.has_more===true||!Object.hasOwn(prop,type))return false;
  const value=prop[type];
  const text=(v:unknown)=>typeof v==="string"?v.replace(/\r\n?/g,"\n").trim():null;
  if(type==="rich_text")return isVerifiedAuthorityText(raw,observed);
  if(type==="title")return isVerifiedAuthorityText({...prop,type:"rich_text",rich_text:value},observed);
  if(["url","email","phone_number"].includes(type))
    return typeof observed.value==="string"&&(value===null?observed.value==="":typeof value==="string"&&text(value)===text(observed.value));
  if(type==="number")return (value===null||typeof value==="number"&&Number.isFinite(value))&&value===observed.value;
  if(type==="checkbox")return typeof value==="boolean"&&value===observed.value;
  if(type==="select"||type==="status"){
    const label=value&&typeof value==="object"?(value as {name?:unknown}).name:undefined;
    return typeof observed.value==="string"&&(value===null?observed.value==="":typeof label==="string"&&!!label.trim()&&text(label)===text(observed.value));
  }
  if(type==="date"){
    if(value===null)return observed.value===""||observed.value===null;
    const d=value as {start?:unknown;end?:unknown}|undefined;
    return typeof d?.start==="string"&&!d.end&&typeof observed.value==="string"&&
      /^\d{4}-\d{2}-\d{2}$/.test(d.start)&&Number.isFinite(Date.parse(d.start))&&
      new Date(d.start+"T00:00:00Z").toISOString().slice(0,10)===d.start&&d.start===observed.value;
  }
  if(type==="multi_select"){
    if(!Array.isArray(value)||value.length>=25||!Array.isArray(observed.value))return false;
    const names=value.map(item=>item&&typeof item==="object"?(item as {name?:unknown}).name:undefined);
    return names.every(name=>typeof name==="string"&&!!name.trim())&&
      new Set(names).size===names.length&&JSON.stringify(names)===JSON.stringify(observed.value);
  }
  return false;
}
