import type { ManagedBreed, ManagedBreedInput } from "./breed-store";
import type { NotionFieldMode } from "./notion-field-authority";

/**
 * Notion is the editorial source for these fields ONLY. Never use Notion to
 * overwrite canonical identity (ID/slug/FCI number/import key), publication,
 * images, gallery, or relations. SEO editorial metadata is a normal editable field.
 */
export const BREED_NOTION_EDITABLE_FIELDS = [
  "name", "fciGroup", "fciSection", "fciSectionNumber",
  "officialFciName", "validStandardDate", "workingTrial",
  "origin", "group", "size", "weight", "height", "lifespan", "coat",
  "energy", "trainability", "family", "children", "otherDogs",
  "apartment", "grooming", "shedding", "preyDrive",
  "intro", "character", "needs", "history", "exercise", "training",
  "health", "healthRisks", "goodFor", "consider", "sources",
  "fciStandard", "editorial", "sports",
  "seo.title", "seo.description", "seo.focusKeyword",
  "seo.ogTitle", "seo.ogDescription", "seo.canonicalUrl", "seo.noindex",
] as const;

export type BreedNotionField = (typeof BREED_NOTION_EDITABLE_FIELDS)[number];
export type BreedFieldSnapshot = Record<BreedNotionField, unknown>;
const numeric = new Set<string>([
  "fciGroup", "energy", "trainability", "family", "children",
  "otherDogs", "apartment", "grooming", "shedding", "preyDrive",
]);

function valueAt(input: ManagedBreed | ManagedBreedInput, key: BreedNotionField) {
  if (key.startsWith("seo.")) {
    const prop = key.slice(4) as keyof NonNullable<ManagedBreedInput["seo"]>;
    return input.seo?.[prop] ?? (prop === "noindex" ? false : "");
  }
  return (input as Record<string, unknown>)[key] ?? null;
}

export function breedFieldSnapshot(input: ManagedBreed | ManagedBreedInput): BreedFieldSnapshot {
  const snapshot = {} as BreedFieldSnapshot;
  for (const key of BREED_NOTION_EDITABLE_FIELDS) snapshot[key] = valueAt(input, key);
  return snapshot;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function parseBreedFieldSnapshot(value: string | null): BreedFieldSnapshot | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    // Old receipts predate the opt-in structured columns. Keep their old
    // baseline authoritative and initialise only newly introduced keys as
    // absent. Never force hundreds of legacy profiles through a full resync.
    for (const key of BREED_NOTION_EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(record, key)) continue;
      if (key === "fciStandard" || key === "editorial" || key === "sports") {
        record[key] = null;
        continue;
      }
      // Receipts created before SEO field coverage had no such keys. Treat
      // their historical empty/default values as an ordinary baseline.
      if (key.startsWith("seo.") && key !== "seo.title" && key !== "seo.description") {
        record[key] = key === "seo.noindex" ? false : "";
        continue;
      }
      return null;
    }
    return record as BreedFieldSnapshot;
  } catch {
    return null;
  }
}

/**
 * Only changed Notion columns produce a patch; unrelated Admin edits survive.
 * Content differences are not an error. When the owner selects Admin, Admin
 * wins; with Notion, safe or latest the Notion value is the deterministic
 * fallback if field-level change timestamps do not exist. Identity and
 * publication are excluded from this allowlist.
 *
 * Canonical score columns are currently required 1..5. Clearing such a Notion
 * value resets it to the existing neutral 3 (not SQL NULL). Text/list clears
 * are real empty values.
 */
export function planBreedNotionFieldDelta(
  existing: ManagedBreed,
  incoming: ManagedBreedInput,
  oldNotion: BreedFieldSnapshot,
  oldAdmin: BreedFieldSnapshot,
  authority: Readonly<Record<string, NotionFieldMode>> = {},
) {
  const latest = breedFieldSnapshot(incoming);
  const changed: BreedNotionField[] = [];
  const conflicts: BreedNotionField[] = [];
  const accepted: BreedNotionField[] = [];
  const patch: ManagedBreedInput = {};
  for (const key of BREED_NOTION_EDITABLE_FIELDS) {
    if (same(oldNotion[key], latest[key])) continue;
    changed.push(key);
    // Explicit Admin authority ignores Notion imports for this field.
    // The receipt still records the new Notion snapshot, preventing loops.
    if (authority[key] === "admin") continue;
    let desired: unknown = latest[key];
    if (numeric.has(key) && desired === null) desired = key === "fciGroup" ? 1 : 3;
    if (key === "name" && (typeof desired !== "string" || !desired.trim())) {
      conflicts.push(key);
      continue;
    }
    // This is intentionally breeds-only: the editor priority chooses the
    // winner instead of sending a normal content difference to review.
    accepted.push(key);
    if (key.startsWith("seo.")) {
      patch.seo = { ...patch.seo, [key.slice(4)]: desired };
    } else if (key === "editorial") {
      patch.editorial = { ...existing.editorial, ...(desired && typeof desired === "object" && !Array.isArray(desired) ? desired : {}) };
    } else if (key === "fciStandard") {
      patch.fciStandard = { ...existing.fciStandard, ...(desired && typeof desired === "object" && !Array.isArray(desired) ? desired : {}) };
    } else if (key === "sports") {
      // Only a complete explicit array replaces the corresponding sport list.
      if (Array.isArray(desired)) patch.sports = desired as ManagedBreedInput["sports"];
    } else {
      (patch as Record<string, unknown>)[key] = desired;
    }
  }
  return { latest, changed, accepted, conflicts, patch };
}

/** Keep last acknowledged Admin values for fields edited only in Admin. */
export function advanceBreedAdminReceipt(
  oldAdmin: BreedFieldSnapshot,
  updated: ManagedBreed,
  accepted: BreedNotionField[],
): BreedFieldSnapshot {
  const next = { ...oldAdmin };
  const actual = breedFieldSnapshot(updated);
  for (const key of accepted) next[key] = actual[key];
  return next;
}
