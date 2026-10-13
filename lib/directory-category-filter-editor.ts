/**
 * PSIPEDIA-SERVICES-V2 / 5B — Pure UI adapter.
 * No D1, Notion, public filters or API writes.
 */
import {
  DIRECTORY_FILTER_CONTRACT_VERSION,
  getDirectoryFilterDefinition, normalizeDirectoryFilterValue,
  serviceFilterCategories, serviceFiltersForCategory,
  type DirectoryFilterDefinition, type ServiceFilterCategory,
} from "./directory-filter-contract";

export type DirectoryCategoryFilterOriginals = Readonly<Record<string, unknown>>;
export type DirectoryCategoryFilterChanges = Readonly<Record<string, string>>;
export type DirectoryCategoryFilterReviewStates = Readonly<Record<string, "conflict" | "invalid" | undefined>>;
export type DirectoryCategoryFilterFieldStatus = "known" | "missing" | "invalid" | "conflict";
export type DirectoryCategoryFilterField = Readonly<{
  id: string;
  label: string;
  valueType: DirectoryFilterDefinition["valueType"];
  status: DirectoryCategoryFilterFieldStatus;
  initialValue: string;
  options: readonly Readonly<{ value: string; label: string }>[];
  hint: string;
}>;
export type DirectoryCategoryFilterPatch = Readonly<{
  category: ServiceFilterCategory;
  contractVersion: typeof DIRECTORY_FILTER_CONTRACT_VERSION;
  /** Flat registry IDs, for server-side validation and approved merging. */
  updates: Readonly<Record<string, string>>;
}>;

const optionLabels: Readonly<Record<string, string>> = {
  yes: "Áno", no: "Nie", unknown: "Neznáme",
  ambulance: "Ambulancia", clinic: "Klinika", hospital: "Nemocnica",
};

function assertCategory(category: ServiceFilterCategory) {
  if (!(serviceFilterCategories as readonly string[]).includes(category)) throw new Error("Neplatná kategória filtrov.");
}

export function getDirectoryCategoryFilterFields(
  category: ServiceFilterCategory,
  originals: DirectoryCategoryFilterOriginals,
  reviewStates: DirectoryCategoryFilterReviewStates = {},
): readonly DirectoryCategoryFilterField[] {
  assertCategory(category);
  return serviceFiltersForCategory(category).map((definition) => {
    const normalized = normalizeDirectoryFilterValue(definition, originals[definition.id]);
    const status: DirectoryCategoryFilterFieldStatus =
      reviewStates[definition.id] === "conflict" ? "conflict"
      : reviewStates[definition.id] === "invalid" ? "invalid"
      : normalized.status;
    const initialValue = status === "known" ? normalized.value : "";
    const hint = status === "conflict" ? "Konflikt údajov medzi zdrojmi. Bez vášho výberu zostane nezmenený."
      : status === "invalid" ? "Neplatná pôvodná hodnota. Bez vášho výberu zostane nezmenená."
      : status === "missing" ? "Údaj ešte nebol vyplnený. Neznáme treba zvoliť výslovne."
      : normalized.value === "unknown" ? "Pôvodný stav je výslovne Neznáme." : "";
    return {
      id: definition.id, label: definition.label, valueType: definition.valueType,
      status, initialValue, hint,
      options: definition.allowedValues.map((value) => ({ value, label: optionLabels[value] ?? value })),
    };
  });
}

/** Filter stale edits from a previous category without serializing them. */
export function scopeDirectoryCategoryFilterChanges(
  category: ServiceFilterCategory,
  changes: DirectoryCategoryFilterChanges,
): Record<string, string> {
  assertCategory(category);
  return Object.fromEntries(Object.entries(changes).filter(([id]) => (
    getDirectoryFilterDefinition(id)?.category === category
  )));
}

/** Changes are explicit canonical values; foreign keys cause an atomic error. */
export function buildDirectoryCategoryFilterPatch(
  category: ServiceFilterCategory,
  originals: DirectoryCategoryFilterOriginals,
  changes: DirectoryCategoryFilterChanges,
  reviewStates: DirectoryCategoryFilterReviewStates = {},
): DirectoryCategoryFilterPatch {
  assertCategory(category);
  const updates: Record<string, string> = {};
  for (const [id, selected] of Object.entries(changes)) {
    const definition = getDirectoryFilterDefinition(id);
    if (!definition || definition.category !== category) throw new Error("Neznámy filter alebo filter inej kategórie: " + id);
    if (!definition.allowedValues.includes(selected)) throw new Error("Nepovolená hodnota filtra: " + id);
    const before = normalizeDirectoryFilterValue(definition, originals[id]);
    const unresolved = reviewStates[id] === "conflict" || reviewStates[id] === "invalid";
    if (!unresolved && before.status === "known" && before.value === selected) continue;
    updates[id] = selected;
  }
  return { category, contractVersion: DIRECTORY_FILTER_CONTRACT_VERSION, updates };
}

/** Strict read-only adapter from current source_data_json, not a writer. */
export function readDirectoryCategoryFilterOriginals(
  category: ServiceFilterCategory,
  sourceDataJson: string,
): Record<string, unknown> {
  assertCategory(category);
  let parsed: unknown;
  try { parsed = JSON.parse(sourceDataJson); }
  catch { throw new Error("Neplatný zdrojový JSON filtrov; úprava je zablokovaná."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Zdroj filtrov musí byť objekt; úprava je zablokovaná.");
  }
  const record = parsed as Record<string, unknown>;
  return Object.fromEntries(serviceFiltersForCategory(category).map((definition) => [
    definition.id, record[definition.d1.key],
  ]));
}
