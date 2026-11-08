/**
 * Podujatia: event-based changes, mirroring the breeder editorial field model.
 * Never confuse a missing / blank Notion property with a deletion request.
 * Publication, slug, photos, Google Place and GEO remain Admin-owned.
 */
export const EVENT_NOTION_EDITORIAL_FIELDS = {
  title: "Názov",
  excerpt: "Perex",
  eventType: "Typ podujatia",
  startDate: "Začiatok",
  startTime: "Čas začiatku",
  endDate: "Koniec",
  endTime: "Čas konca",
  venue: "Miesto",
  city: "Mesto",
  region: "Kraj",
  address: "Adresa",
  organizer: "Organizátor",
  description: "Popis",
  practicalInfo: "Praktické info",
  contactPhone: "Telefón organizátora",
  contactEmail: "E-mail organizátora",
  admissionFee: "Vstupné",
  websiteUrl: "Web",
  registrationUrl: "Registrácia",
  cancelled: "Zrušené",
  "seo.title": "SEO title",
  "seo.description": "SEO popis",
  "seo.focusKeyword": "SEO kľúčové slovo",
  "seo.canonicalUrl": "Canonical URL",
  "seo.ogTitle": "OG title",
  "seo.ogDescription": "OG popis",
  "seo.ogImage": "OG obrázok",
} as const;

export type EventEditorialField = keyof typeof EVENT_NOTION_EDITORIAL_FIELDS;
export const EVENT_EDITORIAL_PATHS = Object.keys(EVENT_NOTION_EDITORIAL_FIELDS) as EventEditorialField[];
export const EVENT_INITIAL_CONTACT_FIELDS: EventEditorialField[] = [
  "contactPhone", "contactEmail", "admissionFee",
];
export const EVENT_GEO_EDITORIAL_FIELDS: EventEditorialField[] = ["venue", "city", "region", "address"];

export function eventReadPath(object: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, object);
}
export function eventAdminChangedFields(
  before: Record<string, unknown>, after: Record<string, unknown>,
): EventEditorialField[] {
  const stable = (value: unknown) => JSON.stringify(value == null ? "" : value);
  return EVENT_EDITORIAL_PATHS.filter(path =>
    stable(eventReadPath(before, path)) !== stable(eventReadPath(after, path)));
}
export function eventNotionChangedFields(
  properties: Record<string, unknown> | undefined, changedPropertyIds: readonly string[],
): EventEditorialField[] {
  const ids = new Set(changedPropertyIds);
  if (!ids.size) return [];
  return EVENT_EDITORIAL_PATHS.filter(path => {
    const name = EVENT_NOTION_EDITORIAL_FIELDS[path];
    const property = properties?.[name] as { id?: unknown } | undefined;
    return ids.has(name) || (typeof property?.id === "string" && ids.has(property.id));
  });
}
export function eventNotionPlainText(property: unknown): string | boolean | null {
  if (!property || typeof property !== "object") return null;
  const obj = property as Record<string, unknown>;
  if (typeof obj.checkbox === "boolean") return obj.checkbox;
  if (typeof obj.url === "string") return obj.url.trim();
  if (typeof obj.email === "string") return obj.email.trim();
  if (typeof obj.phone_number === "string") return obj.phone_number.trim();
  const selected = (obj.select ?? obj.status) as { name?: unknown } | undefined;
  if (typeof selected?.name === "string") return selected.name.trim();
  const date = obj.date as { start?: unknown } | undefined;
  if (typeof date?.start === "string") return date.start.trim();
  const rich = Array.isArray(obj.rich_text) ? obj.rich_text : Array.isArray(obj.title) ? obj.title : null;
  if (rich) {
    if (rich.length >= 25) throw new Error("EVENT_NOTION_RICH_TEXT_INCOMPLETE");
    return rich.map(item => item && typeof item === "object"
      ? String((item as { plain_text?: string; text?: { content?: string } }).plain_text ??
        (item as { text?: { content?: string } }).text?.content ?? "")
      : "").join("").trim();
  }
  return null;
}
export function eventBlankNotionValue(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}
/** Admission and both contacts are copied to newly linked Notion pages even
 * when an Admin save was only a no-op: the initial Notion columns were blank.
 */
export function eventInitialContactBackfill(
  canonical: Record<string, unknown>, remote: Record<string, unknown>,
): EventEditorialField[] {
  return EVENT_INITIAL_CONTACT_FIELDS.filter(path => {
    const name = EVENT_NOTION_EDITORIAL_FIELDS[path];
    return !eventBlankNotionValue(canonical[name]) &&
      eventBlankNotionValue(eventNotionPlainText(remote[name]));
  });
}
export function eventSourcePropertyNames(fields: readonly EventEditorialField[]): string[] {
  return [...new Set(fields.map(field => EVENT_NOTION_EDITORIAL_FIELDS[field]))];
}
