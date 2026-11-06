/**
 * Chovateľské stanice: editorial field events, not whole-profile reconciliation.
 * Identifiers, publication, Services V3 and trusted map/media data stay in their
 * own Admin-owned workflows. A missing Notion value is never a delete instruction.
 */
export const BREEDER_NOTION_EDITORIAL_FIELDS = {
  name: "Názov",
  excerpt: "Perex",
  description: "Popis",
  qualifications: "Kvalifikácie",
  region: "Kraj",
  district: "Okres",
  city: "Mesto",
  address: "Adresa",
  postalCode: "PSČ",
  street: "Ulica",
  houseNumber: "Číslo domu",
  addressFormat: "Formát adresy",
  priceNote: "Cena / poznámka",
  websiteUrl: "Web",
  publicPhone: "Telefón",
  publicEmail: "E-mail",
  facebookUrl: "Facebook",
  instagramUrl: "Instagram",
  "seo.title": "SEO title",
  "seo.description": "SEO popis",
  "seo.focusKeyword": "SEO kľúčové slovo",
  "seo.canonicalUrl": "Canonical URL",
  "seo.ogTitle": "OG title",
  "seo.ogDescription": "OG popis",
  "seo.ogImage": "OG obrázok",
} as const;

export type BreederEditorialField = keyof typeof BREEDER_NOTION_EDITORIAL_FIELDS;
export const BREEDER_EDITORIAL_PATHS = Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS) as BreederEditorialField[];

export function breederReadPath(snapshot: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) =>
    value && typeof value === "object"
      ? (value as Record<string, unknown>)[key]
      : undefined, snapshot);
}

function breederSetPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key]))
      cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
}

export function breederAdminChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): BreederEditorialField[] {
  return BREEDER_EDITORIAL_PATHS.filter(path =>
    JSON.stringify(breederReadPath(before, path)) !== JSON.stringify(breederReadPath(after, path)));
}

/** Notion sends opaque property IDs, not the new values. */
export function breederNotionChangedFields(
  properties: Record<string, unknown> | undefined,
  updatedProperties: readonly string[],
): BreederEditorialField[] {
  const changed = new Set(updatedProperties);
  if (!changed.size) return [];
  return BREEDER_EDITORIAL_PATHS.filter(path => {
    const notionName = BREEDER_NOTION_EDITORIAL_FIELDS[path];
    const property = properties?.[notionName];
    const id = property && typeof property === "object"
      ? (property as { id?: unknown }).id : undefined;
    return changed.has(notionName) || (typeof id === "string" && changed.has(id));
  });
}

/**
 * Only expressly edited fields transfer. Inbound blank Notion values are
 * treated as missing and never erase a value already held in Admin.
 */
export function breederApplyNotionChanges(
  admin: Record<string, unknown>,
  notion: Record<string, unknown>,
  paths: readonly BreederEditorialField[],
): Record<string, unknown> {
  const result = structuredClone(admin);
  for (const path of paths) {
    const value = breederReadPath(notion, path);
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())
        || (Array.isArray(value) && value.length === 0)) continue;
    breederSetPath(result, path, value);
  }
  return result;
}
