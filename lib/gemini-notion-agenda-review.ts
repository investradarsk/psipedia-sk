import { getGeminiCatalogItem } from "./gemini-automation-catalog";
import { eventTypeFromPortalSlug } from "./events";
import { agendaEditableFields, type BidirectionalAgendaKey } from "./notion-events-help-adapters";
import { acquireGeminiNotionLock } from "./gemini-notion-review-lock";
import { notionRequest, type NotionPage } from "./notion-sync-shared";
import type { GeminiReviewState } from "./gemini-notion-review-state";

/** Review Notion-only drafts without creating a second canonical D1 record. */
export type GeminiAgendaReviewEnv = {
  DB?: D1Database;
  NOTION_API_TOKEN?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
  NOTION_HELP_DATA_SOURCE_ID?: string;
};
type Page = NotionPage & { parent?: { data_source_id?: string }; created_time?: string };
type SourceSchema = { id?: string; parent?: { database_id?: string }; properties?: Record<string, { type?: string; select?: { options?: { name: string }[] } }> };
type SourcePages = { results?: Page[]; has_more?: boolean; next_cursor?: string | null };
export type GeminiAgendaField = {
  name: string; type: string; value: string | number | boolean | null;
  editable: boolean; synced: boolean; options?: string[];
};
export type GeminiAgendaDraft = {
  id: string; stableKey: string; agenda: BidirectionalAgendaKey; name: string;
  city: string; reviewState: GeminiReviewState; syncError: string; rejectionReason: string;
  lastEditedAt: string; notionUrl: string; psipediaId: string; fields: GeminiAgendaField[];
  missingFields: string[]; attribution: "EVIDENCE_SIGNATURE_ONLY";
};
export class GeminiAgendaReviewError extends Error {
  readonly code: "CATEGORY" | "CONFIG" | "NOT_FOUND" | "CONFLICT" | "LOCKED" | "STATE" | "SCHEMA";
  constructor(code: GeminiAgendaReviewError["code"]) {
    super(code);
    this.code = code;
  }
}
const ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const normalized = (value: string) => value.replaceAll("-", "").toLowerCase();
const editableTypes = new Set(["title", "rich_text", "url", "email", "phone_number", "select", "date", "checkbox", "number"]);
const immutable = new Set(["Stav", "Psipedia stav", "Kategória", "Typ podujatia", "Typ", "Zdroj dát", "Zdroj URL", "Zdroj"]);
const lostFoundRestricted = new Set(["Latitude", "Longitude", "Presnosť lokality", "Verejný kontakt", "Miesto"]);
const privateLostFoundPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+\s*421|\b0(?:9|[2-8]))[\s().-]*\d{2,3}[\s().-]*\d{3}[\s.-]*\d{3,4}|\b(?:gps|latitude|longitude|súradnice)\s*[:=]?\s*-?\d{1,3}[.,]\d{3,}|\b(?:ulica|ul\.|adresa|bydlisko|domu|súpisné)\s*[:,-]?\s*[\p{L} .-]+\s+\d{1,4}(?:\/\d+)?\b/iu;
const evidenceTag = (agenda: BidirectionalAgendaKey) =>
  agenda === "adoptions" || agenda === "organizations" ? "Zdroje a dôkazy:" : "Dôkazy:";

export function geminiAgendaForKey(key: string): BidirectionalAgendaKey | null {
  const item = getGeminiCatalogItem(key);
  if (!item || item.section === "directory") return null;
  if (item.section === "events") return "events";
  if (item.subcategory === "utulky") return "organizations";
  if (item.subcategory === "adopcia") return "adoptions";
  if (item.subcategory === "stratene-a-najdene") return "lost-found";
  return "help-cases";
}
function textValue(property: unknown): string | number | boolean | null {
  if (!property || typeof property !== "object") return "";
  const p = property as Record<string, unknown>;
  if (Array.isArray(p.title) || Array.isArray(p.rich_text)) {
    const array = (p.title ?? p.rich_text) as Array<{ plain_text?: string; text?: { content?: string } }>;
    return array.map(item => item.plain_text ?? item.text?.content ?? "").join("");
  }
  if (typeof p.url === "string") return p.url;
  if (typeof p.email === "string") return p.email;
  if (typeof p.phone_number === "string") return p.phone_number;
  if (typeof p.number === "number") return p.number;
  if (typeof p.checkbox === "boolean") return p.checkbox;
  if (p.date && typeof p.date === "object") {
    const date = p.date as { start?: string; end?: string | null };
    return date.end ? (date.start ?? "") + " – " + date.end : date.start ?? "";
  }
  if (p.select && typeof p.select === "object") return (p.select as { name?: string }).name ?? "";
  if (p.status && typeof p.status === "object") return (p.status as { name?: string }).name ?? "";
  if (Array.isArray(p.multi_select)) return p.multi_select.map((entry: { name?: string }) => entry.name ?? "").join(", ");
  if (Array.isArray(p.files)) return p.files.map((entry: { name?: string }) => entry.name ?? "").join(", ");
  if (Array.isArray(p.relation)) return p.relation.map((entry: { id?: string }) => entry.id ?? "").join(", ");
  if (p.formula && typeof p.formula === "object") {
    const formula = p.formula as Record<string, unknown>;
    const answer = formula[typeof formula.type === "string" ? formula.type : "string"];
    if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") return answer;
  }
  return "";
}
const txt = (page: Page, field: string) => String(textValue(page.properties?.[field]) ?? "");
function categoryMatches(page: Page, key: string, agenda: BidirectionalAgendaKey) {
  const item = getGeminiCatalogItem(key);
  if (!item) return false;
  if (agenda === "events") return txt(page, "Typ podujatia") === eventTypeFromPortalSlug(item.subcategory);
  if (agenda === "help-cases") return txt(page, "Kategória") === item.subcategory;
  return true; // dedicated, canonical Notion sources have one agenda each
}
/** The external worker has no common Vytvoril field on these 5 agendas.
 * Never mistake a normal published/mapped Notion record for a reviewable draft.
 * Evidence signatures are temporary conservative attribution; see limitations document.
 */
function identifiable(page: Page, agenda: BidirectionalAgendaKey, sourceId: string, key: string) {
  if (normalized(page.parent?.data_source_id ?? "") !== normalized(sourceId) ||
      !categoryMatches(page, key, agenda)) return false;
  const status = txt(page, agenda === "help-cases" || agenda === "lost-found" ? "Psipedia stav" : "Stav");
  const drafts = agenda === "help-cases" ? ["draft"] : agenda === "lost-found"
    ? ["DRAFT", "PENDING", "ARCHIVED"] : ["Nápad", "Na kontrolu", "Ready", "Koncept", "Archív"];
  if (!drafts.includes(status)) return false;
  const description = txt(page, "Popis");
  return description.includes(evidenceTag(agenda)) && /https:\/\/[^\s]+/.test(description);
}
async function dataSource(env: GeminiAgendaReviewEnv, agenda: BidirectionalAgendaKey) {
  if (!env.NOTION_API_TOKEN) throw new GeminiAgendaReviewError("CONFIG");
  let id = agenda === "events" ? env.NOTION_EVENTS_DATA_SOURCE_ID :
    agenda === "help-cases" ? env.NOTION_HELP_DATA_SOURCE_ID : "";
  if (!id && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT data_source_id FROM notion_agenda_targets WHERE agenda=? LIMIT 1")
        .bind(agenda).first<{ data_source_id: string }>();
      id = row?.data_source_id ?? "";
    } catch { throw new GeminiAgendaReviewError("CONFIG"); }
  }
  if (!id || !ID.test(id)) throw new GeminiAgendaReviewError("CONFIG");
  if (agenda === "lost-found" && normalized(id) !== normalized("3ed793fc-1d18-8122-95b9-000b05c3c6bd"))
    throw new GeminiAgendaReviewError("CONFIG");
  const schema = await notionRequest<SourceSchema>(env, "/data_sources/" + encodeURIComponent(id));
  if (!schema.properties || !schema.id || normalized(schema.id) !== normalized(id))
    throw new GeminiAgendaReviewError("SCHEMA");
  if (agenda === "lost-found" && normalized(schema.parent?.database_id ?? "") !==
      normalized("811d0659-7217-4914-a27c-1cd67bda3e0e"))
    throw new GeminiAgendaReviewError("SCHEMA");
  const title = agenda === "adoptions" ? "Meno" : "Názov";
  const status = agenda === "help-cases" || agenda === "lost-found" ? "Psipedia stav" : "Stav";
  if (schema.properties[title]?.type !== "title" ||
      !schema.properties[status] || !["select", "rich_text"].includes(schema.properties[status].type ?? ""))
    throw new GeminiAgendaReviewError("SCHEMA");
  return { id, schema: schema.properties, title, status };
}
function toDraft(page: Page, key: string, agenda: BidirectionalAgendaKey,
  source: Awaited<ReturnType<typeof dataSource>>): GeminiAgendaDraft {
  const names = agendaEditableFields[agenda].filter(name => !["Stav", "Psipedia stav"].includes(name));
  const supported = names.filter(name => Boolean(source.schema[name]));
  const fields: GeminiAgendaField[] = [
    ...supported.map(name => {
      const definition = source.schema[name];
      const property = page.properties?.[name] as Record<string, unknown> | undefined;
      const fragments = property && (property.rich_text ?? property.title);
      // Native Notion formatting, links, mentions or date ranges cannot be
      // round-tripped losslessly through plain inputs; they stay read-only.
      const structuredText = Array.isArray(fragments) && fragments.some(part => {
        if (!part || typeof part !== "object") return true;
        const entry = part as Record<string, unknown>;
        const annotations = entry.annotations as Record<string, unknown> | undefined;
        return (entry.type && entry.type !== "text") || Boolean(entry.href) ||
          Boolean((entry.text as { link?: unknown } | undefined)?.link) ||
          Boolean(annotations && Object.entries(annotations).some(([key, value]) =>
            key === "color" ? value !== "default" : value === true));
      });
      const dateRange = Boolean((property?.date as { end?: string | null } | undefined)?.end);
      return {
        name, type: definition.type ?? "", value: textValue(property), synced: true,
        options: definition.select?.options?.map(option => option.name),
        editable: !immutable.has(name) &&
          !(agenda === "help-cases" && name === "Slug") &&
          !(agenda === "lost-found" && lostFoundRestricted.has(name)) &&
          !structuredText && !dateRange && editableTypes.has(definition.type ?? ""),
      };
    }),
    ...Object.keys(source.schema).filter(name => !supported.includes(name))
      .map(name => ({
        name, type: source.schema[name].type ?? "",
        value: textValue(page.properties?.[name]),
        editable: false, synced: false,
      })),
  ];
  const status = txt(page, source.status);
  const reviewState: GeminiReviewState = txt(page, "Psipedia ID") ? "IMPORTED"
    : ["Archív", "ARCHIVED"].includes(status) ? "REJECTED"
    : status === "Ready" || status === "PENDING" ? "APPROVED" : "NEW";
  return {
    id: page.id, stableKey: key, agenda, name: txt(page, source.title),
    city: txt(page, "Mesto"), reviewState, syncError: txt(page, "Sync chyba"),
    rejectionReason: "", lastEditedAt: page.last_edited_time ?? "",
    notionUrl: "https://www.notion.so/" + normalized(page.id),
    psipediaId: txt(page, "Psipedia ID"), fields,
    missingFields: names.filter(name => !source.schema[name]),
    attribution: "EVIDENCE_SIGNATURE_ONLY",
  };
}
/** The canonical Notion -> D1 sync mapping can precede Notion's Psipedia ID
 * write-back. Consult its existing mapping table before offering any mutation;
 * otherwise the same Notion page might be reviewed a second time.
 */
async function enrichCanonicalMappings(env: GeminiAgendaReviewEnv, agenda: BidirectionalAgendaKey,
  drafts: GeminiAgendaDraft[]): Promise<GeminiAgendaDraft[]> {
  if (!env.DB) throw new GeminiAgendaReviewError("CONFIG");
  for (let offset = 0; offset < drafts.length; offset += 75) {
    const batch = drafts.slice(offset, offset + 75);
    const placeholders = batch.map(() => "?").join(",");
    const sql = agenda === "events"
      ? "SELECT notion_page_id, event_id AS entity_id FROM event_notion_sync WHERE notion_page_id IN (" + placeholders + ")"
      : "SELECT notion_page_id, entity_id FROM notion_agenda_sync WHERE agenda=? AND notion_page_id IN (" + placeholders + ")";
    const params = agenda === "events" ? batch.map(item => item.id)
      : [agenda, ...batch.map(item => item.id)];
    const rows = await env.DB.prepare(sql).bind(...params).all<{ notion_page_id: string; entity_id: number }>();
    const byPage = new Map((rows.results ?? []).map(row => [normalized(row.notion_page_id), row.entity_id]));
    for (const draft of batch) {
      const mapped = byPage.get(normalized(draft.id));
      if (mapped) {
        draft.psipediaId = String(mapped);
        draft.reviewState = "IMPORTED";
      }
    }
  }
  return drafts;
}

export async function listGeminiAgendaDrafts(env: GeminiAgendaReviewEnv, key: string): Promise<GeminiAgendaDraft[]> {
  const agenda = geminiAgendaForKey(key);
  if (!agenda) throw new GeminiAgendaReviewError("CATEGORY");
  const source = await dataSource(env, agenda);
  let cursor: string | null = null;
  const drafts: GeminiAgendaDraft[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const response = await notionRequest<SourcePages>(env, "/data_sources/" + encodeURIComponent(source.id) + "/query",
      { method: "POST", body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) });
    if (!Array.isArray(response.results) || typeof response.has_more !== "boolean")
      throw new GeminiAgendaReviewError("SCHEMA");
    for (const page of response.results) if (identifiable(page, agenda, source.id, key))
      drafts.push(toDraft(page, key, agenda, source));
    if (!response.has_more) return enrichCanonicalMappings(env, agenda, drafts);
    if (!response.next_cursor || seen.has(response.next_cursor)) throw new GeminiAgendaReviewError("SCHEMA");
    cursor = response.next_cursor;
    seen.add(cursor);
  }
  throw new GeminiAgendaReviewError("CONFIG"); // Incomplete pagination must not look like complete review.
}
export async function getGeminiAgendaDraft(env: GeminiAgendaReviewEnv, key: string, id: string) {
  const agenda = geminiAgendaForKey(key);
  if (!agenda) throw new GeminiAgendaReviewError("CATEGORY");
  if (!ID.test(id)) throw new GeminiAgendaReviewError("NOT_FOUND");
  const source = await dataSource(env, agenda);
  const page = await notionRequest<Page>(env, "/pages/" + encodeURIComponent(id));
  if (!identifiable(page, agenda, source.id, key)) throw new GeminiAgendaReviewError("NOT_FOUND");
  const [draft] = await enrichCanonicalMappings(env, agenda, [toDraft(page, key, agenda, source)]);
  return { draft, page, source };
}
function chunks(value: string) {
  const text = [];
  for (let i = 0; i < value.length; i += 1800)
    text.push({ type: "text", text: { content: value.slice(i, i + 1800) } });
  return text;
}
function encoded(type: string, value: unknown, options: { name: string }[] = []): object {
  if (type === "checkbox") {
    if (typeof value !== "boolean") throw new GeminiAgendaReviewError("STATE");
    return { checkbox: value };
  }
  if (type === "number") {
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value)))
      throw new GeminiAgendaReviewError("STATE");
    return { number: value };
  }
  if (typeof value !== "string" || value.length > 15000) throw new GeminiAgendaReviewError("STATE");
  // Keep intentional whitespace/newlines of edited long text, including
  // inline evidence references. Only URL/enum/email-like scalars are trimmed.
  const v = value.trim();
  if (["title", "rich_text"].includes(type)) return { [type]: chunks(value) };
  if (["url", "email", "phone_number"].includes(type)) {
    if (type === "url" && v) {
      try { const u = new URL(v); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw Error(); }
      catch { throw new GeminiAgendaReviewError("STATE"); }
    }
    return { [type]: v || null };
  }
  if (type === "date") {
    if (v && !/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d)?(?:[+-]\d\d:\d\d|Z)?)?$/.test(v))
      throw new GeminiAgendaReviewError("STATE");
    return { date: v ? { start: v } : null };
  }
  if (type === "select") {
    if (v && !options.some(option => option.name === v)) throw new GeminiAgendaReviewError("SCHEMA");
    return { select: v ? { name: v } : null };
  }
  throw new GeminiAgendaReviewError("SCHEMA");
}
export async function mutateGeminiAgendaDraft(env: GeminiAgendaReviewEnv, key: string, id: string,
  raw: unknown, actor: string) {
  if (!env.DB || !ID.test(id) || !actor) throw new GeminiAgendaReviewError("CONFIG");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new GeminiAgendaReviewError("STATE");
  const input = raw as Record<string, unknown>;
  if (!["save", "approve", "reject", "restore"].includes(String(input.action)))
    throw new GeminiAgendaReviewError("STATE");
  const release = await acquireGeminiNotionLock(env.DB, id);
  if (!release) throw new GeminiAgendaReviewError("LOCKED");
  try {
    const { draft, page, source } = await getGeminiAgendaDraft(env, key, id);
    if (!draft.lastEditedAt || input.lastEditedAt !== draft.lastEditedAt)
      throw new GeminiAgendaReviewError("CONFLICT");
    if (draft.psipediaId) throw new GeminiAgendaReviewError("STATE");
    const action = String(input.action);
    const current = draft.reviewState;
    if (current === "REJECTED" && action !== "restore" ||
        current !== "REJECTED" && action === "restore" ||
        (current === "APPROVED" && action !== "reject"))
      throw new GeminiAgendaReviewError("STATE");
    const patch: Record<string, unknown> = {};
    if (action === "save") {
      const fields = input.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields))
        throw new GeminiAgendaReviewError("STATE");
      const values = fields as Record<string, unknown>;
      const available = new Map(draft.fields.filter(field => field.editable).map(field => [field.name, field]));
      if (!Object.keys(values).length || Object.keys(values).some(name => !available.has(name)))
        throw new GeminiAgendaReviewError("STATE");
      // The agent embeds provenance in the description because these agenda
      // schemas have no dedicated evidence field. A reviewer may edit prose,
      // but must retain the complete original evidence segment verbatim.
      if (typeof values["Popis"] === "string") {
        const original = txt(page, "Popis");
        const marker = evidenceTag(draft.agenda);
        const offset = original.indexOf(marker);
        const evidence = offset < 0 ? "" : original.slice(offset).trim();
        if (!evidence || !values["Popis"].includes(evidence))
          throw new GeminiAgendaReviewError("STATE");
      }
      for (const [name, value] of Object.entries(values)) {
        if (draft.agenda === "lost-found" && typeof value === "string" && privateLostFoundPattern.test(value))
          throw new GeminiAgendaReviewError("STATE");
        const definition = available.get(name)!;
        const options = source.schema[name]?.select?.options ?? [];
        patch[name] = encoded(definition.type, value, options);
      }
      const nextTitle = values[source.title] ?? draft.name;
      if (typeof nextTitle !== "string" || !nextTitle.trim()) throw new GeminiAgendaReviewError("STATE");
    } else {
      if (input.confirm !== true) throw new GeminiAgendaReviewError("STATE");
      // Help-cases uses draft/published as a PUBLICATION gate, not a review
      // decision. Never convert an approval click into an automatic public post,
      // or invent an unrecognized rejection state. A separate contract is needed.
      if (draft.agenda === "help-cases") throw new GeminiAgendaReviewError("SCHEMA");
      if (action === "approve" && !draft.name.trim()) throw new GeminiAgendaReviewError("STATE");
      if (action === "approve" && !draft.fields.some(field =>
        field.name === "Slug" && typeof field.value === "string" && field.value.trim()))
        throw new GeminiAgendaReviewError("STATE");
      const target = action === "approve"
        ? draft.agenda === "lost-found" ? "PENDING" : "Ready"
        : action === "reject" ? draft.agenda === "lost-found" ? "ARCHIVED" : "Archív"
        : draft.agenda === "lost-found" ? "DRAFT" : "Na kontrolu";
      patch[source.status] = encoded(source.schema[source.status].type ?? "", target,
        source.schema[source.status].select?.options ?? []);
    }
    // Notion REST has no CAS for page properties; re-read immediately under
    // cross-isolate D1 lock, then fail closed on a transport-uncertain PATCH.
    const latest = await notionRequest<Page>(env, "/pages/" + encodeURIComponent(id));
    if (latest.last_edited_time !== draft.lastEditedAt || !identifiable(latest, draft.agenda, source.id, key))
      throw new GeminiAgendaReviewError("CONFLICT");
    await notionRequest(env, "/pages/" + encodeURIComponent(id), {
      method: "PATCH", body: JSON.stringify({ properties: patch }),
    }, { retryTransient: false });
    const next = await getGeminiAgendaDraft(env, key, id);
    await release();
    return next.draft;
  } catch (error) {
    // Do not release on ambiguous transport failure: requires an operator check.
    if (error instanceof GeminiAgendaReviewError) await release();
    throw error;
  }
}
