import { commitHelpV2AdminEdit } from "./notion-help-v2-admin-receipts.ts";
import type { AdoptionD1Database, AdoptionD1Statement } from "./adoption-store.ts";
import type { FieldObservation } from "./notion-unified-field-sync.ts";

export const ESHOP_V2_FIELDS = {
  name: "Názov",
  websiteUrl: "Web",
  description: "Popis",
  sourceUrl: "Zdroj",
  focusTags: "Zameranie",
  logoUrl: "Logo URL",
} as const;
export type EshopV2Field = keyof typeof ESHOP_V2_FIELDS;

export function observeEshopV2Property(properties: Record<string, unknown> | undefined, field: EshopV2Field): FieldObservation {
  const property = properties?.[ESHOP_V2_FIELDS[field]] as Record<string, unknown> | undefined;
  if (!property) return { present: false };
  const type = field === "name" ? "title" : field === "description" ? "rich_text" : field === "focusTags" ? "multi_select" : "url";
  if (property.type !== type) return { present: false };
  const raw = property[type];
  if (type === "url") return raw === null || typeof raw === "string"
    ? { present: true, value: typeof raw === "string" ? raw.trim() : "" } : { present: false };
  if (!Array.isArray(raw) || raw.length >= 25) return { present: false };
  if (type === "multi_select") {
    if (raw.length > 12 || raw.some(item => typeof item?.name !== "string" || !item.name.trim())) return { present: false };
    const tags = raw.map(item => item.name.trim());
    if (new Set(tags.map(tag => tag.toLocaleLowerCase("sk-SK"))).size !== tags.length) return { present: false };
    return { present: true, value: tags };
  }
  if (raw.some(item => typeof item?.plain_text !== "string")) return { present: false };
  return { present: true, value: raw.map(item => item.plain_text).join("").replace(/\r\n?/g, "\n").trim() };
}

const clean = (column: string) => "trim(replace(replace(COALESCE(p."+column+",''),char(13)||char(10),char(10)),char(13),char(10)))";
const logo = clean("logo_url");
const projection = "json_object('name',"+clean("name")+",'websiteUrl',"+clean("website_url")+
  ",'description',"+clean("description")+",'sourceUrl',"+clean("source_url")+
  ",'focusTags',json(CASE WHEN json_valid(p.focus_tags_json) THEN p.focus_tags_json ELSE 'null' END)"+
  ",'logoUrl',CASE WHEN substr("+logo+",1,1)='/' THEN 'https://psipedia.sk'||"+logo+" ELSE "+logo+" END)";

export function commitEshopV2AdminEdit(database: D1Database, statement: D1PreparedStatement, input: {
  id: number; expectedRevision: string; nextRevision: string; editor: string;
}) {
  return commitHelpV2AdminEdit(database as unknown as AdoptionD1Database, statement as unknown as AdoptionD1Statement, {
    ...input, agenda: "eshops", table: "managed_eshops", projection,
  });
}
