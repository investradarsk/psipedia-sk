/**
 * PSIPEDIA-SERVICES-V2 / 4: proposed, NOT activated public category facets.
 * Source of truth for definitions; no D1/Notion writes and no text inference.
 */
import type { DirectoryCategorySlug } from "./directory";

export const DIRECTORY_FILTER_CONTRACT_VERSION = 1 as const;
export const serviceFilterCategories = [
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
] as const satisfies readonly DirectoryCategorySlug[];

export type ServiceFilterCategory = (typeof serviceFilterCategories)[number];
export type DirectoryFilterTriState = "yes" | "no" | "unknown";
export type DirectoryFilterValueType = "tri_state" | "single_select";
export type DirectoryFilterDefinition = Readonly<{
  id: string;
  category: ServiceFilterCategory;
  label: string;
  valueType: DirectoryFilterValueType;
  allowedValues: readonly string[];
  unknownPolicy: Readonly<{ missing: "unknown"; invalid: "review"; conflict: "review"; publicBehavior: "exclude" }>;
  d1: Readonly<{ column: "source_data_json"; key: string; status: "proposed" }>;
  notion: Readonly<{ property: string; type: "select"; status: "not_provisioned" }>;
  legacyAliases: readonly string[];
  version: typeof DIRECTORY_FILTER_CONTRACT_VERSION;
}>;

const unknownPolicy = {
  missing: "unknown", invalid: "review", conflict: "review", publicBehavior: "exclude",
} as const;
const triValues = ["yes", "no", "unknown"] as const;

/** A deliberately flat scalar key survives the current safeImportData primitive whitelist. */
function defineFacet(
  category: ServiceFilterCategory,
  name: string,
  label: string,
  values: readonly string[] = triValues,
  legacyAliases: readonly string[] = [],
): DirectoryFilterDefinition {
  const id = `${category}.${name}`;
  return {
    id, category, label,
    valueType: values === triValues ? "tri_state" : "single_select",
    allowedValues: values,
    unknownPolicy,
    d1: { column: "source_data_json", key: `_psipedia_filter_v1_${category.replace(/-/g, "_")}_${name}`, status: "proposed" },
    notion: { property: `Filter · ${id}`, type: "select", status: "not_provisioned" },
    legacyAliases,
    version: DIRECTORY_FILTER_CONTRACT_VERSION,
  };
}

/** Candidate fields, not claims that current D1 or Notion already stores them. */
export const directoryFilterRegistry: readonly DirectoryFilterDefinition[] = [
  defineFacet("veterinari", "facility_type", "Typ pracoviska", ["ambulance", "clinic", "hospital", "unknown"]),
  defineFacet("veterinari", "emergency", "Pohotovosť"),
  defineFacet("veterinari", "home_visits", "Návštevy doma"),
  defineFacet("treneri", "individual_training", "Individuálny výcvik"),
  defineFacet("treneri", "group_training", "Skupinový výcvik"),
  defineFacet("kynologicke-kluby", "trial_preparation", "Príprava na skúšky"),
  defineFacet("kynologicke-kluby", "group_training", "Skupinové tréningy"),
  defineFacet("chovatelske-kluby", "breeding_advice", "Chovateľské poradenstvo"),
  defineFacet("chovatelske-kluby", "member_events", "Klubové podujatia"),
  defineFacet("chovatelske-stanice", "visits_by_appointment", "Návštevy po dohode"),
  defineFacet("chovatelske-stanice", "health_testing_information", "Informácie o zdravotných testoch"),
  defineFacet("salony-a-sluzby", "nail_trimming", "Strihanie pazúrov"),
  defineFacet("salony-a-sluzby", "hand_stripping", "Trimovanie"),
  defineFacet("hotely-a-opatrovanie", "overnight_stays", "Nočné ubytovanie"),
  defineFacet("hotely-a-opatrovanie", "daycare", "Denná opatera"),
  defineFacet("vencenie", "individual_walks", "Individuálne venčenie"),
  defineFacet("vencenie", "group_walks", "Skupinové venčenie"),
  defineFacet("fyzioterapia", "hydrotherapy", "Hydroterapia"),
  defineFacet("fyzioterapia", "home_visits", "Návštevy doma"),
  defineFacet("dalsie-sluzby", "pet_transport", "Preprava psov"),
  defineFacet("dalsie-sluzby", "equipment_rental", "Požičiavanie výbavy"),
];

/** Existing public facets are legacy FREE TEXT, not validated category properties. */
export const existingDirectoryFacetSources = {
  service: { d1Column: "services_json", notionProperty: "Služby", structured: false },
  breed: { d1Column: "source_data_json", aliases: ["Plemeno", "Plemená"], structured: false },
  fci: { d1Column: "source_data_json", aliases: ["FCI skupina", "FCI"], structured: false },
  organization: { d1Column: "source_data_json", aliases: ["Organizácia", "Zastrešujúca organizácia"], structured: false },
  type: { d1Column: "source_data_json", aliases: ["Typ služby", "Typ poskytovateľa", "Typ klubu"], structured: false },
} as const;

export function serviceFiltersForCategory(category: string): readonly DirectoryFilterDefinition[] {
  return directoryFilterRegistry.filter((item) => item.category === category);
}

export function getDirectoryFilterDefinition(id: string): DirectoryFilterDefinition | undefined {
  return directoryFilterRegistry.find((item) => item.id === id);
}

export type NormalizedDirectoryFilter = {
  status: "known" | "missing" | "invalid";
  value: string;
};

/**
 * No NLP, substring matching, false checkbox defaults or free-text inference.
 * A present literal 'no' is different from absent / null / empty / 'unknown'.
 */
export function normalizeDirectoryFilterValue(
  definition: DirectoryFilterDefinition,
  raw: unknown,
): NormalizedDirectoryFilter {
  if (raw === undefined || raw === null || raw === "") return { status: "missing", value: "unknown" };
  if (typeof raw !== "string") return { status: "invalid", value: "unknown" };
  const value = raw.trim().toLocaleLowerCase("sk");
  if (!value) return { status: "missing", value: "unknown" };
  if (definition.valueType === "tri_state") {
    const canonical = value === "áno" || value === "ano" ? "yes"
      : value === "nie" ? "no" : value;
    return (triValues as readonly string[]).includes(canonical)
      ? { status: "known", value: canonical }
      : { status: "invalid", value: "unknown" };
  }
  return definition.allowedValues.includes(value)
    ? { status: "known", value }
    : { status: "invalid", value: "unknown" };
}

function sourceRecord(sourceDataJson: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(sourceDataJson); } catch { throw new Error("Invalid source_data_json: cannot safely merge facets."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid source_data_json: expected object.");
  }
  return value as Record<string, unknown>;
}

export function readDirectoryFilterValue(sourceDataJson: string, id: string): NormalizedDirectoryFilter {
  const definition = getDirectoryFilterDefinition(id);
  if (!definition) throw new Error(`Unknown filter ID: ${id}`);
  const record = sourceRecord(sourceDataJson);
  return normalizeDirectoryFilterValue(definition, record[definition.d1.key]);
}

/**
 * Pure future-adapter helper. It does not write to D1/Notion.
 * Reject invalid/mismatched category updates atomically; never drop unknown keys.
 */
export function mergeDirectoryFilterValues(
  sourceDataJson: string,
  category: ServiceFilterCategory,
  updates: Readonly<Record<string, unknown>>,
): string {
  const record = sourceRecord(sourceDataJson);
  const next = { ...record };
  for (const [id, raw] of Object.entries(updates)) {
    const definition = getDirectoryFilterDefinition(id);
    if (!definition || definition.category !== category) throw new Error(`Out-of-category/unknown facet: ${id}`);
    const normalized = normalizeDirectoryFilterValue(definition, raw);
    if (normalized.status !== "known") throw new Error(`Facet ${id} requires an explicit allowed value.`);
    next[definition.d1.key] = normalized.value;
  }
  return JSON.stringify(next);
}

export function reconcileDirectoryFilterValue(
  definition: DirectoryFilterDefinition,
  d1Raw: unknown,
  notionRaw: unknown,
): { status: "equal" | "one_sided" | "missing" | "conflict" | "invalid"; value: string } {
  const left = normalizeDirectoryFilterValue(definition, d1Raw);
  const right = normalizeDirectoryFilterValue(definition, notionRaw);
  if (left.status === "invalid" || right.status === "invalid") return { status: "invalid", value: "unknown" };
  if (left.status === "missing" && right.status === "missing") return { status: "missing", value: "unknown" };
  if (left.status === "missing" || right.status === "missing") {
    return { status: "one_sided", value: left.status === "known" ? left.value : right.value };
  }
  if (left.value !== right.value) return { status: "conflict", value: "unknown" };
  return { status: "equal", value: left.value };
}

export type DirectoryFilterAuditRow = {
  category: string;
  source_data_json: string;
  services_json?: string;
};

/** Offline, aggregated, read-only inventory; no identification fields emitted. */
export function auditDirectoryFilterRows(rows: readonly DirectoryFilterAuditRow[]) {
  const categories = Object.fromEntries(serviceFilterCategories.map((category) => [
    category, { records: 0, populated: 0, unknown: 0, invalid: 0, legacyText: 0, malformed: 0 },
  ])) as Record<ServiceFilterCategory, {
    records: number; populated: number; unknown: number; invalid: number; legacyText: number; malformed: number;
  }>;
  let excludedLegacyCategories = 0;
  for (const row of rows) {
    if (!Object.hasOwn(categories, row.category)) { excludedLegacyCategories++; continue; }
    const stats = categories[row.category as ServiceFilterCategory];
    stats.records++;
    let record: Record<string, unknown>;
    try { record = sourceRecord(row.source_data_json); } catch { stats.malformed++; continue; }
    const hasLegacy = Object.values(existingDirectoryFacetSources).some((facet) => (
      "aliases" in facet && facet.aliases.some((key: string) => typeof record[key] === "string" && String(record[key]).trim() !== "")
    ));
    let serviceList: unknown;
    try { serviceList = JSON.parse(row.services_json ?? "[]"); } catch { serviceList = undefined; }
    if (hasLegacy || (Array.isArray(serviceList) && serviceList.length > 0)) stats.legacyText++;
    for (const definition of serviceFiltersForCategory(row.category)) {
      const normalized = normalizeDirectoryFilterValue(definition, record[definition.d1.key]);
      if (normalized.status === "invalid") stats.invalid++;
      else if (normalized.status === "missing" || normalized.value === "unknown") stats.unknown++;
      else stats.populated++;
    }
  }
  return {
    contractVersion: DIRECTORY_FILTER_CONTRACT_VERSION,
    source: "offline-export-only",
    scannedRows: rows.length,
    excludedLegacyCategories,
    categories,
  };
}
