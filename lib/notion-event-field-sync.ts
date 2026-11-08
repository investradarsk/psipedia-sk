import type { DogEvent } from "./events";
import { eventTypes, slovakRegions } from "./events";
import { getManagedEventById, updateManagedEvent } from "./event-store";
import { loadNotionBulkEvents } from "./notion-bulk-sources";
import { notionRequest } from "./notion-sync-shared";
import { notionPageBelongsToDataSource, type NotionOwnedPage } from "./notion-sync-page-ownership";
import { sameNotionProperty } from "./notion-selective-property-patch";
import { hasCurrentGooglePlace } from "./notion-events-help-adapters";
import {
  EVENT_NOTION_EDITORIAL_FIELDS, EVENT_EDITORIAL_PATHS,
  eventInitialContactBackfill, eventNotionChangedFields, eventNotionPlainText,
  eventBlankNotionValue, type EventEditorialField,
} from "./notion-event-field-events";

export type EventFieldSyncBindings = {
  DB?: D1Database;
  NOTION_API_TOKEN?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
};

type EventNotionPage = NotionOwnedPage & {
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};
type PageQuery = { results?: EventNotionPage[]; has_more?: boolean };
type AdminResult = "disabled" | "unlinked" | "synced" | "pending";
const ACTOR = "notion-event-field-sync@psipedia.sk";
const FIELDS = EVENT_NOTION_EDITORIAL_FIELDS;
const SCALARS: Partial<Record<EventEditorialField, string>> = {
  title: "title", excerpt: "excerpt", eventType: "event_type",
  startDate: "start_date", startTime: "start_time", endDate: "end_date",
  endTime: "end_time", organizer: "organizer", description: "description",
  practicalInfo: "practical_info", contactPhone: "contact_phone",
  contactEmail: "contact_email", admissionFee: "admission_fee",
  websiteUrl: "website_url", registrationUrl: "registration_url",
  cancelled: "cancelled",
};
const GEO: Partial<Record<EventEditorialField, keyof DogEvent>> = {
  venue: "venue", city: "city", region: "region", address: "address",
};
const SEO: Partial<Record<EventEditorialField, string>> = {
  "seo.title": "title", "seo.description": "description",
  "seo.focusKeyword": "focusKeyword", "seo.canonicalUrl": "canonicalUrl",
  "seo.ogTitle": "ogTitle", "seo.ogDescription": "ogDescription",
  "seo.ogImage": "ogImage",
};
function enabled(bindings: EventFieldSyncBindings) {
  return bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED === "true" &&
    Boolean(bindings.NOTION_API_TOKEN?.trim()) &&
    Boolean(bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim());
}
function sourceId(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return eventNotionPlainText(value) === null ? "" : String(eventNotionPlainText(value)).trim();
}
function validatePage(
  page: EventNotionPage, dataSourceId: string, source: { id: string; url: string },
): void {
  if (!notionPageBelongsToDataSource(page, dataSourceId))
    throw new Error("EVENT_NOTION_PAGE_OWNERSHIP_MISMATCH");
  if (sourceId(page.properties?.["Psipedia ID"]) !== source.id)
    throw new Error("EVENT_NOTION_IDENTITY_MISMATCH");
  const url = eventNotionPlainText(page.properties?.["URL Psipedia"]);
  if (typeof url === "string" && url && url !== source.url)
    throw new Error("EVENT_NOTION_PUBLIC_URL_MISMATCH");
}
async function loadSource(db: D1Database, eventId: number) {
  const sources = await loadNotionBulkEvents(db, eventId);
  return sources.find(source => source.id === String(eventId)) ?? null;
}
async function mappedPage(db: D1Database, eventId: number) {
  return db.prepare("SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1")
    .bind(eventId).first<{ notion_page_id: string }>();
}
async function resolveEventPage(input: {
  database: D1Database; bindings: EventFieldSyncBindings;
  eventId: number; source: { id: string; url: string }; provided?: EventNotionPage;
}): Promise<EventNotionPage | null> {
  const { database, bindings, eventId, source } = input;
  const dataSourceId = bindings.NOTION_EVENTS_DATA_SOURCE_ID!.trim();
  const mapping = await mappedPage(database, eventId);
  let page: EventNotionPage | null = input.provided ?? null;
  if (page) {
    if (mapping?.notion_page_id && page.id !== mapping.notion_page_id)
      throw new Error("EVENT_NOTION_MAPPING_CONFLICT");
  } else if (mapping?.notion_page_id) {
    page = await notionRequest<EventNotionPage>(bindings,
      "/pages/" + encodeURIComponent(mapping.notion_page_id));
  } else {
    // Recover a preexisting Notion row by exact canonical ID, never by title.
    // This also heals missing D1 mappings without creating a duplicate event.
    const response = await notionRequest<PageQuery>(bindings,
      "/data_sources/" + encodeURIComponent(dataSourceId) + "/query", {
        method: "POST",
        body: JSON.stringify({ page_size: 3,
          filter: { property: "Psipedia ID", rich_text: { equals: String(eventId) } } }),
      });
    if (response.has_more || (response.results?.length ?? 0) > 1)
      throw new Error("EVENT_NOTION_AMBIGUOUS_ID");
    page = response.results?.[0] ?? null;
  }
  if (!page) return null;
  validatePage(page, dataSourceId, source);
  const owner = await database.prepare(
    "SELECT event_id FROM event_notion_sync WHERE notion_page_id=? LIMIT 1",
  ).bind(page.id).first<{ event_id: number }>();
  if (owner && Number(owner.event_id) !== eventId)
    throw new Error("EVENT_NOTION_PAGE_ALREADY_LINKED");
  return page;
}
function encodeNotionValue(value: unknown, old: unknown): Record<string, unknown> | null {
  if (!old || typeof old !== "object") return null;
  const property = old as Record<string, unknown>;
  const type = typeof property.type === "string" ? property.type :
    Object.keys(property).find(key => ["rich_text","title","select","status","date","checkbox","url","email","phone_number"].includes(key));
  const text = value == null ? "" : String(value).trim();
  const rich = [] as Array<{ type: "text"; text: { content: string } }>;
  for (let i = 0; i < text.length; i += 1800)
    rich.push({ type: "text", text: { content: text.slice(i,i+1800) } });
  switch (type) {
    case "rich_text": return { rich_text: rich };
    case "title": return { title: rich };
    case "url": return { url: text || null };
    case "email": return { email: text || null };
    case "phone_number": return { phone_number: text || null };
    case "select": return { select: text ? { name: text } : null };
    case "status": return { status: text ? { name: text } : null };
    case "date": return { date: text ? { start: text } : null };
    case "checkbox": return { checkbox: value === true };
    default: return null;
  }
}
function metadataPatch(page: EventNotionPage, status: "Synchronizované" | "Chyba",
  errors: string[]): Record<string, unknown> {
  const values: Record<string, unknown> = {
    "Sync stav": status,
    "Sync chyba": errors.length ? "EVENT_FIELD_SYNC_PENDING: " + errors.join(",").slice(0,1300) : "",
    "Posledný sync": new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(values)
    .map(([name, value]) => [name, encodeNotionValue(value, page.properties?.[name])])
    .filter((pair): pair is [string, Record<string,unknown>] => Boolean(pair[1])));
}
async function patchOne(bindings: EventFieldSyncBindings, pageId: string,
  property: string, value: Record<string, unknown>): Promise<EventNotionPage> {
  const updated = await notionRequest<EventNotionPage>(bindings,
    "/pages/" + encodeURIComponent(pageId), {
      method: "PATCH", body: JSON.stringify({ properties: { [property]: value } }),
    });
  if (updated.id !== pageId || !updated.properties?.[property] ||
      !sameNotionProperty(updated.properties[property], value))
    throw new Error("EVENT_FIELD_NOTION_WRITE_UNVERIFIED:" + property);
  return updated;
}
async function saveLink(db: D1Database, id: number, page: EventNotionPage) {
  const old = await mappedPage(db, id);
  if (old) {
    if (old.notion_page_id !== page.id) throw new Error("EVENT_NOTION_MAPPING_CONFLICT");
    return;
  }
  const now = new Date().toISOString();
  // A field-event link is NOT a claimed full-profile common editorial baseline.
  // The old record-wide agenda sweep must not use this sentinel as evidence.
  await db.prepare(`INSERT INTO event_notion_sync
    (notion_page_id,event_id,content_hash,notion_last_edited_time,
     psipedia_updated_at,last_synced_at,created_at,updated_at)
    VALUES (?,?,?, ?,NULL,?,?,?) ON CONFLICT DO NOTHING`)
    .bind(page.id,id,"FIELD_EVENTS_NO_GLOBAL_BASELINE",page.last_edited_time ?? null,now,now,now)
    .run();
  const linked = await mappedPage(db,id);
  if (linked?.notion_page_id !== page.id) throw new Error("EVENT_NOTION_MAPPING_RECOVERY_FAILED");
}
function fieldValue(source: { properties: Record<string, unknown> }, field: EventEditorialField) {
  return source.properties[FIELDS[field]];
}
async function createEventNotionPage(input: {
  bindings: EventFieldSyncBindings;
  source: { id: string; url: string; properties: Record<string, unknown> };
}): Promise<EventNotionPage> {
  const dataSourceId = input.bindings.NOTION_EVENTS_DATA_SOURCE_ID!.trim();
  const schema = await notionRequest<{ properties?: Record<string, unknown> }>(
    input.bindings, "/data_sources/" + encodeURIComponent(dataSourceId));
  const properties = schema.properties ?? {};
  const minimal: Record<string, unknown> = {};
  const values: Record<string, unknown> = {
    "Názov": input.source.properties["Názov"],
    "Psipedia ID": input.source.id,
    "URL Psipedia": input.source.url,
  };
  for (const [name, value] of Object.entries(values)) {
    const encoded = encodeNotionValue(value, properties[name]);
    if (!encoded) throw Error("EVENT_NOTION_CREATE_REQUIRED_FIELD_MISSING:" + name);
    minimal[name] = encoded;
  }
  const created = await notionRequest<EventNotionPage>(input.bindings,"/pages",{
    method:"POST", body:JSON.stringify({
      parent:{type:"data_source_id",data_source_id:dataSourceId}, properties:minimal,
    }),
  });
  validatePage(created,dataSourceId,input.source);
  return created;
}
export async function syncEventFieldsFromAdmin(input: {
  database: D1Database; bindings: EventFieldSyncBindings;
  eventId: number; changedFields?: readonly EventEditorialField[];
}): Promise<AdminResult> {
  if (input.bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true" || !enabled(input.bindings))
    return "disabled";
  if (!Number.isSafeInteger(input.eventId) || input.eventId < 1) return "unlinked";
  try {
    const source = await loadSource(input.database, input.eventId);
    if (!source) return "unlinked";
    let page = await resolveEventPage({
      database:input.database,bindings:input.bindings,eventId:input.eventId,source,
    });
    let created = false;
    if (!page) {
      page = await createEventNotionPage({bindings:input.bindings,source});
      created = true;
    }
    const selected = new Set<EventEditorialField>(
      created ? EVENT_EDITORIAL_PATHS : (input.changedFields ?? []));
    for (const path of eventInitialContactBackfill(source.properties, page.properties ?? {}))
      selected.add(path);
    const failed: string[] = [];
    const missing: string[] = [];
    for (const field of EVENT_EDITORIAL_PATHS) {
      if (!selected.has(field)) continue;
      const name = FIELDS[field];
      if (!page.properties?.[name]) { missing.push(name); continue; }
      const encoded = encodeNotionValue(fieldValue(source, field), page.properties[name]);
      if (!encoded) { failed.push(name); continue; }
      try {
        if (sameNotionProperty(page.properties[name], encoded)) continue;
        page = await patchOne(input.bindings, page.id, name, encoded);
      } catch (error) {
        console.error("EVENT_ADMIN_NOTION_FIELD_FAILED",input.eventId,name,error);
        failed.push(name);
      }
    }
    await saveLink(input.database,input.eventId,page);
    const errors = [...failed,...missing];
    const meta = metadataPatch(page, errors.length ? "Chyba" : "Synchronizované", errors);
    try {
      if (Object.keys(meta).length) await notionRequest(input.bindings,
        "/pages/" + encodeURIComponent(page.id), {
          method: "PATCH", body: JSON.stringify({properties:meta}),
        });
    } catch(error) {
      console.error("EVENT_ADMIN_NOTION_METADATA_FAILED",input.eventId,error);
      return "pending";
    }
    return errors.length ? "pending" : "synced";
  } catch(error) {
    console.error("EVENT_ADMIN_NOTION_SYNC_FAILED",input.eventId,error);
    return "pending";
  }
}
function validateInbound(field: EventEditorialField, value: string | boolean): void {
  if (field !== "cancelled" && typeof value !== "string") throw Error("EVENT_FIELD_VALUE_TYPE_INVALID");
  if (field === "contactEmail" && (typeof value !== "string" || value.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw Error("EVENT_EMAIL_INVALID");
  if (field === "contactPhone" && String(value).length > 80) throw Error("EVENT_PHONE_INVALID");
  if (field === "admissionFee" && String(value).length > 160) throw Error("EVENT_ADMISSION_INVALID");
  if (field === "title" && (!String(value).trim() || String(value).length > 200))
    throw Error("EVENT_TITLE_INVALID");
  if (field === "eventType" && !(eventTypes as readonly string[]).includes(String(value)))
    throw Error("EVENT_TYPE_INVALID");
  if (field === "region" && !(slovakRegions as readonly string[]).includes(String(value)))
    throw Error("EVENT_REGION_INVALID");
  if (["startDate","endDate"].includes(field) &&
      !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw Error("EVENT_DATE_INVALID");
  if (String(value).length > 60000) throw Error("EVENT_FIELD_TOO_LONG");
}
async function saveNotionEventField(db: D1Database, eventId: number,
  field: EventEditorialField, value: string | boolean) {
  validateInbound(field,value);
  if (GEO[field]) {
    // Reuse the existing canonical GEO invalidation / reconciliation contract.
    if (await hasCurrentGooglePlace(db,"MANAGED_EVENT",eventId))
      throw Error("EVENT_GOOGLE_PLACE_LOCATION_LOCKED");
    const existing = await getManagedEventById(eventId);
    if (!existing) throw Error("EVENT_CANONICAL_MISSING");
    if (existing[GEO[field]!] === value) return;
    const next = { ...existing, [field]: value };
    if (!await updateManagedEvent(eventId,next,ACTOR,existing))
      throw Error("EVENT_GEO_EDITORIAL_WRITE_FAILED");
    return;
  }
  const scalar = SCALARS[field], seo = SEO[field];
  if (!scalar && !seo) throw Error("EVENT_FIELD_NOT_SUPPORTED");
  // Ignore our own echoed Notion PATCHes: reapplying an unchanged field
  // must never fabricate a new D1 revision or overwrite an Admin edit.
  const readSql = scalar ? scalar : "json_extract(COALESCE(seo_json,'{}'), '$." + seo + "')";
  const old = await db.prepare("SELECT " + readSql + " AS current,updated_at FROM managed_events WHERE id=?")
    .bind(eventId).first<{current:string | number | null; updated_at:string}>();
  if (!old) throw Error("EVENT_CANONICAL_MISSING");
  const v = field === "cancelled" ? (value === true ? 1 : 0) : value;
  if (String(old.current ?? "") === String(v)) return;
  const now = new Date().toISOString();
  const assignment = scalar ? scalar + " = ?" :
    "seo_json = json_set(COALESCE(seo_json,'{}'), ?, ?)";
  const args = scalar ? [v] : ["$." + seo, String(value)];
  const result = await db.prepare("UPDATE managed_events SET " + assignment +
    ", updated_at=?,updated_by=? WHERE id=? AND updated_at=? RETURNING id")
    .bind(...args,now,ACTOR,eventId,old.updated_at).first<{id:number}>();
  if (!result) throw Error("EVENT_FIELD_CONCURRENT_WRITE");
}
export async function syncEventFieldsFromNotionWebhook(input: {
  database:D1Database; bindings:EventFieldSyncBindings;
  page:EventNotionPage; changedPropertyIds:readonly string[];
}): Promise<"processed" | "deferred" | "ignored"> {
  if (!enabled(input.bindings)) return "deferred";
  const rawId = sourceId(input.page.properties?.["Psipedia ID"]);
  if (!/^\d+$/.test(rawId)) return "ignored"; // New Notion drafts use the existing gated importer.
  const eventId = Number(rawId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return "deferred";
  const source = await loadSource(input.database,eventId);
  if (!source) return "deferred";
  const page = await resolveEventPage({
    database:input.database,bindings:input.bindings,eventId,source,provided:input.page,
  });
  if (!page) return "deferred";
  const fields = eventNotionChangedFields(page.properties,input.changedPropertyIds);
  if (!fields.length) return "processed";
  const failures: string[] = [];
  let saved = 0;
  for (const field of fields) {
    const name = FIELDS[field];
    let value: string | boolean | null;
    try { value = eventNotionPlainText(page.properties?.[name]); }
    catch(error) { console.error("EVENT_NOTION_FIELD_INCOMPLETE",eventId,name,error);failures.push(name);continue; }
    // Notion blank is missing, never a delete receipt; continue with other fields.
    if (eventBlankNotionValue(value)) continue;
    try {
      await saveNotionEventField(input.database,eventId,field,value as string|boolean);
      saved++;
    } catch(error) {
      console.error("EVENT_NOTION_CANONICAL_FIELD_FAILED",eventId,name,error);
      failures.push(name);
    }
  }
  await saveLink(input.database,eventId,page);
  const meta = metadataPatch(page,failures.length?"Chyba":"Synchronizované",failures);
  if (saved || failures.length) {
    await notionRequest(input.bindings,"/pages/"+encodeURIComponent(page.id),{
      method:"PATCH", body:JSON.stringify({properties:meta}),
    });
  }
  if (failures.length) throw Error("EVENT_NOTION_FIELDS_PENDING:"+failures.join(","));
  return "processed";
}
