import type { ManagedBreed, ManagedBreedInput } from "./breed-store";
import type { NotionFieldMode } from "./notion-field-authority";

/**
 * Notion is the editorial source for these fields ONLY. Never use Notion to
 * overwrite canonical identity (ID/slug/FCI number/import key), publication,
 * image, gallery, relations, admin-only editorial, or SEO OG metadata.
 */
export const BREED_NOTION_EDITABLE_FIELDS = [
  "name", "fciGroup", "fciSection", "fciSectionNumber",
  "officialFciName", "validStandardDate", "workingTrial",
  "origin", "group", "size", "weight", "height", "lifespan", "coat",
  "energy", "trainability", "family", "children", "otherDogs",
  "apartment", "grooming", "shedding", "preyDrive",
  "intro", "character", "needs", "history", "exercise", "training",
  "health", "healthRisks", "goodFor", "consider", "sources",
  "seo.title", "seo.description",
] as const;

export type BreedNotionField = (typeof BREED_NOTION_EDITABLE_FIELDS)[number];
export type BreedFieldSnapshot = Record<BreedNotionField, unknown>;
const numeric = new Set<string>([
  "fciGroup", "energy", "trainability", "family", "children",
  "otherDogs", "apartment", "grooming", "shedding", "preyDrive",
]);

function valueAt(input: ManagedBreed | ManagedBreedInput, key: BreedNotionField) {
  if (key === "seo.title") return input.seo?.title ?? "";
  if (key === "seo.description") return input.seo?.description ?? "";
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
    if (!BREED_NOTION_EDITABLE_FIELDS.every(key => Object.prototype.hasOwnProperty.call(record, key)))
      return null;
    return record as BreedFieldSnapshot;
  } catch {
    return null;
  }
}

/**
 * Only changed Notion columns produce a patch. An unrelated Admin edit cannot
 * block this update. A simultaneous edit to the SAME field is flagged instead
 * of silently choosing a winner.
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
  const current = breedFieldSnapshot(existing);
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
    if (!same(current[key], oldAdmin[key]) && !same(current[key], desired)
        && authority[key] !== "notion") {
      conflicts.push(key);
      continue;
    }
    accepted.push(key);
    if (key === "seo.title" || key === "seo.description") {
      patch.seo = { ...patch.seo, [key.slice(4)]: desired };
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
