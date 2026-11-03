import type { ManagedBreed, ManagedBreedInput } from "./breed-store";
import type { NotionFieldMode } from "./notion-field-authority";

/**
 * Notion is the editorial source for these fields ONLY. Never use Notion to
 * overwrite canonical identity (ID/slug/FCI number/import key), publication,
 * images, gallery, or relations. SEO editorial metadata is a normal editable field.
 */
import { BREED_NOTION_PRIORITY_FIELDS } from "./notion-breed-property-registry.ts";

/** Every content field has its own priority, including FCI subfields and media. */
export const BREED_NOTION_EDITABLE_FIELDS = BREED_NOTION_PRIORITY_FIELDS
  .filter(e=>e.mode==="content").map(e=>e.id);

export type BreedNotionField = (typeof BREED_NOTION_EDITABLE_FIELDS)[number];
export type BreedFieldSnapshot = Record<BreedNotionField, unknown>;
const numeric = new Set<string>([
  "fciGroup", "energy", "trainability", "family", "children",
  "otherDogs", "apartment", "grooming", "shedding", "preyDrive",
]);

function valueAt(input: ManagedBreed | ManagedBreedInput, key: BreedNotionField) {
  if (key.startsWith("seo.")) {
    const prop = key.slice(4) as keyof NonNullable<ManagedBreedInput["seo"]>;
    return input.seo?.[prop] ?? (prop==="noindex" ? false : "");
  }
  if (key.startsWith("fciStandard.")) {
    const name = key.slice("fciStandard.".length);
    return (input.fciStandard as Record<string, unknown> | undefined)?.[name] ?? "";
  }
  if (key.startsWith("editorial.")) {
    const name = key.slice("editorial.".length);
    return (input.editorial as Record<string, unknown> | undefined)?.[name]
      ?? (name==="heroTraits" ? [] : "");
  }
  if (key==="gallery" || key==="relatedBreedIds" || key==="relatedArticleIds" ||
      key==="directoryProfileIds" || key==="sports") {
    return (input as Record<string, unknown>)[key] ?? [];
  }
  if (key==="editorialComplete") return input.editorialComplete ?? false;
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
      // Older receipts held the FCI and editorial sections as one JSON object.
      // Preserve their last acknowledged subfield values when migrating to the
      // new per-column model; no historical content is overwritten.
      if (key.startsWith("fciStandard.") || key.startsWith("editorial.")) {
        const [root,subfield] = key.split(".",2);
        const rootValue = record[root];
        const fromOld = rootValue && typeof rootValue==="object" && !Array.isArray(rootValue)
          ? (rootValue as Record<string, unknown>)[subfield] : undefined;
        record[key] = fromOld ?? (key==="editorial.heroTraits" ? [] : "");
        continue;
      }
      if (key==="gallery" || key==="relatedBreedIds" ||
          key==="relatedArticleIds" || key==="directoryProfileIds") {
        record[key] = [];
        continue;
      }
      if (key==="editorialComplete") { record[key]=false; continue; }
      if (key==="accent") { record[key]="forest"; continue; }
      if (key==="image") { record[key]=""; continue; }
      if (key==="fciStandard" || key==="editorial" || key==="sports") {
        record[key] = null;
        continue;
      }
      if (key.startsWith("seo.") && key !== "seo.title" && key !== "seo.description") {
        record[key] = key==="seo.noindex" ? false : "";
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
  presentFields?: ReadonlySet<string>,
) {
  const latest = breedFieldSnapshot(incoming);
  const changed: BreedNotionField[] = [];
  const conflicts: BreedNotionField[] = [];
  const accepted: BreedNotionField[] = [];
  const patch: ManagedBreedInput = {};
  for (const key of BREED_NOTION_EDITABLE_FIELDS) {
    if (presentFields && !presentFields.has(key)) continue;
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
    } else if (key.startsWith("fciStandard.")) {
      patch.fciStandard = { ...patch.fciStandard, [key.slice("fciStandard.".length)]: desired };
    } else if (key.startsWith("editorial.")) {
      patch.editorial = { ...patch.editorial, [key.slice("editorial.".length)]: desired };
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
