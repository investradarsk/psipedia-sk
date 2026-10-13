/**
 * PSIPEDIA-SERVICES-V2 / 5A: conservative, lossless source_data_json import.
 * Only the generic admin import uses this adapter. It never infers filters from prose.
 */
import {
  directoryFilterRegistry,
  normalizeDirectoryFilterValue,
} from "@/lib/directory-filter-contract";

type SourceRecord = Record<string, unknown>;
const registeredKeys = new Map(directoryFilterRegistry.map((filter) => [filter.d1.key, filter]));

function parseSourceRecord(value: string): SourceRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Existujúce source_data_json nie je platný JSON; import je zablokovaný.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Existujúce source_data_json musí byť JSON objekt.");
  }
  return parsed as SourceRecord;
}

/**
 * Missing/null/empty filters are not assertions. Explicit 'unknown' is.
 * Once a stored facet has an explicit valid value (including 'unknown'),
 * an untrusted generic import may repeat it but cannot replace it.
 * Any existing source keys not supplied by the import survive unchanged.
 */
export function prepareGeneralDirectorySourceImport(
  incoming: Readonly<SourceRecord>,
  category: string,
  existingSourceJson: string | null,
): string {
  const existing = existingSourceJson === null ? {} : parseSourceRecord(existingSourceJson);
  const merged: SourceRecord = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith("_psipedia_")) {
      const definition = registeredKeys.get(key);
      if (!definition || definition.category !== category) {
        throw new Error(`Nepovolený interný údaj alebo filter mimo kategórie: ${key}.`);
      }
      const normalized = normalizeDirectoryFilterValue(definition, value);
      if (normalized.status === "invalid") {
        throw new Error(`Neplatná hodnota filtra ${definition.id}.`);
      }
      if (normalized.status === "missing") continue;

      const previous = normalizeDirectoryFilterValue(definition, existing[key]);
      if (previous.status === "invalid") {
        throw new Error(`Existujúci filter ${definition.id} má neplatnú hodnotu; vyžaduje kontrolu.`);
      }
      if (previous.status === "known") {
        if (previous.value !== normalized.value) {
          throw new Error(`Konflikt filtra ${definition.id}: potvrdenú hodnotu nesmie prepísať import.`);
        }
        continue; // Even equivalent imported values must not rewrite manually stored metadata.
      }
      merged[key] = normalized.value;
      continue;
    }
    // Preserve the original generic import's safe scalar-only data contract.
    // Null is missing data, not a delete request. Nested imports are not supported.
    if (value !== null && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
      merged[key] = value;
    }
  }
  return JSON.stringify(merged);
}
