/**
 * Chovateľské stanice: editorial field events, not whole-profile reconciliation.
 * Identifiers, publication, Services V3 and trusted map/media data stay in their
 * own Admin-owned workflows. Only a signed property edit may clear a field.
 */
export const BREEDER_NOTION_EDITORIAL_FIELDS = {
  name: "Názov",
  excerpt: "Perex",
  description: "Popis",
  services: "Služby",
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
  "seo.noindex": "Noindex",
} as const;

export type BreederEditorialField = keyof typeof BREEDER_NOTION_EDITORIAL_FIELDS;
/** Only these five plain text contacts may be explicitly re-confirmed from the Contacts tab. */
export const DIRECTORY_CONTACT_EDITORIAL_PATHS = [
  "websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl",
] as const satisfies readonly BreederEditorialField[];
export const BREEDER_EDITORIAL_PATHS = Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS) as BreederEditorialField[];

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
 * Only expressly edited fields transfer. An explicitly edited blank is a
 * deletion; an absent source property is not. Never replay a whole profile.
 */
export function breederApplyNotionChanges(
  admin: Record<string, unknown>,
  notion: Record<string, unknown>,
  paths: readonly BreederEditorialField[],
): Record<string, unknown> {
  const result = structuredClone(admin);
  for (const path of paths) {
    const value = breederReadPath(notion, path);
    if (value === undefined) continue;
    breederSetPath(result, path, value);
  }
  return result;
}

/**
 * A long-open Admin form must not overwrite a newer Notion edit to an
 * untouched field. The editor sends its own dirty field keys based on the
 * original form values; the server fills every other field from live D1.
 */
export function breederPreserveUneditedFields(
  submitted: Record<string, unknown>,
  live: Record<string, unknown>,
  edited: readonly BreederEditorialField[],
): Record<string, unknown> {
  const result = structuredClone(submitted);
  const dirty = new Set(edited);
  for (const path of BREEDER_EDITORIAL_PATHS) {
    if (dirty.has(path)) continue;
    const value = breederReadPath(live, path);
    // An omitted live field is not evidence that a previously valid field
    // should be removed or replaced with an undefined object property.
    if (value !== undefined) breederSetPath(result, path, value);
  }
  return result;
}
