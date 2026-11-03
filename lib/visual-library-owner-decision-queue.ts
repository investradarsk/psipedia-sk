import {
  OWNER_DECISION_OPTIONS,
  type OwnerDecisionKind,
} from "@/lib/visual-library-owner-decision";

/** Owner review decisions, never instructions to publish or delete code. */
export type OwnerDecisionDraft = {
  leftId: string;
  rightId: string;
  leftTitle: string;
  rightTitle: string;
  leftVariantId: string;
  rightVariantId: string;
  decision: OwnerDecisionKind;
  notes: string;
};

export type SavedOwnerDecision = {
  key: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  draft: OwnerDecisionDraft;
};

const ID = /^[A-Za-z0-9:_-]{1,120}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DECISIONS = new Set<string>(OWNER_DECISION_OPTIONS.map((item) => item.value));

function field(value: unknown, label: string, limit: number, required = true): string {
  if (typeof value !== "string") throw new Error("Neplatné pole rozhodnutia: " + label);
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > limit || CONTROL.test(trimmed)) {
    throw new Error("Neplatný obsah alebo dĺžka: " + label);
  }
  return trimmed;
}

function validId(value: unknown, label: string): string {
  const id = field(value, label, 120);
  if (!ID.test(id)) throw new Error("Neplatný identifikátor: " + label);
  return id;
}

export function ownerDecisionPairKey(leftId: string, rightId: string): string {
  const a = validId(leftId, "komponent A");
  const b = validId(rightId, "komponent B");
  if (a === b) throw new Error("Vyber dva rozdielne komponenty.");
  return "owner-decision:" + [a, b].sort().map(encodeURIComponent).join("|");
}

export function validateOwnerDecisionDraft(value: unknown): OwnerDecisionDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Neplatné rozhodnutie.");
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    "leftId", "rightId", "leftTitle", "rightTitle",
    "leftVariantId", "rightVariantId", "decision", "notes",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new Error("Nepovolené pole rozhodnutia.");
  }
  const leftId = validId(raw.leftId, "komponent A");
  const rightId = validId(raw.rightId, "komponent B");
  ownerDecisionPairKey(leftId, rightId);
  if (typeof raw.decision !== "string" || !DECISIONS.has(raw.decision)) {
    throw new Error("Neznámy typ rozhodnutia.");
  }
  return {
    leftId,
    rightId,
    leftTitle: field(raw.leftTitle, "názov A", 160),
    rightTitle: field(raw.rightTitle, "názov B", 160),
    leftVariantId: validId(raw.leftVariantId, "variant A"),
    rightVariantId: validId(raw.rightVariantId, "variant B"),
    decision: raw.decision as OwnerDecisionKind,
    notes: field(raw.notes, "poznámka", 1200, false),
  };
}

export function isMergeRequest(decision: OwnerDecisionKind): boolean {
  return decision === "use-left" || decision === "use-right" || decision === "new-shared";
}

export function ownerDecisionLabel(decision: OwnerDecisionKind): string {
  return OWNER_DECISION_OPTIONS.find((item) => item.value === decision)?.label ?? "Rozhodnutie";
}

/** Adapts a persisted record back to the currently chosen left/right order. */
export function orientSavedDecision(
  saved: SavedOwnerDecision,
  leftId: string,
  rightId: string,
): { decision: OwnerDecisionKind; leftVariantId: string; rightVariantId: string; notes: string } | null {
  if (ownerDecisionPairKey(saved.draft.leftId, saved.draft.rightId) !== ownerDecisionPairKey(leftId, rightId)) {
    return null;
  }
  const flipped = saved.draft.leftId !== leftId;
  const decision = flipped && saved.draft.decision === "use-left" ? "use-right"
    : flipped && saved.draft.decision === "use-right" ? "use-left"
    : saved.draft.decision;
  return {
    decision,
    leftVariantId: flipped ? saved.draft.rightVariantId : saved.draft.leftVariantId,
    rightVariantId: flipped ? saved.draft.leftVariantId : saved.draft.rightVariantId,
    notes: saved.draft.notes,
  };
}
