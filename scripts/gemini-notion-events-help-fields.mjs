/**
 * Pure offline category-specific gate for the external Gemini -> Notion worker.
 * Deliberately NOT wired into gemini-notion-agent.mjs (owned by task 06).
 * Accept only runtime-fetched Notion REST property metadata, never an assumed schema.
 * This module neither performs HTTP requests nor creates pages.
 */
import { notionCategoryValue } from "./gemini-notion-category.mjs";

const HELP_CASES = new Set(["docasna-opatera", "zbierky", "dobrovolnictvo"]);
const EVENT_TYPES = new Set(["Výstava", "Preteky", "Seminár", "Tréning", "Stretnutie", "Iné"]);
const DRAFT_EVENT_OPTIONS = ["Nápad", "Na kontrolu"];
const normalize = (v) => String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const text = (v, max = 1800) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const fail = (reason) => { throw new Error("GEMINI_NOTION_CATEGORY_" + reason); };
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const propType = (value) => value?.type === "text" ? "rich_text" : value?.type;
function requireField(schema, name, type) {
  if (!record(schema[name])) fail("FIELD_MISSING_" + name);
  if (propType(schema[name]) !== type) fail("FIELD_TYPE_" + name);
  return schema[name];
}
function optionNames(property) {
  return (property.select?.options ?? property.status?.options ?? property.options ?? []).map(v => v.name);
}
function verifiedHttps(value) {
  if (typeof value !== "string" || value.length > 2048) fail("SOURCE_REQUIRED");
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)?.slice(1).map(Number);
    if (u.protocol !== "https:" || !h.includes(".") || u.username || u.password ||
      /(?:^|\.)(localhost|local|internal)$/.test(h) || /^(?:\[|\d|0x)/.test(h) && !ipv4 ||
      h === "psipedia.sk" || h.endsWith(".psipedia.sk") ||
      h === "vertexaisearch.cloud.google.com" && u.pathname.startsWith("/grounding-api-redirect") ||
      (ipv4 && (ipv4.some(v => v > 255) || ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 ||
        ipv4[0] >= 224 || ipv4[0] === 169 && ipv4[1] === 254 ||
        ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31 ||
        ipv4[0] === 192 && ipv4[1] === 168 ||
        ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127))) fail("SOURCE_UNSAFE");
    return u.href;
  } catch { return fail("SOURCE_UNSAFE"); }
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("EVENT_DATE_INVALID");
  const [y,m,d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y,m-1,d));
  if (y < 2020 || y > 2100 || parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m-1 || parsed.getUTCDate() !== d)
    fail("EVENT_DATE_INVALID");
  return value;
}
const t = (value) => [{ type: "text", text: { content: value } }];
function rich(schema, name, value, required = false) {
  if (!value) { if (required) fail("VALUE_REQUIRED_" + name); return null; }
  requireField(schema, name, "rich_text");
  return { rich_text: t(value) };
}
function url(schema, name, value) {
  if (!value) return null;
  requireField(schema, name, "url");
  return { url: verifiedHttps(value) };
}
function plain(page, key) {
  const p = page?.properties?.[key];
  if (!p) return "";
  if (p.type === "date") return p.date?.start ?? "";
  if (p.type === "url") return p.url ?? "";
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "rich_text" || p.type === "title") return (p[p.type] ?? []).map(v => v.plain_text ?? v.text?.content ?? "").join("");
  return "";
}
/** Never assume duplicate scan is complete. A same-name candidate without enough old
 * identity detail is ambiguous and needs manual review, not a blind new POST.
 */
export function assertNotionEventsHelpUnique({ section, args, rows, scanComplete }) {
  if (scanComplete !== true || !Array.isArray(rows)) fail("DUPLICATE_SCAN_INCOMPLETE");
  const name = normalize(args.name), city = normalize(args.city);
  const start = section === "events" ? date(args.start_date) : "";
  const source = verifiedHttps(args.source_url);
  for (const row of rows) {
    const existing = normalize(plain(row, "Názov"));
    const knownSource = plain(row, "Zdroj dát") || plain(row, "Web");
    const sourceMatch = knownSource && knownSource === source;
    if (sourceMatch && section === "help") fail("DUPLICATE");
    if (existing !== name) continue;
    if (section === "events") {
      const otherDate = plain(row, "Začiatok").slice(0, 10);
      if (!otherDate || otherDate === start || sourceMatch) fail("DUPLICATE_OR_AMBIGUOUS");
    } else {
      const knownCity = normalize(plain(row, "Mesto"));
      if (!city || !knownCity || city === knownCity || sourceMatch) fail("DUPLICATE_OR_AMBIGUOUS");
    }
  }
}
/** Validates exact live Notion schema and returns a draft-only property payload.
 * Unknown select/status options and missing fields are hard failures, not silent omission.
 * Source evidence must be attached to fields by the caller (a URL alone cannot prove a fact).
 */
export function buildNotionEventsHelpDraft({ section, subcategory, args, properties, rows, scanComplete, today }) {
  if (!record(properties) || !record(args)) fail("INPUT_INVALID");
  const category = notionCategoryValue(section, subcategory);
  if (!category || (section === "events" && !EVENT_TYPES.has(category))) fail("CATEGORY_UNKNOWN");
  if (section === "help" && !HELP_CASES.has(subcategory)) fail("HELP_DEDICATED_AGENDA");
  requireField(properties, "Názov", "title");
  const name = text(args.name, 160), summary = text(args.summary, 350), description = text(args.description, 1600);
  if (!name || description.length < 30 || !summary) fail("CONTENT_REQUIRED");
  const source = verifiedHttps(args.source_url);
  if (!Array.isArray(args.evidence) || !args.evidence.length) fail("EVIDENCE_REQUIRED");
  const supported = new Set();
  const fieldsAllowed = section === "events"
    ? ["name", "organizer", "start_date", "end_date", "city", "venue", "description", "website_url", "source_url"]
    : ["name", "description", "contact", "organization", "city", "source_url"];
  const otherSources = args.source_urls === undefined ? [] : args.source_urls;
  if (!Array.isArray(otherSources) || otherSources.length > 7) fail("SOURCES_INVALID");
  const sources = new Set([source, ...otherSources.map(verifiedHttps)]);
  for (const item of args.evidence) {
    if (!record(item) || !Array.isArray(item.fields) || !item.fields.length ||
      !item.fields.every(f => fieldsAllowed.includes(f)) || !sources.has(verifiedHttps(item.source_url)))
      fail("EVIDENCE_INVALID");
    item.fields.forEach(f => supported.add(f));
  }
  const essential = section === "events" ? ["name", "organizer", "start_date", "description", "source_url"] : ["name", "description", "source_url"];
  if (!essential.every(f => supported.has(f))) fail("EVIDENCE_INSUFFICIENT");
  if (section === "events" && !(supported.has("city") || supported.has("venue"))) fail("LOCATION_UNVERIFIED");
  assertNotionEventsHelpUnique({section,args,rows,scanComplete});
  const result = { "Názov": { title: t(name) } };
  const put = (name, value) => { if (value) result[name] = value; };
  put("Perex", rich(properties, "Perex", summary, true));
  put("Popis", rich(properties, "Popis", description, true));
  const city = text(args.city, 120), venue = text(args.venue, 200);
  if (city && !supported.has("city")) fail("CITY_UNVERIFIED");
  if (venue && !supported.has("venue")) fail("VENUE_UNVERIFIED");
  put("Mesto", rich(properties, "Mesto", city));
  put("Miesto", rich(properties, "Miesto", venue));
  if (section === "events") {
    requireField(properties, "Typ podujatia", "rich_text");
    requireField(properties, "Začiatok", "date");
    const status = requireField(properties, "Stav", "select");
    const draft = DRAFT_EVENT_OPTIONS.find(value => optionNames(status).includes(value));
    if (!draft) fail("EVENT_DRAFT_OPTION_MISSING");
    const eventDate = date(args.start_date);
    if (typeof today !== "string" || date(today) > eventDate) fail("EVENT_IN_PAST");
    const organizer = text(args.organizer, 160);
    if (!organizer) fail("ORGANIZER_REQUIRED");
    if (!city && !venue) fail("LOCATION_REQUIRED");
    if (!supported.has("city") && !supported.has("venue")) fail("LOCATION_UNVERIFIED");
    result["Typ podujatia"] = { rich_text: t(category) };
    result["Stav"] = { select: { name: draft } };
    result["Začiatok"] = { date: { start: eventDate } };
    put("Organizátor", rich(properties, "Organizátor", organizer, true));
    const website = text(args.website_url, 2048) || source;
    if (verifiedHttps(website) !== source && !supported.has("website_url")) fail("WEBSITE_UNVERIFIED");
    put("Web", url(properties, "Web", website));
    put("Zdroj dát", url(properties, "Zdroj dát", source));
    if (args.end_date != null && args.end_date !== "") {
      const end = date(args.end_date);
      if (end < eventDate || !supported.has("end_date")) fail("END_DATE_UNVERIFIED");
      requireField(properties, "Koniec", "date");
      result["Koniec"] = { date: { start: end } };
    }
  } else {
    requireField(properties, "Kategória", "rich_text");
    requireField(properties, "Psipedia stav", "rich_text");
    result["Kategória"] = { rich_text: t(category) };
    result["Psipedia stav"] = { rich_text: t("draft") };
    // No Slug: existing help-cases sync requires it for import. A reviewer must approve
    // and assign a collision-free slug first. Source is retained because no source URL field exists.
    result["Popis"] = { rich_text: t(description + "\n\nZdroj: " + [...sources].join("\nZdroj: ")) };
    if (text(args.contact, 300) && !supported.has("contact")) fail("CONTACT_UNVERIFIED");
    put("Kontakt", rich(properties, "Kontakt", text(args.contact, 300)));
    const organization = text(args.organization, 160);
    if (organization && !supported.has("organization")) fail("ORGANIZATION_UNVERIFIED");
    put("Organizácia", rich(properties, "Organizácia", organization));
  }
  return result;
}
