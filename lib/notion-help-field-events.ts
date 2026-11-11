import { agendaEditableFields, type BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";
import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";

/**
 * The Directory-style per-property transport for mapped Help records.
 * Canonical identity/publication, exact location and private contact decisions
 * deliberately remain in their existing Admin workflows.
 */
export type HelpFieldEventAgenda = Exclude<BidirectionalAgendaKey, "events">;

const PROTECTED: Readonly<Record<HelpFieldEventAgenda, readonly string[]>> = {
  organizations: ["Slug", "Stav", "Typ"],
  adoptions: ["Slug", "Stav"],
  "help-cases": ["Slug", "Kategória", "Psipedia stav", "Vyriešené"],
  "lost-found": [
    "Slug", "Typ", "Psipedia stav", "Latitude", "Longitude",
    "Presnosť lokality", "Miesto", "Verejný kontakt",
  ],
};

export function isHelpFieldEventAgenda(agenda: string): agenda is HelpFieldEventAgenda {
  return agenda === "organizations" || agenda === "adoptions" ||
    agenda === "help-cases" || agenda === "lost-found";
}

export function editableHelpEventFields(agenda: HelpFieldEventAgenda): readonly string[] {
  const blocked = new Set(PROTECTED[agenda]);
  return agendaEditableFields[agenda].filter(name => !blocked.has(name));
}

/** Notion sends opaque property IDs, not property names or field values. */
export function changedNotionHelpFields(
  agenda: HelpFieldEventAgenda,
  properties: Record<string, unknown> | undefined,
  changedPropertyIds: readonly string[],
): string[] {
  const ids = new Set(changedPropertyIds);
  if (!ids.size) return [];
  return editableHelpEventFields(agenda).filter(name => {
    const property = properties?.[name];
    const id = property && typeof property === "object"
      ? (property as { id?: unknown }).id : undefined;
    return ids.has(name) || (typeof id === "string" && ids.has(id));
  });
}

/** Admin diffs are computed from the canonical BEFORE and AFTER values. */
export function changedAdminHelpFields(
  agenda: HelpFieldEventAgenda,
  before: Record<string, ReconciliationValue>,
  after: Record<string, ReconciliationValue>,
): string[] {
  const stable = (value: ReconciliationValue | undefined) => JSON.stringify(value ?? null);
  return editableHelpEventFields(agenda).filter(name =>
    stable(before[name]) !== stable(after[name]));
}

export function helpFieldSnapshot(
  live: Record<string, ReconciliationValue>,
  notion: Record<string, ReconciliationValue>,
  field: string,
): Record<string, ReconciliationValue> {
  return { ...live, [field]: notion[field] ?? null };
}
