import {
  reconcileProfileFields,
  type VerifiedFieldEdit,
} from "./notion-profile-field-reconciliation.ts";

export const UNIFIED_SYNC_AGENDAS = [
  "directory", "breeds", "events", "organizations", "adoptions",
  "lost-found", "help-cases", "eshops",
] as const;
export type UnifiedSyncAgenda = (typeof UNIFIED_SYNC_AGENDAS)[number];

export type FieldIdentity = {
  agenda: UnifiedSyncAgenda;
  entityId: string;
  pageId: string;
  field: string;
};

/** Produced only by an authenticated adapter which can prove the exact value
 * at edit time. A webhook ID plus a later GET is NOT such proof. */
export type ScopedFieldEdit = VerifiedFieldEdit & {
  identity: FieldIdentity;
  source: "notion" | "psipedia";
  baselineVersion: string;
  explicitClear?: boolean;
};
export type FieldObservation =
  | { present: false }
  | { present: true; value: unknown };
/** Explicit, trusted adapter context for the new profile-ownership policy.
 * Never construct this from a Notion property or an unvalidated request.
 * Omission keeps the existing V2 policy until the adapter is migrated.
 * Articles are deliberately outside UnifiedSyncAgenda.
 */
export type ProfileAuthorityContext = {
  owner: "notion" | "admin" | "partner" | "unlocking";
  /** This exact field is mapped and allowed to flow Notion -> D1. */
  fieldAllowed: boolean;
  /** Present, complete provider value was decoded and validated for this field.
   * A failed read, omitted property, incomplete pagination or invalid value
   * must never be reported as a validated blank.
   */
  notionValidated: boolean;
};

export type UnifiedFieldDecision =
  | { action: "unchanged" | "pull" | "push"; value: unknown }
  | { action: "review"; reason: string };

function sameIdentity(a: FieldIdentity, b: FieldIdentity) {
  return a.agenda === b.agenda && a.entityId === b.entityId &&
    a.pageId === b.pageId && a.field === b.field;
}

function same(a: unknown, b: unknown): boolean {
  // Reuse the established reconciliation equality with an atomic array wrapper:
  // nested objects are one logical field, not an accidental set of subfields.
  return reconcileProfileFields({
    baseline: { value: [a] }, notion: { value: [a] },
    psipedia: { value: [b] }, protectedFields: new Set(),
    changedSideWins: true,
  }).kind === "UNCHANGED";
}

function blank(value: unknown) {
  return value == null || (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);
}

/** A confirmed blank target is not an inferred clear. Only fill supported,
 * present values; the normal three-way decision must independently agree. */
export function isConfirmedBlankPush(input: {
  identity: FieldIdentity;
  baseline: {value:unknown;version:string} | null;
  notion: FieldObservation;
  psipedia: FieldObservation;
}): boolean {
  if (!input.baseline?.version || !input.notion.present || !input.psipedia.present ||
      input.baseline.value === undefined || input.notion.value === undefined ||
      !blank(input.baseline.value) || !blank(input.notion.value) ||
      !same(input.baseline.value,input.notion.value)) return false;
  const value = input.psipedia.value;
  const filled = (typeof value === "string" && !!value.trim()) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean" || (Array.isArray(value) && value.length > 0);
  return filled && decideUnifiedField(input).action === "push";
}

function verified(
  edit: ScopedFieldEdit | undefined, identity: FieldIdentity,
  source: ScopedFieldEdit["source"], baselineVersion: string, value: unknown,
): ScopedFieldEdit | undefined {
  if (!edit || !sameIdentity(edit.identity, identity) || edit.source !== source ||
      edit.baselineVersion !== baselineVersion || !same(edit.value, value)) return;
  const t = Date.parse(edit.observedAt);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== edit.observedAt ||
      typeof edit.editId !== "string" || !edit.editId.trim()) return;
  return edit;
}

/** Pure shared decision engine. All authorization, schema validation and
 * persistence remain with the adapter. Unknown observations never mean clear. */
export function decideUnifiedField(input: {
  identity: FieldIdentity;
  baseline: { value: unknown; version: string } | null;
  notion: FieldObservation;
  psipedia: FieldObservation;
  notionEdit?: ScopedFieldEdit;
  psipediaEdit?: ScopedFieldEdit;
  locked?: boolean;
  protected?: boolean;
  /** Opt-in only after lock, identity and field mapping checks in the adapter. */
  profileAuthority?: ProfileAuthorityContext;
  /** Explicit initialization only; never an inferred historical edit. */
  initializeEmpty?: boolean;
}): UnifiedFieldDecision {
  const review = (reason: string): UnifiedFieldDecision => ({ action: "review", reason });
  if (input.locked) return review("LOCKED");
  if (input.protected) return review("PROTECTED_FIELD");
  if (!input.notion.present || !input.psipedia.present ||
      input.notion.value === undefined || input.psipedia.value === undefined)
    return review("MISSING_FIELD");
  // The owner is chosen from canonical D1 lifecycle state, not timestamps.
  // Check eligibility and validation even if observations happen to match.
  if (input.profileAuthority !== undefined) {
    const authority = input.profileAuthority;
    if (authority.owner !== "notion") return review("LOCKED");
    if (authority.fieldAllowed !== true) return review("PROTECTED_FIELD");
    if (authority.notionValidated !== true) return review("INVALID_NOTION_FIELD");
    const n = input.notion.value, p = input.psipedia.value;
    // A validated blank is authoritative, just like false, zero or a list.
    // No normal profile-content push is permitted in this mode.
    return same(n, p) ? { action: "unchanged", value: p } : { action: "pull", value: n };
  }
  const n = input.notion.value, p = input.psipedia.value;
  if (same(n, p)) return { action: "unchanged", value: p };
  if (!input.baseline || input.baseline.value === undefined || !input.baseline.version) {
    if (input.initializeEmpty && !input.baseline && !input.notionEdit && !input.psipediaEdit) {
      // Explicit observed blanks only. Zero and false are legitimate values.
      const filled = (value: unknown) =>
        (typeof value === "string" && !!value.trim()) ||
        (typeof value === "number" && Number.isFinite(value)) ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.length > 0);
      if (blank(n) && filled(p)) return { action: "push", value: p };
      if (blank(p) && filled(n)) return { action: "pull", value: n };
    }
    return review("BASELINE_UNAVAILABLE");
  }

  const base = input.baseline.value;
  const ne = verified(input.notionEdit, input.identity, "notion", input.baseline.version, n);
  const pe = verified(input.psipediaEdit, input.identity, "psipedia", input.baseline.version, p);
  // Legacy V2 only: a blank Notion field is not an authorized clear.
  if (blank(n) && !blank(p) && !same(n, base)) return review("UNVERIFIED_NOTION_CLEAR");
  if (blank(p) && !blank(n) && !same(p, base) && !pe?.explicitClear)
    return review("UNVERIFIED_ADMIN_CLEAR");

  const result = reconcileProfileFields({
    baseline: { value: [base] },
    notion: { value: [n] },
    psipedia: { value: [p] },
    protectedFields: new Set(),
    changedSideWins: true,
    verifiedFieldEdits: ne && pe && ne.editId !== pe.editId ? {
      value: {
        notion: { ...ne, value: [n] },
        psipedia: { ...pe, value: [p] },
      },
    } : undefined,
  });
  if (result.kind === "CONFLICT") return review(result.conflicts[0]?.reason ?? "AMBIGUOUS");
  const value = (result.merged.value as unknown[])[0];
  if (same(value, n)) return { action: "pull", value: n };
  if (same(value, p)) return { action: "push", value: p };
  return review("INVALID_DECISION");
}
