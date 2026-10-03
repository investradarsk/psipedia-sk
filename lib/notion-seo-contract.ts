import type { EditableSeo } from "./content-seo.ts";
import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";

export const notionSeoPropertyNames = {
  events: {
    title: "SEO title",
    description: "Meta description",
    canonicalUrl: "Canonical URL",
    noindex: "Noindex",
    ogTitle: "OG title",
    ogDescription: "OG popis",
    ogImage: "OG obrázok",
  },
  "help-cases": {
    title: "SEO title",
    description: "SEO popis",
    canonicalUrl: "Canonical URL",
    noindex: "Noindex",
    ogTitle: "OG title",
    ogDescription: "OG popis",
    ogImage: "OG obrázok",
  },
} as const;

export type NotionSeoAgenda = keyof typeof notionSeoPropertyNames;

function clean(value: ReconciliationValue | undefined) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function bool(value: ReconciliationValue | undefined) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function hasOwn(values: Record<string, ReconciliationValue>, name: string) {
  return Object.prototype.hasOwnProperty.call(values, name);
}

export function notionSeoEditableFields(agenda: NotionSeoAgenda) {
  return Object.values(notionSeoPropertyNames[agenda]);
}

export function notionSeoPropertySchema(agenda: NotionSeoAgenda) {
  const fields = notionSeoPropertyNames[agenda];
  return {
    [fields.title]: { rich_text: {} },
    [fields.description]: { rich_text: {} },
    [fields.canonicalUrl]: { url: {} },
    [fields.noindex]: { checkbox: {} },
    [fields.ogTitle]: { rich_text: {} },
    [fields.ogDescription]: { rich_text: {} },
    [fields.ogImage]: { url: {} },
  };
}

export function mergeNotionSeo(
  agenda: NotionSeoAgenda,
  values: Record<string, ReconciliationValue>,
  existing?: EditableSeo | null,
): EditableSeo {
  const fields = notionSeoPropertyNames[agenda];
  const next: EditableSeo = { ...(existing ?? {}) };

  if (hasOwn(values, fields.title)) next.title = clean(values[fields.title]);
  if (hasOwn(values, fields.description)) next.description = clean(values[fields.description]);
  if (hasOwn(values, fields.canonicalUrl)) next.canonicalUrl = clean(values[fields.canonicalUrl]);
  if (hasOwn(values, fields.noindex)) next.noindex = bool(values[fields.noindex]);
  if (hasOwn(values, fields.ogTitle)) next.ogTitle = clean(values[fields.ogTitle]);
  if (hasOwn(values, fields.ogDescription)) next.ogDescription = clean(values[fields.ogDescription]);
  if (hasOwn(values, fields.ogImage)) next.ogImage = clean(values[fields.ogImage]);

  return next;
}

export function notionSeoSourceProperties(
  agenda: NotionSeoAgenda,
  seo: EditableSeo | undefined,
  ogImage: string,
): Record<string, ReconciliationValue> {
  const fields = notionSeoPropertyNames[agenda];
  return {
    [fields.title]: clean(seo?.title),
    [fields.description]: clean(seo?.description),
    [fields.canonicalUrl]: clean(seo?.canonicalUrl),
    [fields.noindex]: seo?.noindex === true,
    [fields.ogTitle]: clean(seo?.ogTitle),
    [fields.ogDescription]: clean(seo?.ogDescription),
    [fields.ogImage]: ogImage,
  };
}
