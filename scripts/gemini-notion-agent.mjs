import { buildShelterDraft, assertShelterSchema } from "./gemini-notion-shelter-fields.mjs";
import { buildAdoptionDraft, assertAdoptionSchema } from "./gemini-notion-adoption-fields.mjs";
import { buildLostFoundDraft, assertLostFoundSchema, assertLostFoundTarget } from "./gemini-notion-lost-found-fields.mjs";
import { buildNotionEventsHelpDraft } from "./gemini-notion-events-help-fields.mjs";
import { externalWorkerCategorySupported } from "./gemini-notion-category.mjs";
import { canonicalIdentityUrl, directoryDuplicate, sameDirectoryIdentity } from "./gemini-notion-identity.mjs";
import { GEMINI_REQUEST_LIMIT, geminiHttpCode, inspectInteraction } from "./gemini-interactions-contract.mjs";
import { parseNoDraftOutcome, requiresNoDraftRecovery } from "./gemini-search-outcome.mjs";
/**
 * Independent Gemini research worker. Runs ONLY inside GitHub Actions.
 * No Psipedia database logic or Cloudflare runtime required.
 * Notion Free API is the sole database; writes are drafts only.
 */
import { createHmac } from "node:crypto";
import { notionCategoryValue } from "./gemini-notion-category.mjs";
import { directoryProfileValues, hasMinimumVeterinarianContact } from "./gemini-notion-directory-fields.mjs";

const env = process.env;
const jobId = Number(env.AGENT_JOB_ID);
const stableKey = env.AGENT_STABLE_KEY ?? "";
const maxNew = Math.min(5, Number(env.AGENT_MAX_NEW_CONCEPTS));
const metrics = { concept_count: 0, duplicate_count: 0, request_count: 0, search_count: 0 };
const pageIds = [];
let researchSources = new Set();
const confirmedDrafts = [];
const bratislavaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const AGENT_TURNS_LIMIT = 7; // Seven continuations after research + first function turn = nine requests.
const NOTION_VERSION = "2025-09-03";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (s) => String(s ?? "").normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const trim = (value, max = 1800) => typeof value === "string" ? value.trim().slice(0, max) : "";

function category() {
  if (!/^(directory|events|help)\.[a-z0-9-]+$/.test(stableKey))
    throw Error("INVALID_CATEGORY");
  if (!externalWorkerCategorySupported(stableKey)) throw Error("CATEGORY_UNSUPPORTED");
  const [section, subcategory] = stableKey.split(".");
  const ids = {
    directory: env.NOTION_DIRECTORY_DATA_SOURCE_ID,
    events: env.NOTION_EVENTS_DATA_SOURCE_ID,
    help: subcategory === "utulky" ? env.NOTION_ORGANIZATIONS_DATA_SOURCE_ID : subcategory === "adopcia" ? env.NOTION_ADOPTIONS_DATA_SOURCE_ID : subcategory === "stratene-a-najdene" ? env.NOTION_LOST_FOUND_DATA_SOURCE_ID : env.NOTION_HELP_DATA_SOURCE_ID,
  };
  const dataSourceId = ids[section];
  if (!dataSourceId || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId))
    throw Error("NOTION_DATA_SOURCE_MISSING");
  if (section === "help" && subcategory === "stratene-a-najdene") assertLostFoundTarget(dataSourceId);
  const categoryValue = notionCategoryValue(section, subcategory);
  if (!categoryValue) throw Error("INVALID_CATEGORY");
  return { section, subcategory, categoryValue, dataSourceId, dedicatedShelter: section === "help" && subcategory === "utulky", dedicatedAdoption: section === "help" && subcategory === "adopcia", dedicatedLostFound: section === "help" && subcategory === "stratene-a-najdene" };
}

async function notion(path, method = "GET", body) {
  const isCreate = path === "/pages" && method === "POST";
  let response;
  try {
    response = await fetch("https://api.notion.com/v1" + path, {
      method,
      headers: {
        Authorization: "Bearer " + env.AGENT_NOTION_ACCESS_TOKEN,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // A timed-out/aborted create may have succeeded. Never automatically POST again.
    throw Error(isCreate ? "NOTION_CREATE_UNCERTAIN" : "NOTION_NETWORK_ERROR");
  }
  if (!response.ok) {
    if (isCreate && response.status >= 500) throw Error("NOTION_CREATE_UNCERTAIN");
    if (response.status === 429) throw Error("NOTION_RATE_LIMIT");
    throw Error("NOTION_HTTP_" + response.status);
  }
  try {
    return await response.json();
  } catch {
    throw Error(isCreate ? "NOTION_CREATE_UNCERTAIN" : "NOTION_INVALID_RESPONSE");
  }
}

function pageText(page, propertyName) {
  const property = page.properties?.[propertyName];
  if (!property) return "";
  if (property.type === "title") return (property.title ?? []).map((v) => v.plain_text ?? v.text?.content ?? "").join("");
  if (property.type === "rich_text") return (property.rich_text ?? []).map((v) => v.plain_text ?? v.text?.content ?? "").join("");
  if (property.type === "url") return property.url ?? "";
  if (property.type === "date") return property.date?.start ?? "";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "status") return property.status?.name ?? "";
  return "";
}

async function notionSnapshot(dataSourceId, section = "directory") {
  const metadata = await notion("/data_sources/" + encodeURIComponent(dataSourceId));
  const properties = metadata.properties ?? {};
  if (properties[section === "adoptions" ? "Meno" : "Názov"]?.type !== "title") throw Error("NOTION_TITLE_SCHEMA_MISSING");
  if (typeof metadata.id !== "string" || metadata.id.replaceAll("-", "").toLowerCase() !== dataSourceId.replaceAll("-", "").toLowerCase())
    throw Error("NOTION_TARGET_MISMATCH");
  if (section === "lost-found") {
    assertLostFoundTarget(dataSourceId, metadata);
    assertLostFoundSchema(properties);
  } else if (section === "adoptions") {
    assertAdoptionSchema(properties);
  } else if (section === "shelters") {
    assertShelterSchema(properties);
  } else if (section === "events" || section === "help") {
    const expected = section === "events"
      ? { "Typ podujatia": "rich_text", "Začiatok": "date", "Organizátor": "rich_text", "Stav": "select", "Web": "url", "Zdroj dát": "url" }
      : { "Kategória": "rich_text", "Psipedia stav": "rich_text" };
    for (const [name, type] of Object.entries({ ...expected, "Perex": "rich_text", "Popis": "rich_text" }))
      if (properties[name]?.type !== type) throw Error("NOTION_CATEGORY_SCHEMA_INVALID");
    // Additional editorial gates are not part of these audited contracts.
    if (section === "events" ? properties["Psipedia stav"] : properties.Stav)
      throw Error("NOTION_CATEGORY_SCHEMA_INVALID");
    if (section === "events" && !properties.Stav.select?.options?.some(v => ["Nápad", "Na kontrolu"].includes(v.name)))
      throw Error("NOTION_DRAFT_OPTION_MISSING");
  } else {
    const statusName = properties["Psipedia stav"] ? "Psipedia stav" : (properties.Stav ? "Stav" : "");
    if (!statusName) throw Error("NOTION_DRAFT_SCHEMA_MISSING");
    const schema = properties[statusName];
    if (!["select", "status"].includes(schema.type)) throw Error("NOTION_DRAFT_SCHEMA_INVALID");
    if (!["Koncept", "Nápad", "Na kontrolu", "Ready"].some(name => schema[schema.type]?.options?.some(v => v.name === name)))
      throw Error("NOTION_DRAFT_OPTION_MISSING");
  }
  const rows = [];
  let cursor = null;
  const cursors = new Set();
  for (let i = 0; i < 35; i++) {
    const result = await notion("/data_sources/" + encodeURIComponent(dataSourceId) + "/query",
      "POST", { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    if (!Array.isArray(result.results) || typeof result.has_more !== "boolean" ||
        result.results.some(row => !row?.id || !row.properties || row.properties[section === "adoptions" ? "Meno" : "Názov"]?.type !== "title" ||
          Object.values(row.properties).some(property => property?.has_more === true) ||
          row.parent?.data_source_id && row.parent.data_source_id.replaceAll("-", "").toLowerCase() !== dataSourceId.replaceAll("-", "").toLowerCase() ||
          section === "lost-found" && (!row.parent?.data_source_id || row.parent.data_source_id.replaceAll("-", "").toLowerCase() !== dataSourceId.replaceAll("-", "").toLowerCase())))
      throw Error("NOTION_SCAN_INVALID");
    rows.push(...result.results);
    if (!result.has_more) return { rows, properties, scanComplete: true };
    cursor = result.next_cursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor)) throw Error("NOTION_CURSOR_INVALID");
    cursors.add(cursor);
    await sleep(350);
  }
  // Don't create a concept when duplicate coverage is incomplete.
  throw Error("NOTION_SCAN_INCOMPLETE");
}

function textValue(value) {
  return [{ type: "text", text: { content: trim(value) } }];
}
function chooseProperty(schema, value) {
  if (!schema || value === undefined || value === null || !String(value).trim()) return null;
  if (schema.type === "title") return { title: textValue(value) };
  if (schema.type === "rich_text") return { rich_text: textValue(value) };
  if (schema.type === "url") {
    try { return new URL(value).protocol === "https:" ? { url: value } : null; }
    catch { return null; }
  }
  if (schema.type === "email") return { email: value };
  if (schema.type === "phone_number") return { phone_number: value };
  if (schema.type === "select") {
    const match = (schema.select?.options ?? []).find((x) => normalize(x.name) === normalize(value));
    if (match) return { select: { name: match.name } };
  }
  if (schema.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return { date: { start: value } };
  return null;
}
function httpsUrl(value) {
  try { const parsed = new URL(value); return parsed.protocol === "https:" ? parsed.toString() : ""; }
  catch { return ""; }
}
function isDuplicate(rows, name, city, website, source) {
  const title = normalize(name);
  const town = normalize(city);
  const url = normalize(website || source);
  return rows.some((page) => {
    const known = normalize(pageText(page, "Názov"));
    const knownCity = normalize(pageText(page, "Mesto"));
    const web = normalize(pageText(page, "Web") || pageText(page, "Zdroj dát") || pageText(page, "Zdroj URL"));
    return (title && known === title && (town === knownCity || !town || !knownCity)) ||
      (url && web && web === url);
  });
}
function notionSearch(rows, query, target) {
  const q = normalize(query);
  if (target.dedicatedLostFound) {
    return rows.filter(page => !q || [
      pageText(page,"Názov"),pageText(page,"Meno psa"),pageText(page,"Mesto"),
      pageText(page,"Rozlišovacie znaky"),pageText(page,"Zdroj URL"),
    ].some(value => normalize(value).includes(q))).slice(0,50).map(page => ({
      title: pageText(page,"Názov"), type:pageText(page,"Typ"),
      dog_name:pageText(page,"Meno psa"), city:pageText(page,"Mesto"),
      distinguishing_marks:pageText(page,"Rozlišovacie znaky"),
      event_date:pageText(page,"Dátum udalosti"),
      state:pageText(page,"Psipedia stav"), source:pageText(page,"Zdroj URL"),
    }));
  }
  return rows.filter((page) => {
    if (!q) return true;
    return [pageText(page, "Názov") || pageText(page, "Meno"), pageText(page, "Organizácia"), pageText(page, "Mesto"),
      pageText(page, "Web"), pageText(page, "Zdroj dát")]
      .some((value) => normalize(value).includes(q));
  }).slice(0, 50).map((page) => ({
    title: pageText(page, "Názov") || pageText(page, "Meno"),
    city: pageText(page, "Mesto"),
    website: pageText(page, "Web"),
    state: pageText(page, "Psipedia stav") || pageText(page, "Stav"),
    category: pageText(page, "Typ podujatia") || pageText(page, "Kategória"),
    start_date: pageText(page, "Začiatok"),
    organizer: pageText(page, "Organizátor") || pageText(page, "Organizácia"),
    source: pageText(page, "Zdroj dát"),
  }));
}

async function createDraft(args, snapshot, target) {
  if (metrics.concept_count >= maxNew) return { status: "limit_reached" };
  if (target.dedicatedLostFound) {
    // Always read *all* pages from the independently verified canonical source immediately before POST.
    const fresh = await notionSnapshot(target.dataSourceId, "lost-found");
    let properties;
    try {
      properties = buildLostFoundDraft({
        args, ...fresh, rows: [...fresh.rows, ...confirmedDrafts],
        groundedSources: [...researchSources], today: bratislavaToday(),
      });
    } catch (error) {
      if (error?.message === "GEMINI_LOST_FOUND_DUPLICATE_OR_AMBIGUOUS") {
        metrics.duplicate_count++;
        return { status: "duplicate" };
      }
      throw Error("NOTION_LOST_FOUND_CONTRACT_INVALID");
    }
    // A Notion create may succeed despite timeout/HTTP 5xx. Existing notion() never retries POST.
    const created = await notion("/pages", "POST", {
      parent: { type: "data_source_id", data_source_id: target.dataSourceId }, properties,
    });
    if (typeof created?.id !== "string" || !created.id) throw Error("NOTION_CREATE_UNCERTAIN");
    confirmedDrafts.push({ id: created.id, parent: { type: "data_source_id", data_source_id: target.dataSourceId },
      properties: Object.fromEntries(Object.entries(properties)
        .map(([key, value]) => [key, { type: Object.keys(value)[0], ...value }])) });
    snapshot.rows = [...fresh.rows, ...confirmedDrafts];
    metrics.concept_count++;
    pageIds.push(created.id);
    return { status: "created", notion_page_id: created.id };
  }
  if (target.dedicatedAdoption) {
    const fresh = await notionSnapshot(target.dataSourceId, "adoptions");
    let properties;
    try {
      properties = buildAdoptionDraft({
        args, ...fresh, rows: [...fresh.rows, ...confirmedDrafts],
        groundedSources: [...researchSources],
      });
    } catch (error) {
      if (error.message === "GEMINI_ADOPTION_DUPLICATE_OR_AMBIGUOUS") {
        metrics.duplicate_count++;
        return { status: "duplicate" };
      }
      throw Error("NOTION_ADOPTION_CONTRACT_INVALID");
    }
    const created = await notion("/pages", "POST", {
      parent: { type: "data_source_id", data_source_id: target.dataSourceId }, properties,
    });
    if (!created?.id || typeof created.id !== "string") throw Error("NOTION_CREATE_UNCERTAIN");
    confirmedDrafts.push({ id: created.id, properties: Object.fromEntries(Object.entries(properties)
      .map(([key, value]) => [key, { type: Object.keys(value)[0], ...value }])) });
    snapshot.rows = [...fresh.rows, ...confirmedDrafts];
    metrics.concept_count++;
    pageIds.push(created.id);
    return { status: "created", notion_page_id: created.id };
  }
  if (target.dedicatedShelter) {
    const fresh = await notionSnapshot(target.dataSourceId, "shelters");
    let properties;
    try {
      properties = buildShelterDraft({ args, ...fresh, rows: [...fresh.rows, ...confirmedDrafts], groundedSources: [...researchSources] });
    } catch (error) {
      if (error.message === "GEMINI_SHELTER_DUPLICATE_OR_AMBIGUOUS") {
        metrics.duplicate_count++;
        return { status: "duplicate" };
      }
      throw Error("NOTION_SHELTER_CONTRACT_INVALID");
    }
    const created = await notion("/pages", "POST", { parent: { type: "data_source_id", data_source_id: target.dataSourceId }, properties });
    if (!created?.id || typeof created.id !== "string") throw Error("NOTION_CREATE_UNCERTAIN");
    confirmedDrafts.push({id:created.id, properties:Object.fromEntries(Object.entries(properties).map(([key,value])=>[key,{type:Object.keys(value)[0],...value}]))});
    snapshot.rows=[...fresh.rows,...confirmedDrafts];
    metrics.concept_count++;
    pageIds.push(created.id);
    return { status:"created", notion_page_id:created.id };
  }
  if (target.section === "events" || target.section === "help") {
    const sourceList = [args.source_url, ...(Array.isArray(args.source_urls) ? args.source_urls : [])];
    if (sourceList.some(url => !researchSources.has(httpsUrl(url)))) throw Error("GEMINI_SOURCE_NOT_GROUNDED");
    const fresh = await notionSnapshot(target.dataSourceId, target.section);
    let properties;
    try {
      properties = buildNotionEventsHelpDraft({ ...target, args, ...fresh,
        rows: [...fresh.rows, ...confirmedDrafts], today: bratislavaToday() });
    } catch (error) {
      if (/^GEMINI_NOTION_CATEGORY_DUPLICATE(?:_OR_AMBIGUOUS)?$/.test(error.message)) {
        metrics.duplicate_count++;
        return { status: "duplicate" };
      }
      // Helper reasons contain field names; never leak them or raw provider data.
      throw Error("NOTION_CATEGORY_CONTRACT_INVALID");
    }
    const created = await notion("/pages", "POST", {
      parent: { type: "data_source_id", data_source_id: target.dataSourceId }, properties,
    });
    if (typeof created.id !== "string" || !created.id) throw Error("NOTION_CREATE_UNCERTAIN");
    const confirmed = { id: created.id, properties: Object.fromEntries(Object.entries(properties)
      .map(([name, value]) => [name, { type: Object.keys(value)[0], ...value }])) };
    confirmedDrafts.push(confirmed);
    snapshot.rows = [...fresh.rows, ...confirmedDrafts];
    metrics.concept_count++;
    pageIds.push(created.id);
    return { status: "created", notion_page_id: created.id };
  }
  const name = trim(args.name, 180);
  const city = trim(args.city, 100);
  const source = httpsUrl(args.source_url);
  const website = httpsUrl(args.website_url);
  if (!name || !source) return { status: "rejected", reason: "name_and_https_source_required" };
  if (target.section === "events" && !/^\d{4}-\d{2}-\d{2}$/.test(trim(args.start_date, 10))) {
    return { status: "rejected", reason: "verified_event_date_required" };
  }
  if (target.section === "directory") {
    const fresh = await notionSnapshot(target.dataSourceId);
    snapshot.rows = [...fresh.rows, ...confirmedDrafts];
  }
  if (target.section === "directory" ? directoryDuplicate(snapshot.rows, { name, city, website, source, phone: args.phone, email: args.email })
    : isDuplicate(snapshot.rows, name, city, website, source)) {
    metrics.duplicate_count++;
    return { status: "duplicate" };
  }
  const values = {
    "Názov": name,
    "Mesto": city,
    "Kategória": target.categoryValue,
    "Typ podujatia": target.categoryValue,
    "Typ": target.categoryValue,
    "Web": website || (target.section === "events" ? source : ""),
    "Zdroj dát": source,
    "Zdroj URL": source,
    "Popis": trim(args.description, 1600),
    "Perex": trim(args.summary, 350),
    "Miesto": trim(args.venue, 200),
    "Začiatok": trim(args.start_date, 10),
    "Kontakt": trim(args.contact, 300),
    ...(target.section === "directory" ? { "Vytvoril": "Gemini automatizácia" } : {}),
    ...(target.section === "directory" ? directoryProfileValues(args) : {}),
  };
  const properties = {};
  for (const [key, value] of Object.entries(values)) {
    const encoded = chooseProperty(snapshot.properties[key], value);
    if (encoded) properties[key] = encoded;
  }
  // Fail closed if the configured category cannot be recorded in Notion.
  const categoryField = target.section === "events" ? "Typ podujatia" : "Kategória";
  if (snapshot.properties[categoryField] && !properties[categoryField]) {
    return { status: "rejected", reason: "notion_category_option_missing" };
  }
  // Require usable, directly verified contact details for veterinarians.
  // Otherwise the agent would create another nearly empty profile.
  if (target.section === "directory" && target.subcategory === "veterinari" &&
      !hasMinimumVeterinarianContact(properties)) {
    return { status: "rejected", reason: "insufficient_verified_contact_details" };
  }
  // Keep an evidence URL even when a source URL property is absent.
  if (!properties["Zdroj dát"] && !properties["Zdroj URL"] &&
      snapshot.properties["Popis"]?.type === "rich_text") {
    properties["Popis"] = { rich_text: textValue(
      (trim(args.description, 1400) + "\nZdroj: " + source).trim()
    ) };
  }
  // Notion workspaces may have two distinct publication gates. Set BOTH to
  // explicit draft values; never inherit a potentially published default.
  for (const statusKey of ["Psipedia stav", "Stav"]) {
    const schema = snapshot.properties[statusKey];
    if (!schema) continue;
    if (!["select", "status"].includes(schema.type)) throw Error("NOTION_DRAFT_SCHEMA_INVALID");
    const options = schema[schema.type]?.options ?? [];
    const draftName = ["Koncept", "Nápad", "Na kontrolu", "Ready"]
      .find(name => options.some(option => option.name === name));
    if (!draftName) throw Error("NOTION_DRAFT_OPTION_MISSING");
    properties[statusKey] = schema.type === "status"
      ? { status: { name: draftName } } : { select: { name: draftName } };
  }
  const created = await notion("/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: target.dataSourceId },
    properties,
  });
  if (typeof created?.id !== "string" || !created.id) throw Error("NOTION_CREATE_UNCERTAIN");
  const confirmed = { id: created.id, properties: Object.fromEntries(Object.entries(properties)
    .map(([key, value]) => [key, { type: Object.keys(value)[0], ...value }])) };
  confirmedDrafts.push(confirmed);
  snapshot.rows.push(confirmed);
  metrics.concept_count++;
  pageIds.push(created.id);
  return { status: "created", notion_page_id: created.id };
}

const tools = [
  { type: "google_search" },
  {
    type: "function", name: "search_notion",
    description: "Search existing Notion concepts and profiles for duplicates before making a new draft. Query can be empty to inspect examples.",
    parameters: {
      type: "object", properties: {
        query: { type: "string", description: "Business or event name, city or website; empty for a sample." },
      }, required: ["query"],
    },
  },
  {
    type: "function", name: "create_notion_draft",
    description: "Create a new DRAFT page in Notion after verifying public sources and checking duplicates. Never publish.",
    parameters: {
      type: "object", properties: {
        name: { type: "string" },
        city: { type: "string" },
        source_url: { type: "string", description: "Public HTTPS source proving the entity/event exists." },
        website_url: { type: "string" },
        description: { type: "string" },
        summary: { type: "string" },
        venue: { type: "string" },
        start_date: { type: "string", description: "Event date YYYY-MM-DD, if verified." },
        report_type: { type: "string", enum: ["STRATENÝ", "NÁJDENÝ"], description: "Lost/Found case type, only for help.stratene-a-najdene." },
        report_status: { type: "string", enum: ["OPEN"], description: "Source explicitly confirms the report is still open." },
        dog_name: { type: "string", description: "Dog's verified name, if known." },
        sex: { type: "string" },
        breed: { type: "string" },
        color: { type: "string" },
        size: { type: "string" },
        distinguishing_marks: { type: "string" },
        collar_description: { type: "string" },
        event_date: { type: "string", description: "Verified incident date YYYY-MM-DD." },
        verified_at: { type: "string", description: "Date of positive confirmation that report is still OPEN, YYYY-MM-DD." },
        organizer: { type: "string" },
        organization: { type: "string" },
        legal_name: { type: "string" },
        registration_number: { type: "string" },
        end_date: { type: "string" },
        start_time: { type: "string", description: "Verified local event time HH:MM (Europe/Bratislava)." },
        end_time: { type: "string" },
        source_urls: { type: "array", items: { type: "string" } },
        evidence: { type: "array", items: { type: "object", properties: {
          source_url: { type: "string" }, fields: { type: "array", items: { type: "string" } },
        }, required: ["source_url", "fields"] } },
        contact: { type: "string" },
        phone: { type: "string", description: "Verified public business phone from primary source (e.g. +421...). Never guess." },
        email: { type: "string", description: "Verified public business email. No personal/internal emails." },
        address: { type: "string", description: "Verified full public visitor address, including street and house number where available." },
        street: { type: "string" },
        house_number: { type: "string" },
        postal_code: { type: "string" },
        district: { type: "string" },
        region: { type: "string" },
        facebook_url: { type: "string", description: "Verified official Facebook profile URL." },
        instagram_url: { type: "string", description: "Verified official Instagram profile URL." },
        services: { type: "string", description: "Specific publicly evidenced business services." },
        qualifications: { type: "string", description: "Only publicly evidenced qualifications/certifications." },
        logo_url: { type: "string", description: "Direct HTTPS link to the official organisation logo image file on its own website, ending .png/.jpg/.jpeg/.webp/.gif/.svg. Not a page or Google image URL. Leave empty if unverified." },
        image_url: { type: "string", description: "Direct HTTPS link to an official cover photograph image file on organisation website; not a search result or page." },
        image_alt: { type: "string", description: "Truthful alt text for the verified cover photo." },
      }, required: ["name", "source_url"],
    },
  },
];

// Interactions REST v1beta: turn-scoped tools must be supplied on every call.
// Split Google Search from custom functions to avoid the provider's Preview
// mixed-tool TOOLS/timeout failure. previous_interaction_id retains grounded context.
const searchTools = [{ type: "google_search" }];
const functionTools = tools.filter(tool => tool.type === "function");

async function gemini(payload, phase) {
  if (metrics.request_count >= GEMINI_REQUEST_LIMIT) throw Error("GEMINI_REQUEST_LIMIT");
  metrics.request_count++;
  let response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": env.AGENT_GEMINI_ACCESS_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: env.GEMINI_MODEL || "gemini-3.8-flash", ...payload }),
      signal: AbortSignal.timeout(phase === "research" ? 150000 : 90000),
    });
  } catch (error) {
    throw Error(error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "GEMINI_TIMEOUT" : "GEMINI_NETWORK_ERROR");
  }
  if (!response.ok) {
    let providerError = null;
    if (response.status === 400) {
      try { providerError = JSON.parse((await response.text()).slice(0, 4096)); }
      catch { /* HTTP status alone is sufficient for diagnostics. */ }
    }
    throw Error(geminiHttpCode(response.status, providerError));
  }
  let interaction;
  try { interaction = await response.json(); }
  catch { throw Error("GEMINI_INVALID_JSON"); }
  const inspected = inspectInteraction(interaction, phase);
  metrics.search_count += inspected.searches;
  return interaction;
}

async function runAgent() {
  if (env.GEMINI_AGENT_PAID_ENABLED !== "true") throw Error("PAID_NOT_ENABLED");
  if (!env.AGENT_GEMINI_ACCESS_KEY || !env.AGENT_NOTION_ACCESS_TOKEN) throw Error("AGENT_SECRETS_MISSING");
  if (!Number.isSafeInteger(jobId) || jobId < 1 ||
      !Number.isSafeInteger(maxNew) || maxNew < 1) throw Error("AGENT_INPUT_INVALID");
  const target = category();
  // Editorial guidance is supplied by the existing admin prompt store, via dispatch.
  // It does not change duplicate, source, privacy or draft-only hard guards.
  const categoryGuidance = env.AGENT_CATEGORY_PROMPT?.trim();
  if (!categoryGuidance || categoryGuidance.length < 40 || categoryGuidance.length > 6000)
    throw Error("AGENT_CATEGORY_PROMPT_MISSING");
  const snapshot = await notionSnapshot(target.dataSourceId, target.dedicatedLostFound ? "lost-found" : target.dedicatedAdoption ? "adoptions" : target.dedicatedShelter ? "shelters" : target.section);
  const researchInstruction = "Si odborný výskumný pracovník Psipedia.sk. " +
    "Kategória: " + (target.dedicatedLostFound ? "stratené a nájdené psy (Lost/Found, iba DRAFT)" : target.dedicatedAdoption ? "psy na adopciu (Adopcie, iba Nápad)" : target.dedicatedShelter ? "útulky (Organizácie, SHELTER)" : target.categoryValue) + " (" + stableKey + "), Slovensko. " +
    "Použi teraz Google Search a nájdi maximálne " + maxNew +
    " NOVÝCH relevantných subjektov / podujatí / prípadov pomoci. " +
    (target.dedicatedLostFound ? "Hľadaj iba aktuálne verejné hlásenia STRATENÝ alebo NÁJDENÝ, overené ešte dnes, s dátumom udalosti do 30 dní, zdrojovou URL, mestom a identifikačnými znakmi. Vynechaj vyriešené, neaktuálne alebo neisté prípady a úplne vylúč súkromné kontakty, adresy a presnú GPS polohu. " : target.dedicatedAdoption ? "Pre každého psa nájdi primárny verejný HTTPS zdroj, jeho meno, zodpovednú organizáciu a podklady o adopcii; nie osobné kontakty alebo presné adresy. " : "Pre každý vyhľadaj verejný primárny HTTPS zdroj, oficiálny web aj sekciu Kontakt. Zisti doložený názov, obec, adresu, kontakty, služby, dátum podujatia a prípustné verejné fotografie. ") +
    "Nič nevymýšľaj. Predlož len overiteľné odkazy a stručné dôkazy, " +
    "nie rozhodnutie o duplicite. Zatiaľ nevytváraj žiadny Notion záznam. " +
    "Kategóriový redakčný prompt z administrácie (nenahrádza pravidlá overovania): " + categoryGuidance;
  const research = await gemini({ input: researchInstruction, tools: searchTools }, "research");

  // Interactions supplies grounded URLs as text-block url_citation annotations
  // (googleapis/python-genai URLCitation/TextContent), not model-written links.
  researchSources = new Set(research.steps.filter(step => step.type === "model_output")
    .flatMap(step => Array.isArray(step.content) ? step.content : [])
    .filter(block => block.type === "text")
    .flatMap(block => Array.isArray(block.annotations) ? block.annotations : [])
    .filter(annotation => annotation.type === "url_citation")
    .map(annotation => httpsUrl(annotation.url)).filter(Boolean));
  if (target.section !== "directory" && !researchSources.size) throw Error("GEMINI_SEARCH_EVIDENCE_MISSING");
  const instruction = (target.dedicatedLostFound ? "Lost/Found: iba overený OPEN prípad, report_type STRATENÝ/NÁJDENÝ, report_status OPEN, event_date a verified_at YYYY-MM-DD (dnes). Vyžaduj city, name, summary, description a dog_name alebo breed alebo distinguishing_marks. Dolož evidence pre všetky vyplnené polia vrátane report_type, report_status, event_date, verified_at a source_url. Nikdy neposielaj kontakty, adresy, súradnice, slug ani Psipedia ID. " : target.dedicatedAdoption ? "Adopcie: databáza Adopcie, stav Nápad. Povinné meno psa, organizácia, summary, description, zdroj a evidence name, organization, summary, description. Žiadne kontakty, adresy, GPS ani súkromné údaje. " : target.dedicatedShelter ? "Útulky: existujúca databáza Organizácie, typ SHELTER, stav Nápad. Nezadávaj adresu, telefón, e-mail, presnú polohu ani súradnice. Over meno, opisy a zdroje; dolož evidence fields name, summary, description a všetky doplnené identity. " : "") + "Pre podujatia a pomoc použi source_url/source_urls výhradne zo Search výsledkov; " +
    "evidence musí priradiť každý overený fakt k zdroju (source_url, fields). " +
    "Podujatia vyžadujú organizer, start_date, lokalitu, summary a description; časy sú HH:MM. " +
    (target.dedicatedLostFound ? "" : "Pomoc vyžaduje summary a description; kontakt a organizáciu pridaj iba s dôkazmi. ") +
    "Pokračuj v tomto existujúcom overenom prieskume. " +
    "NAJPRV zavolaj search_notion, pozri existujúce záznamy a až po prijatí jeho výsledku " +
    "môžeš použiť create_notion_draft. Vytvor maximálne " + maxNew + " KONCEPTOV. " +
    "Používaj výhradne konkrétne doložené verejné fakty a HTTPS zdroje z prieskumu. " +
    "Pri adresári vyplň overené telefóny, e-maily, úplnú adresu, PSČ, okres, kraj, služby, " +
    "kvalifikácie, Facebook/Instagram a priame HTTPS URL obrázkov iba z oficiálneho webu. " +
    "Pri veterinároch požaduj minimálne dva z: telefón, verejný e-mail, úplná adresa. " +
    "Nevytváraj neúplné záznamy ani možné duplicity. Nikdy nepublikuj. " +
    "Po výsledku duplicate neopakuj rovnakého kandidáta ani rovnaký Notion dotaz. " +
    "Pokračuj ďalším doloženým kandidátom z prieskumu; ak žiadny nezostal, ukonči odpoveď bez funkčného volania. " +
    "Ak podklady nestačia, skonči bez zápisu. " +
    "Pri vyhodnocovaní zohľadni kategóriový prompt: " + categoryGuidance;
  let response = await gemini({
    input: instruction, previous_interaction_id: research.id, tools: functionTools,
  }, "functions");
  let notionSearched = false;
  const searches = new Map();
  const duplicateCandidates = [];
  let repeatedTurns = 0;
  let finalizing = false;
  let completionRecovery = false;
  const unresolvedRejections = new Set();
  const candidateKey = args => JSON.stringify([normalize(args.name), normalize(args.city), args.start_date ?? "", normalize(args.organization)]);
  const identity = args => ({ ...args, website: args.website_url, source: args.source_url });
  const stableArguments = value => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  for (let turn = 0; turn <= AGENT_TURNS_LIMIT; turn++) {
    const { calls, status } = inspectInteraction(response, "functions");
    if (status === "completed") {
      if (unresolvedRejections.size) throw Error("AGENT_CANDIDATE_UNRESOLVED");
      const answer = response.steps.filter(step => step.type === "model_output")
        .flatMap(step => step.content ?? []).filter(block => block.type === "text")
        .map(block => block.text).join("").trim();
      if (finalizing) {
        if (answer !== '{"outcome":"exhausted"}') throw Error("AGENT_NO_PROGRESS");
        console.log("Agent no-draft outcome: exhausted");
      } else if (requiresNoDraftRecovery(metrics.concept_count)) {
        // A model may finish immediately after search_notion. This is not a
        // researched outcome. Continue the SAME interaction exactly once.
        if (!completionRecovery) {
          // An already explicit, valid reason requires no extra paid request.
          try {
            const outcome = parseNoDraftOutcome(answer);
            console.log("Agent no-draft outcome:", outcome);
            return;
          } catch (error) {
            if (error?.message !== "AGENT_OUTCOME_MISSING") throw error;
          }
          if (turn === AGENT_TURNS_LIMIT) throw Error("AGENT_TURN_LIMIT");
          completionRecovery = true;
          response = await gemini({
            input: "Vyhľadávanie a kontrola duplicít nie sú dokončením úlohy. Vyhodnoť všetkých doložených kandidátov z predchádzajúceho Google Search. Ak existuje bezpečne overený a neduplicitný kandidát, pokračuj search_notion (ak ešte neprebehlo) a potom create_notion_draft. Ak neexistuje, skonči presne jedným JSON objektom bez ďalšieho textu: {\"outcome\":\"no_relevant_candidate\"} alebo {\"outcome\":\"duplicate_only\"} alebo {\"outcome\":\"insufficient_evidence\"} alebo {\"outcome\":\"exhausted\"}. Nevytváraj záznam bez overenia.",
            previous_interaction_id: response.id, tools: functionTools,
          }, "functions");
          continue;
        }
        console.log("Agent no-draft outcome:", parseNoDraftOutcome(answer));
      }
      return;
    }
    // Repetition is not proof of exhaustion. Require a completed response; never
    // turn a stalled or budget-exhausted requires_action into a successful job.
    if (finalizing) throw Error("AGENT_NO_PROGRESS");
    // Do not make an unacknowledged Notion write at the request limit.
    if (turn === AGENT_TURNS_LIMIT) throw Error("AGENT_TURN_LIMIT");
    const results = [];
    const searchedBeforeTurn = notionSearched;
    let progress = false;
    for (const call of calls) {
      const args = call.arguments;
      let toolResult;
      if (call.name === "search_notion") {
        const key = canonicalIdentityUrl(args.query) || normalize(args.query);
        notionSearched = true;
        toolResult = { total: snapshot.rows.length, matches: notionSearch(snapshot.rows, args.query, target) };
        const resultKey = stableArguments(toolResult);
        if (searches.get(key) !== resultKey) progress = true;
        searches.set(key, resultKey);
      } else if (call.name === "create_notion_draft") {
        const repeated = duplicateCandidates.some(previous => target.section === "directory"
          ? sameDirectoryIdentity(identity(previous), identity(args))
          : stableArguments(previous) === stableArguments(args));
        toolResult = repeated ? { status: "duplicate", already_processed: true }
          : searchedBeforeTurn ? await createDraft(args, snapshot, target)
            : { status: "rejected", reason: "search_notion_required_first" };
        if (!repeated && toolResult.status === "duplicate") duplicateCandidates.push(args);
        if (!repeated && ["duplicate", "created"].includes(toolResult.status)) progress = true;
        if (toolResult.status === "created") searches.clear();
        if (toolResult.status === "rejected") unresolvedRejections.add(candidateKey(args));
        if (["created", "duplicate"].includes(toolResult.status)) unresolvedRejections.delete(candidateKey(args));
      } else throw Error("GEMINI_INVALID_TOOL_CALL");
      results.push({
        type: "function_result", name: call.name, call_id: call.id,
        result: [{ type: "text", text: JSON.stringify(toolResult) }],
      });
    }
    console.log("Agent turn:", JSON.stringify({ turn, calls: calls.length, progress,
      searches: calls.filter(call => call.name === "search_notion").length,
      creates: calls.filter(call => call.name === "create_notion_draft").length,
      concept_count: metrics.concept_count, duplicate_count: metrics.duplicate_count }));
    if (metrics.concept_count >= maxNew) return;
    repeatedTurns = progress ? 0 : repeatedTurns + 1;
    // Allow one recovery turn (another researched candidate can still progress).
    // Two consecutive unproductive turns get a single, tool-free completion.
    finalizing = repeatedTurns >= 2;
    if (finalizing) {
      for (const result of results) result.result[0].text = JSON.stringify({
        ...JSON.parse(result.result[0].text),
        instruction: "Repeated calls added no information. No more tools or writes are allowed. Only if all researched candidates are resolved and none remains to check or create, reply exactly {\"outcome\":\"exhausted\"}. Otherwise reply exactly {\"outcome\":\"unresolved\"}. Repetition alone does not establish exhaustion.",
      });
    }
    response = await gemini({
      input: results, previous_interaction_id: response.id, tools: finalizing ? [] : functionTools,
    }, "functions");
  }
  throw Error("AGENT_TURN_LIMIT");
}

async function callback(status, code = null) {
  const secret = env.PSIPEDIA_AGENT_CALLBACK_SECRET;
  const callbackUrl = env.PSIPEDIA_AGENT_CALLBACK_URL;
  if (!secret || callbackUrl !== "https://psipedia.sk/api/internal/gemini-agent/callback")
    throw Error("CALLBACK_CONFIG_MISSING");
  const body = JSON.stringify({
    job_id: jobId, status, ...metrics,
    error_code: code,
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Psipedia-Signature": "sha256=" + signature,
    },
    body, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error("CALLBACK_HTTP_" + response.status);
}

let failure = null;
try {
  await runAgent();
} catch (error) {
  // Never print prompt, secrets, private Notion records or raw provider responses.
  failure = error instanceof Error ? error.message : "AGENT_FAILED";
  console.error("Agent failed:", /^[A-Z0-9_]{1,45}$/.test(failure) ? failure : "AGENT_FAILED", JSON.stringify(metrics));
}
try {
  await callback(failure ? "FAILED" : "SUCCESS",
    failure ? (/^[A-Z0-9_]{1,45}$/.test(failure) ? failure : "AGENT_FAILED") : null);
} catch (error) {
  const diagnostic = error instanceof Error ? error.message : "";
  console.error("Callback failed:", /^CALLBACK_[A-Z0-9_]{1,36}$/.test(diagnostic) ? diagnostic : "CALLBACK_FAILED");
  process.exitCode = 1;
}
if (failure) process.exitCode = 1;
