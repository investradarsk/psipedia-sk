/**
 * Canonical PHYSICAL Notion field contract for the new breed database.
 *
 * A Notion column is not always a single Admin field: 23 historical logical
 * values share 11 physical rich-text columns. This module keeps the mapping
 * explicit without copying their values or enabling any new synchronization.
 *
 * 60 visible legacy/content columns + 12 new typed fields + 2 technical
 * provenance columns = 74 distinct Notion properties.
 */
import { BREED_COMPACT_VISIBLE, BREED_COMPACT_MERGE } from "./breed-notion-compact-consolidation.mjs";
import { BREED_CONTROLLED_FIELDS } from "./breed-workcopy-controlled.mjs";

export const BREED_WORKCOPY_TECHNICAL_PROPERTIES = Object.freeze([
  "Psipedia ID", "Zdrojový profil Notion",
]);

export const BREED_WORKCOPY_PHYSICAL_PROPERTIES = Object.freeze([
  ...BREED_COMPACT_VISIBLE,
  ...BREED_CONTROLLED_FIELDS.map(field => field.notion),
  ...BREED_WORKCOPY_TECHNICAL_PROPERTIES,
]);

const physical = new Set(BREED_COMPACT_VISIBLE);

/** Physical column holding one legacy Admin field (or null if Admin-only). */
export function breedWorkcopyPhysicalProperty(logicalNotionName) {
  const name = BREED_COMPACT_MERGE[logicalNotionName] ?? logicalNotionName;
  return physical.has(name) ? name : null;
}

/** Physical properties the editorial executor must not treat as text updates. */
export const BREED_WORKCOPY_NON_EDITORIAL_COLUMNS = Object.freeze([
  "FCI číslo", "Hlavný obrázok URL", "Galéria JSON", "Športy JSON",
  ...BREED_WORKCOPY_TECHNICAL_PROPERTIES,
]);

/** No assumption here that media/relations have a live transport adapter. */
export function breedWorkcopyPropertyKind(name) {
  if (BREED_WORKCOPY_TECHNICAL_PROPERTIES.includes(name)) return "technical";
  if (BREED_CONTROLLED_FIELDS.some(field => field.notion === name)) return "controlled";
  if (physical.has(name)) return "content";
  return null;
}
