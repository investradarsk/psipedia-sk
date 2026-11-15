/**
 * One read contract for historic public fact labels and their visible Admin fields.
 * Existing D1 source_data_json remains storage during the safe migration.
 * Do not infer facts from descriptions, services V3 or breed relations.
 */
import type { DirectoryCategorySlug } from "./directory";

export const relationFields = [
  "Plemeno",
  "Plemená",
  "FCI skupina",
  "Organizácia",
  "Zastrešujúca organizácia",
] as const;

export const detailFields: Partial<Record<DirectoryCategorySlug, string[]>> = {
  veterinari: ["Špecializácie", "Pohotovosť", "Hospitalizácia", "RTG", "USG", "Laboratórium"],
  treneri: [
    "Individuálny výcvik",
    "Skupinový výcvik",
    "Výcvik šteniat",
    "Behaviorálne poradenstvo",
  ],
  "kynologicke-kluby": [
    "Typ klubu",
    "Zameranie",
    "Organizácia",
    "Výcvik šteniat",
    "Individuálny výcvik",
    "Skupinový výcvik",
    "Športová kynológia",
    "Obrany",
    "Stopy",
    "Agility",
    "Rally obedience",
    "Retriever / poľovnícka kynológia",
  ],
  "chovatelske-kluby": [
    "Plemeno",
    "Plemená",
    "FCI skupina",
    "Organizácia",
    "Zastrešujúca organizácia",
  ],
  "chovatelske-stanice": [
    "Plemeno",
    "Plemená",
    "FCI skupina",
    "Chovateľ",
    "Klub",
    "Aktívny chov",
    "Aktuálne vrhy",
    "Plánované vrhy",
  ],
  "hotely-a-opatrovanie": ["Hotel", "Opatrovanie", "Denná starostlivosť", "Vyzdvihnutie psa"],
  vencenie: [
    "Individuálne venčenie",
    "Skupinové venčenie",
    "Venčenie s tréningom",
    "Šteňatá",
    "Veľké psy",
    "Seniori / špeciálne potreby",
    "Vyzdvihnutie psa",
    "GPS / foto report",
    "Typ poskytovateľa",
  ],
  "dalsie-sluzby": [
    "Typ služby",
    "Pokrytie",
    "Výjazd ku klientovi",
    "Celoslovenská dostupnosť",
    "Orientačná cena",
  ],
};


const publicMetadataAliases: Readonly<Record<string, readonly string[]>> = {
  "Organizácia": ["Zastrešujúca organizácia"],
  "Ordinačné hodiny": [
    "Otváracie hodiny", "Otváracia doba", "Ordinačná doba", "Pracovná doba",
  ],
  "Pokrytie": ["Oblasť pôsobenia", "Lokalita / pokrytie"],
};

const publicMetadataKeys = [...new Set([
  ...Object.values(detailFields).flat(),
  ...relationFields,
  "Ordinačné hodiny", "Pokrytie", "Alt text obrázka",
  "Zdroj dát", "Zdroj obrázka", "Organizácia", "Zameranie",
])] as readonly string[];

export function isDirectoryPublicMetadataField(field: string): boolean {
  return publicMetadataKeys.includes(field) && field !== "Zastrešujúca organizácia";
}

/**
 * Explicitly present canonical fields win EVEN WHEN EMPTY.
 * That prevents the public page from resurrecting an old import alias after
 * an Admin/Notion deletion. Legacy aliases are read only when canonical is absent.
 */
/**
 * Return the *actual* D1 JSON key providing a public fact. A present
 * canonical key remains authoritative even if deliberately cleared.
 * Read-only: never promotes a legacy alias or mutates source_data_json.
 */
export function readDirectoryPublicMetadataSource(
  source: Record<string, string | number | null> | null | undefined,
  field: string,
): { sourceKey: string; value: string } | null {
  if (!source) return null;
  if (Object.hasOwn(source, field)) {
    const raw = source[field];
    return { sourceKey: field, value: raw == null ? "" : String(raw).trim() };
  }
  for (const sourceKey of publicMetadataAliases[field] ?? []) {
    const raw = source[sourceKey];
    if (raw != null && String(raw).trim()) {
      return { sourceKey, value: String(raw).trim() };
    }
  }
  return null;
}

export function readDirectoryPublicMetadataValue(
  source: Record<string, string | number | null> | null | undefined,
  field: string,
): string {
  return readDirectoryPublicMetadataSource(source, field)?.value ?? "";
}

/** All public free-text facts relevant to the selected profile category. */
export function directoryPublicEditorFieldLabels(category: DirectoryCategorySlug): string[] {
  return [...new Set([
    ...(detailFields[category] ?? []),
    ...relationFields,
    "Pokrytie",
  ])].filter(key => !["Organizácia", "Zastrešujúca organizácia", "Zameranie"].includes(key));
}
