/**
 * Independent Gemini research worker. Runs ONLY inside GitHub Actions.
 * No Psipedia database logic or Cloudflare runtime required.
 * Notion Free API is the sole database; writes are drafts only.
 */
import { createHmac } from "node:crypto";

const env = process.env;
const jobId = Number(env.AGENT_JOB_ID);
const stableKey = env.AGENT_STABLE_KEY ?? "";
const maxNew = Math.min(5, Number(env.AGENT_MAX_NEW_CONCEPTS));
const metrics = { concept_count: 0, duplicate_count: 0, request_count: 0, search_count: 0 };
const pageIds = [];
const AGENT_TURNS_LIMIT = 8;
const NOTION_VERSION = "2025-09-03";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (s) => String(s ?? "").normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const trim = (value, max = 1800) => typeof value === "string" ? value.trim().slice(0, max) : "";

function category() {
  if (!/^(directory|events|help)\.[a-z0-9-]+$/.test(stableKey))
    throw Error("INVALID_CATEGORY");
  const [section, subcategory] = stableKey.split(".");
  const ids = {
    directory: env.NOTION_DIRECTORY_DATA_SOURCE_ID,
    events: env.NOTION_EVENTS_DATA_SOURCE_ID,
    help: env.NOTION_HELP_DATA_SOURCE_ID,
  };
  const dataSourceId = ids[section];
  if (!dataSourceId || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId))
    throw Error("NOTION_DATA_SOURCE_MISSING");
  return { section, subcategory, dataSourceId };
}

async function notion(path, method = "GET", body) {
  const response = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.AGENT_NOTION_ACCESS_TOKEN,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  // Do not retry POST /pages: an interrupted response may already have created the page.
  if (!response.ok) {
    const code = response.status;
    if (code === 429) throw Error("NOTION_RATE_LIMIT");
    throw Error("NOTION_HTTP_" + code);
  }
  return response.json();
}

function pageText(page, propertyName) {
  const property = page.properties?.[propertyName];
  if (!property) return "";
  if (property.type === "title") return (property.title ?? []).map((v) => v.plain_text ?? "").join("");
  if (property.type === "rich_text") return (property.rich_text ?? []).map((v) => v.plain_text ?? "").join("");
  if (property.type === "url") return property.url ?? "";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "status") return property.status?.name ?? "";
  return "";
}

async function notionSnapshot(dataSourceId) {
  const metadata = await notion("/data_sources/" + encodeURIComponent(dataSourceId));
  const properties = metadata.properties ?? {};
  if (properties["Názov"]?.type !== "title") throw Error("NOTION_TITLE_SCHEMA_MISSING");
  const statusName = properties["Psipedia stav"] ? "Psipedia stav" :
    (properties.Stav ? "Stav" : "");
  if (!statusName) throw Error("NOTION_DRAFT_SCHEMA_MISSING");
  const statusSchema = properties[statusName];
  if (!["select", "status"].includes(statusSchema.type))
    throw Error("NOTION_DRAFT_SCHEMA_INVALID");
  const draftOptions = statusSchema[statusSchema.type]?.options ?? [];
  const draft = ["Koncept", "Nápad", "Na kontrolu", "Ready"]
    .find((name) => draftOptions.some((option) => option.name === name));
  if (!draft) throw Error("NOTION_DRAFT_OPTION_MISSING");
  const rows = [];
  let cursor = null;
  for (let i = 0; i < 35; i++) {
    const result = await notion("/data_sources/" + encodeURIComponent(dataSourceId) + "/query",
      "POST", { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    rows.push(...(result.results ?? []));
    if (!result.has_more) return { rows, properties, statusName, draft };
    cursor = result.next_cursor;
    if (!cursor) throw Error("NOTION_CURSOR_INVALID");
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
function notionSearch(rows, query) {
  const q = normalize(query);
  return rows.filter((page) => {
    if (!q) return true;
    return [pageText(page, "Názov"), pageText(page, "Mesto"),
      pageText(page, "Web"), pageText(page, "Zdroj dát")]
      .some((value) => normalize(value).includes(q));
  }).slice(0, 50).map((page) => ({
    title: pageText(page, "Názov"),
    city: pageText(page, "Mesto"),
    website: pageText(page, "Web"),
  }));
}

async function createDraft(args, snapshot, target) {
  if (metrics.concept_count >= maxNew) return { status: "limit_reached" };
  const name = trim(args.name, 180);
  const city = trim(args.city, 100);
  const source = httpsUrl(args.source_url);
  const website = httpsUrl(args.website_url);
  if (!name || !source) return { status: "rejected", reason: "name_and_https_source_required" };
  if (target.section === "events" && !/^\d{4}-\d{2}-\d{2}$/.test(trim(args.start_date, 10))) {
    return { status: "rejected", reason: "verified_event_date_required" };
  }
  if (isDuplicate(snapshot.rows, name, city, website, source)) {
    metrics.duplicate_count++;
    return { status: "duplicate" };
  }
  const values = {
    "Názov": name,
    "Mesto": city,
    "Kategória": target.subcategory,
    "Typ podujatia": target.subcategory,
    "Typ": target.subcategory,
    "Web": website || (target.section === "events" ? source : ""),
    "Zdroj dát": source,
    "Zdroj URL": source,
    "Popis": trim(args.description, 1600),
    "Perex": trim(args.summary, 350),
    "Miesto": trim(args.venue, 200),
    "Začiatok": trim(args.start_date, 10),
    "Kontakt": trim(args.contact, 300),
  };
  const properties = {};
  for (const [key, value] of Object.entries(values)) {
    const encoded = chooseProperty(snapshot.properties[key], value);
    if (encoded) properties[key] = encoded;
  }
  properties[snapshot.statusName] = snapshot.properties[snapshot.statusName].type === "status"
    ? { status: { name: snapshot.draft } } : { select: { name: snapshot.draft } };
  const created = await notion("/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: target.dataSourceId },
    properties,
  });
  if (!created.id) throw Error("NOTION_CREATE_UNCERTAIN");
  snapshot.rows.push(created);
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
        contact: { type: "string" },
      }, required: ["name", "source_url"],
    },
  },
];

async function gemini(payload) {
  metrics.request_count++;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": env.AGENT_GEMINI_ACCESS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.GEMINI_MODEL || "gemini-3.8-flash", tools, ...payload }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw Error("GEMINI_HTTP_" + response.status);
  const interaction = await response.json();
  metrics.search_count += (interaction.steps ?? []).filter((step) =>
    step.type === "google_search_call").length;
  if (!interaction.id || !Array.isArray(interaction.steps)) throw Error("GEMINI_INVALID_STEPS");
  return interaction;
}

async function runAgent() {
  if (env.GEMINI_AGENT_PAID_ENABLED !== "true") throw Error("PAID_NOT_ENABLED");
  if (!env.AGENT_GEMINI_ACCESS_KEY || !env.AGENT_NOTION_ACCESS_TOKEN) throw Error("AGENT_SECRETS_MISSING");
  if (!Number.isSafeInteger(jobId) || jobId < 1 ||
      !Number.isSafeInteger(maxNew) || maxNew < 1) throw Error("AGENT_INPUT_INVALID");
  const target = category();
  const snapshot = await notionSnapshot(target.dataSourceId);
  const instruction = "Si autonómny odborný výskumný pracovník Psipedia.sk. " +
    "Kategória: " + stableKey + ". Slovensko. Nájdite maximálne " + maxNew +
    " nových relevantných subjektov / podujatí / prípadov pomoci. " +
    "NAJPRV zavolaj search_notion a skontroluj aktuálne záznamy. " +
    "Potom používaj Google Search na získanie aktuálnych verejných dôkazov. " +
    "Každú položku over z dôveryhodného primárneho zdroja, nevymýšľaj údaje. " +
    "Nové a dostatočne doložené položky zapisuj výhradne cez create_notion_draft. " +
    "Ak nevieš overiť zdroj alebo je možná duplicita, nezapisuj. " +
    "Žiadne publikovanie. Koniec po dosiahnutí limitu alebo vyčerpaní vierohodných výsledkov.";
  let response = await gemini({ input: instruction });
  let notionSearched = false;
  for (let turn = 0; turn < AGENT_TURNS_LIMIT; turn++) {
    const calls = response.steps.filter((step) => step.type === "function_call");
    if (!calls.length) {
      if (response.status === "requires_action") throw Error("GEMINI_EMPTY_TOOL_CALL");
      return;
    }
    const results = [];
    for (const call of calls) {
      const args = call.arguments ?? {};
      let toolResult;
      if (call.name === "search_notion") {
        notionSearched = true;
        toolResult = { total: snapshot.rows.length, matches: notionSearch(snapshot.rows, args.query) };
      } else if (call.name === "create_notion_draft") {
        toolResult = notionSearched
          ? await createDraft(args, snapshot, target)
          : { status: "rejected", reason: "search_notion_required_first" };
      } else throw Error("UNKNOWN_TOOL_CALL");
      results.push({
        type: "function_result", name: call.name, call_id: call.id,
        result: [{ type: "text", text: JSON.stringify(toolResult) }],
      });
    }
    if (metrics.concept_count >= maxNew) return;
    response = await gemini({ input: results, previous_interaction_id: response.id });
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
  console.error("Agent failed:", /^[A-Z0-9_]+$/.test(failure) ? failure : "AGENT_FAILED");
}
try {
  await callback(failure ? "FAILED" : "SUCCESS",
    failure ? (/^[A-Z0-9_]{1,45}$/.test(failure) ? failure : "AGENT_FAILED") : null);
} catch (error) {
  console.error("Callback failed:", error instanceof Error ? error.message : "CALLBACK_FAILED");
  process.exitCode = 1;
}
if (failure) process.exitCode = 1;
