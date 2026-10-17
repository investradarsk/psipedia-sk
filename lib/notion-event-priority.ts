import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";

/**
 * Owner-approved Events policy:
 * - A filled Notion value wins for editorial content.
 * - An empty/missing Notion value cannot erase a canonical Psipedia value.
 * - A current, confirmed Google Place owns the event's physical location.
 * - Publication and canonical URL identity stay under Psipedia's existing gates.
 *
 * Notion's false checkboxes and numeric 0 are explicit values, not empties.
 * Never run this for other agendas: their authority rules are independent.
 */
const GOOGLE_LOCATION_FIELDS = new Set(["Adresa", "Miesto", "Mesto", "Kraj"]);
const CANONICAL_ONLY_FIELDS = new Set(["Slug", "Stav"]);

function isPopulatedNotionValue(value: ReconciliationValue | undefined) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

export function mergeNotionEventPriority(input: {
  canonical: Record<string, ReconciliationValue>;
  notion: Record<string, ReconciliationValue>;
  confirmedGooglePlace: boolean;
}): Record<string, ReconciliationValue> {
  const merged = { ...input.canonical };
  for (const [field, value] of Object.entries(input.notion)) {
    if (!Object.hasOwn(input.canonical, field)) continue;
    if (CANONICAL_ONLY_FIELDS.has(field)) continue;
    if (input.confirmedGooglePlace && GOOGLE_LOCATION_FIELDS.has(field)) continue;
    if (!isPopulatedNotionValue(value)) continue;
    merged[field] = value;
  }
  return merged;
}

/** Separate release gate: never activate bulk Events precedence on deploy. */
export function notionEventPriorityAEnabled(flag: string | undefined) {
  return ["true", "1"].includes((flag ?? "").trim().toLowerCase());
}
