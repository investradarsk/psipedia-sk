/**
 * Verified, publicly attributable business facts only.
 * Pure ESM: the GitHub Actions worker has no Psipedia runtime.
 * Never derive SEO, publishing, GEO or synchronization fields.
 */
const safeText = (value, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) || (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.startsWith("["))) return "";
    return url.toString();
  } catch { return ""; }
};
const socialUrl = (value, host) => {
  const url = safeUrl(value);
  if (!url) return "";
  const parsed = new URL(url);
  return parsed.hostname === host || parsed.hostname.endsWith("." + host) ? url : "";
};
// For a logo or cover, only use direct HTTPS image URLs served by the
// organisation's own domain. A search result, page URL or arbitrary third-party
// image is not evidence of the actual image file. Remote image ingestion retains
// its separate safety/format checks in the existing Notion sync pipeline.
const officialImageUrl = (candidate, websiteUrl) => {
  const image = safeUrl(candidate);
  const website = safeUrl(websiteUrl);
  if (!image || !website) return "";
  const asset = new URL(image);
  const official = new URL(website).hostname.replace(/^www\./, "");
  const host = asset.hostname.replace(/^www\./, "");
  if (host !== official && !host.endsWith("." + official)) return "";
  if (!/\.(?:png|jpe?g|webp|avif|gif|svg)(?:$|[?#])/i.test(image)) return "";
  return image;
};
const validEmail = (value) => {
  const email = safeText(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
};
const validPhone = (value) => {
  const phone = safeText(value, 35);
  const digits = phone.replace(/\D/g, "");
  return /^[+\d][\d\s().\/-]{5,34}$/.test(phone)
    && digits.length >= 7 && digits.length <= 15 ? phone : "";
};
const validPostalCode = (value) => {
  const code = safeText(value, 12);
  return /^\d{3}\s?\d{2}$/.test(code) ? code.replace(/\s/g, "").replace(/^(\d{3})/, "$1 ") : "";
};
const validHouseNumber = (value) => {
  const number = safeText(value, 24);
  return /^\d{1,6}(?:\/\d{1,6})?[a-zA-Z]?$/.test(number) ? number : "";
};

export function directoryProfileValues(args) {
  const website = safeUrl(args.website_url);
  const logo = officialImageUrl(args.logo_url, website);
  const photo = officialImageUrl(args.image_url, website);
  // Main-image ingestion supports only raster images. An SVG/GIF logo belongs
  // in Logo URL but must not be forwarded as a cover to the R2 image pipeline.
  const usableLogoCover = /\.(?:png|jpe?g|webp|avif)(?:$|[?#])/i.test(logo) ? logo : "";
  const mainImage = /\.(?:png|jpe?g|webp|avif)(?:$|[?#])/i.test(photo) ? photo : usableLogoCover;
  const values = {
    "Logo URL": logo,
    "Hlavný obrázok URL": mainImage,
    "Zdroj obrázka": mainImage ? website : "",
    "Alt text obrázka": mainImage === photo && photo ? safeText(args.image_alt, 200) || safeText(args.name, 140) : (mainImage ? "Logo " + safeText(args.name, 140) : ""),
    "Telefón": validPhone(args.phone),
    "E-mail": validEmail(args.email),
    "Adresa": safeText(args.address, 250),
    "Ulica": safeText(args.street, 150),
    "Číslo domu": validHouseNumber(args.house_number),
    "PSČ": validPostalCode(args.postal_code),
    "Okres": safeText(args.district, 100),
    "Kraj": safeText(args.region, 100),
    "Facebook": socialUrl(args.facebook_url, "facebook.com"),
    "Instagram": socialUrl(args.instagram_url, "instagram.com"),
    "Služby": safeText(args.services, 1600),
    "Kvalifikácie": safeText(args.qualifications, 600),
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !!value));
}

/** Veterinarians require at least two independently useful contact/address
 * fields; do not create attractive but practically unusable shells. The address
 * must be supplied as a full address or street + validated house number.
 * Called on actual Notion-encoded properties, not untrusted model arguments.
 */
export function hasMinimumVeterinarianContact(properties) {
  return Number(!!properties["Telefón"]) + Number(!!properties["E-mail"]) +
    Number(!!properties["Adresa"] || (!!properties["Ulica"] && !!properties["Číslo domu"])) >= 2;
}

/** Encode values against the schema returned by Notion, without inventing data
 * or adding properties/options to the workspace. Optional invalid values stay empty. */
const identityText = value => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const richText = value => Array.from({ length: Math.ceil(value.length / 1800) }, (_, i) =>
  ({ type: "text", text: { content: value.slice(i * 1800, (i + 1) * 1800) } }));
const supportedContentTypes = new Set(["title", "rich_text", "select", "multi_select", "checkbox", "number", "date", "url", "email", "phone_number", "files"]);
const systemNames = new Set([
  "stav", "status", "slug", "kategoria", "typ podujatia", "vytvoril", "upravil", "overene", "odporucane",
  "potvrdena prevadzka", "gemini poznamka", "gemini kontrola", "dovod odmietnutia", "poznamky",
  "latitude", "longitude", "presnost lokality", "noindex", "canonical url", "vyriesene", "expiracia",
  "schvalene", "publikovane", "published", "archivovane", "created at", "updated at", "published at", "__proto__", "constructor", "prototype",
]);
/** System/provenance/moderation fields are never model-controlled. Unknown
 * content columns are allowed by type, without adding per-category field maps. */
export function geminiContentField(name, schema, target) {
  if (!schema || !supportedContentTypes.has(schema.type)) return false;
  const key = identityText(name);
  if (systemNames.has(key) || /(?:^|[ _·-])(?:id|uuid|key|lock|token|hash|sync|seo|og|geo|google|psipedia|internal|interny|publication|publikovanie|zamok|synchronizacia)(?:$|[ _·-])/.test(key)) return false;
  if (/^(?:gemini |kvalita|posledny sync|publik|publish|archiv|schval|approve|zverejn|vytvorene|aktualizovane)/.test(key)) return false;
  if (key === "typ" && !target.dedicatedLostFound) return false;
  if (target.dedicatedLostFound || target.dedicatedAdoption || target.dedicatedShelter) {
    if (["email", "phone_number"].includes(schema.type) ||
        /kontakt|telefon|e-mail|adresa|ulica|cislo domu|psc|latitude|longitude|suradnic|gps|majitel|sukromn|presna poloha/.test(key) || key === "miesto") return false;
  }
  return true;
}
function contentInputType(definition) {
  const string = { type: "string" };
  if (["title", "rich_text", "url", "email", "phone_number"].includes(definition.type)) return string;
  if (definition.type === "select") return { type: "string", ...(definition.select?.options?.length ? { enum: definition.select.options.map(option => option.name) } : {}) };
  if (definition.type === "multi_select") return { type: "array", items: { type: "string", ...(definition.multi_select?.options?.length ? { enum: definition.multi_select.options.map(option => option.name) } : {}) } };
  if (definition.type === "checkbox") return { anyOf: [{ type: "boolean" }, string] };
  if (definition.type === "number") return { anyOf: [{ type: "number" }, string] };
  if (definition.type === "files") return { type: "array", items: { type: "object", properties: { url: string, name: string }, required: ["url"] } };
  return { anyOf: [string, { type: "object", properties: { start: string, end: string, time_zone: string }, required: ["start"] }] };
}
/** A fresh per-run schema, derived only from GET /data_sources metadata. */
export function geminiNotionSchema(properties, target) {
  const fields = Object.fromEntries(Object.entries(properties).filter(([name, definition]) => geminiContentField(name, definition, target))
    .map(([name, definition]) => [name, contentInputType(definition)]));
  const description = Object.entries(properties).map(([name, definition]) => ({ name, type: definition.type,
    description: typeof definition.description === "string" ? definition.description : undefined,
    options: (definition.select?.options ?? definition.multi_select?.options ?? definition.status?.options)?.map(option => option.name),
    number_format: definition.number?.format,
    writable: Object.hasOwn(fields, name),
  }));
  return { description, input: { type: "object", properties: fields, additionalProperties: false } };
}
export function geminiDraftIdentity(args, target) {
  const fields = args.fields && typeof args.fields === "object" && !Array.isArray(args.fields) ? args.fields : {};
  return [fields[target.dedicatedAdoption ? "Meno" : "Názov"] ?? args.name,
    fields.Mesto ?? args.city, fields["Začiatok"] ?? fields["Dátum udalosti"] ?? args.start_date ?? args.event_date,
    fields["Organizácia"] ?? args.organization, fields["Zdroj dát"] ?? fields["Zdroj URL"] ?? args.source_url,
    fields.Typ ?? args.report_type].map((value, index) => {
      const text = value && typeof value === "object" ? value.start : value;
      if (index === 4) return typeof text === "string" ? text.trim() : ""; // URL paths are case-sensitive
      if (index === 2) return exactDate(text) ?? identityText(text);
      return identityText(text);
    });
}

function exactDate(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const eu = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(text);
  const date = eu ? `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}` : text;
  const day = date.slice(0, 10);
  const parsed = new Date(day + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  // Date.parse rolls 24:00 into tomorrow; do not silently invent a new date.
  if (date.includes("T") && (Number(date.slice(11, 13)) > 23 || Number(date.slice(14, 16)) > 59 || Number(date.slice(17, 19) || 0) > 59)) return null;
  return date;
}
const optionTokens = value => identityText(value).replace(/[_/–—-]+/g, " ").replace(/\s+/g, " ").trim();
function matchingOption(options, value) {
  const key = optionTokens(value);
  const exact = options.filter(option => optionTokens(option.name) === key);
  if (exact.length === 1) return exact[0].name;
  // Safe generic equivalence only; unfamiliar meanings are Gemini's job.
  const yes = new Set(["ano", "yes", "true"]), no = new Set(["nie", "no", "false"]);
  const group = yes.has(key) ? yes : no.has(key) ? no : null;
  const equivalent = group ? options.filter(option => group.has(optionTokens(option.name))) : [];
  return equivalent.length === 1 ? equivalent[0].name : null;
}
function draftNumber(text, schema, name) {
  const match = /^([+-]?(?:(?:\d{1,3}(?: \d{3})+|\d+)(?:[.,]\d+)?|[.,]\d+))\s*([^\d]*)$/.exec(text.replace(/[\u00a0\u202f]/g, " "));
  if (!match) return null;
  let number = Number(match[1].replaceAll(" ", "").replace(",", "."));
  const unit = identityText(match[2]);
  const key = identityText(name);
  const expected = /(?:\(|\[)\s*(kg|g|km|cm|mm|m|eur|€|%)\s*(?:\)|\])/.exec(key)?.[1];
  const scales = { kg: ["mass", 1], g: ["mass", .001], km: ["length", 1000], m: ["length", 1], cm: ["length", .01], mm: ["length", .001] };
  if (unit === "%" && schema.number?.format === "percent") number /= 100;
  else if (expected && unit && scales[expected] && scales[unit] && scales[expected][0] === scales[unit][0]) number *= scales[unit][1] / scales[expected][1];
  else if (unit && unit !== expected && !(unit === "kg" && !expected) &&
      !(["eur", "€"].includes(unit) && ["euro", "number"].includes(schema.number?.format ?? "number")) &&
      !(unit.startsWith("mesiac") && key.includes("mesiac"))) return null;
  return Number.isFinite(number) ? number : null;
}
export function notionDraftProperty(schema, value, name = "") {
  if (!schema || value === undefined || value === null || value === "") return null;
  if (["title", "rich_text"].includes(schema.type)) {
    const text = typeof value === "string" ? value.trim() : Array.isArray(value) && value.every(v => typeof v === "string") ? value.join("\n") : null;
    return text && text.length <= 180000 ? { [schema.type]: richText(text) } : null;
  }
  const text = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  if (schema.type === "url") {
    const url = safeUrl(text);
    return url && url.length <= 2000 ? { url } : null;
  }
  if (schema.type === "email") return text.length <= 254 && validEmail(text) ? { email: validEmail(text) } : null;
  if (schema.type === "phone_number") return text.length <= 35 && validPhone(text) ? { phone_number: validPhone(text) } : null;
  if (["select", "status"].includes(schema.type)) {
    const option = matchingOption(schema[schema.type]?.options ?? [], text);
    return option ? { [schema.type]: { name: option } } : null;
  }
  if (schema.type === "multi_select") {
    const values = Array.isArray(value) ? value : text.split(/[,;\n]/);
    const names = values.map(v => typeof v === "string" ? matchingOption(schema.multi_select?.options ?? [], v.trim()) : null);
    return names.length && names.every(Boolean) ? { multi_select: [...new Set(names)].map(name => ({ name })) } : null;
  }
  if (schema.type === "number") {
    const number = draftNumber(text, schema, name);
    return number !== null ? { number } : null;
  }
  if (schema.type === "checkbox") {
    if ([true, 1].includes(value) || ["true", "ano", "yes", "1"].includes(identityText(text))) return { checkbox: true };
    if ([false, 0].includes(value) || ["false", "nie", "no", "0"].includes(identityText(text))) return { checkbox: false };
    return null;
  }
  if (schema.type === "date") {
    const input = typeof value === "string" ? { start: value } : value;
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const start = exactDate(input.start), end = input.end ? exactDate(input.end) : null;
    if (!start || input.end && !end || end && Date.parse(end) < Date.parse(start)) return null;
    if (input.time_zone) {
      if (typeof input.time_zone !== "string" || !start.includes("T") || /(?:Z|[+-]\d{2}:\d{2})$/.test(start) || end && /(?:Z|[+-]\d{2}:\d{2})$/.test(end)) return null;
      try { new Intl.DateTimeFormat("sk", { timeZone: input.time_zone }); } catch { return null; }
    }
    return { date: { start, ...(end ? { end } : {}), ...(input.time_zone ? { time_zone: input.time_zone } : {}) } };
  }
  if (schema.type === "files") {
    if (!Array.isArray(value) || !value.length || value.length > 100) return null;
    const files = value.map(file => {
      const url = safeUrl(typeof file === "string" ? file : file?.url);
      if (!url || url.length > 2000) return null;
      const name = typeof file?.name === "string" ? file.name.trim() : new URL(url).pathname.split("/").at(-1) || "Obrázok";
      return name && name.length <= 100 ? { name, type: "external", external: { url } } : null;
    });
    return files.every(Boolean) ? { files } : null;
  }
  return null;
}

const pageValue = (page, key) => {
  const p = page.properties?.[key];
  return p?.url ?? (p?.[p.type] ?? []).map?.(v => v.plain_text ?? v.text?.content ?? "").join("") ?? "";
};
// This protects sensitive cases in BOTH content and the private Gemini note.
// Do not echo a discarded contact/address/GPS value into the warning itself.
export const geminiPrivateText = value => /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+\s*421|\b0(?:9|[2-8]))[\s().-]*\d{2,3}[\s().-]*\d{3}[\s.-]*\d{3,4}|\b(?:gps|lat(?:itude)?|lon(?:gitude)?|s[uú]radnice)\s*[:=]?\s*-?\d{1,3}[.,]\d{3,}|\b-?\d{1,2}[.,]\d{4,}\s*[,;]\s*-?\d{1,3}[.,]\d{4,}|\b(?:ulica|ulici|ul\.|adresa|bydlisko|domu|s[uú]pisn[eé])\s*[:,-]?\s*[\p{L} .-]+\s+\d{1,4}(?:\/\d+)?\b/iu.test(String(value ?? ""));

/** One existing-worker draft path for all 22 categories. Content quality and
 * possible duplicates are editorial warnings, never automatic publication gates. */
export function buildGeminiNotionDraft({ args, properties: schema, rows, target }) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw Error("GEMINI_DRAFT_INPUT_INVALID");
  const adoption = target.dedicatedAdoption, shelter = target.dedicatedShelter, lost = target.dedicatedLostFound;
  const title = adoption ? "Meno" : "Názov";
  if (schema[title]?.type !== "title") throw Error("NOTION_TITLE_SCHEMA_MISSING");
  if (args.fields !== undefined && (!args.fields || typeof args.fields !== "object" || Array.isArray(args.fields))) throw Error("GEMINI_DRAFT_INPUT_INVALID");
  const fields = args.fields ?? {};
  // Old argument aliases remain readable for in-flight/older mock callers.
  // New Gemini requests receive only the live schema-driven fields contract.
  args = { ...args, name: fields[title] ?? args.name, city: fields.Mesto ?? args.city,
    website_url: fields.Web ?? args.website_url, source_url: fields["Zdroj dát"] ?? fields["Zdroj URL"] ?? args.source_url,
    report_type: fields.Typ ?? args.report_type };
  const warnings = [];
  const restricted = lost || adoption || shelter;
  const clean = value => {
    const text = typeof value === "string" ? value.trim() : value;
    if (restricted && geminiPrivateText(typeof text === "object" ? JSON.stringify(text) : text)) {
      warnings.push("Súkromný kontakt, presná adresa alebo súradnice boli vynechané; skontrolujte verejné údaje.");
      return "";
    }
    return text;
  };
  if (lost && args.source_url) {
    try { if (new URL(args.source_url).search) {
      args = { ...args, source_url: "" };
      warnings.push("Zdrojová URL s parametrami bola vynechaná kvôli ochrane súkromia; skontrolujte verejný zdroj.");
    } } catch { /* Invalid optional URL is omitted by the encoder. */ }
  }
  const name = clean(args.name);
  if (typeof name !== "string" || !name) throw Error("GEMINI_DRAFT_NAME_REQUIRED");
  const result = {};
  const put = (property, value, essential = false) => {
    if (value === undefined || value === null || value === "") return;
    if (!schema[property] && !essential) return; // irrelevant legacy alias, not a missing fact
    let cleaned = clean(value);
    if (["Zdroj dát", "Zdroj URL", "Web"].includes(property)) cleaned = safeUrl(cleaned);
    if (["Začiatok", "Koniec", "Dátum udalosti"].includes(property) && schema[property]?.type !== "date")
      cleaned = notionDraftProperty({ type: "date" }, cleaned)?.date.start ?? "";
    if (["Čas začiatku", "Čas konca"].includes(property)) {
      const time = /^(\d{1,2})[:.](\d{2})$/.exec(String(cleaned));
      cleaned = time && Number(time[1]) < 24 && Number(time[2]) < 60 ? time[1].padStart(2, "0") + ":" + time[2] : "";
    }
    if (lost && schema[property]?.type === "url" && cleaned) {
      try { if (new URL(cleaned).search) cleaned = ""; } catch { cleaned = ""; }
    }
    if (lost && schema[property]?.type === "files" && Array.isArray(cleaned) && cleaned.some(file => {
      try { return new URL(typeof file === "string" ? file : file.url).search; } catch { return true; }
    })) cleaned = "";
    if (target.section === "directory" && schema[property]?.type === "url" && /obr[aá]z|logo|image|photo/i.test(property))
      cleaned = officialImageUrl(cleaned, args.website_url);
    const encoded = notionDraftProperty(schema[property], cleaned, property);
    if (encoded) result[property] = encoded;
    else if (essential) throw Error("NOTION_DRAFT_SCHEMA_INVALID");
    else {
      const preview = Object.hasOwn(fields, property) && ["string", "number", "boolean"].includes(typeof cleaned) && String(cleaned).length <= 200 ? String(cleaned) : "";
      warnings.push(`Pole „${property}“ nebolo zapísané pre nepodporovaný typ alebo formát${preview ? ` (údaj: ${preview})` : ""}; doplňte ho pri kontrole.`);
    }
  };
  put(title, name, true);
  if (args.fields === undefined) {
    const summary = adoption || shelter ? "Krátky popis" : "Perex";
    const values = {
      [summary]: args.summary, "Popis": args.description,
      "Mesto": args.city, "Okres": args.district, "Kraj": args.region,
      "Zdroj dát": args.source_url, "Web": args.website_url,
      "Organizátor": args.organizer, "Organizácia": args.organization,
      "Právny názov": args.legal_name, "IČO / registračné číslo": args.registration_number,
      "Začiatok": args.start_date, "Koniec": args.end_date,
      "Čas začiatku": args.start_time, "Čas konca": args.end_time,
    };
    if (lost) {
      delete values["Zdroj dát"];
      Object.assign(values, { "Zdroj URL": args.source_url, "Dátum udalosti": args.event_date,
        "Meno psa": args.dog_name, "Pohlavie": args.sex, "Plemeno": args.breed,
        "Farba": args.color, "Veľkosť": args.size, "Rozlišovacie znaky": args.distinguishing_marks,
        "Obojok": args.collar_description });
      delete values.Perex;
    }
    if (!restricted) Object.assign(values, { "Miesto": args.venue, "Kontakt": args.contact });
    if (target.section === "directory") Object.assign(values, directoryProfileValues(args), { "Vytvoril": "Gemini automatizácia" });
    for (const [key, value] of Object.entries(values)) put(key, value);
  } else if (target.section === "directory") put("Vytvoril", "Gemini automatizácia");
  for (const [property, value] of Object.entries(fields)) {
    if (property === title || property === "Typ" && lost || property === "Gemini poznámka") continue;
    if (!Object.hasOwn(schema, property)) {
      warnings.push("Zadané obsahové pole neexistuje v cieľovej schéme; údaj skontrolujte v podkladoch.");
      continue;
    }
    if (!geminiContentField(property, schema[property], target)) {
      warnings.push("Chránené alebo nepodporované pole bolo vynechané; systémové údaje zostávajú pod kontrolou Psipedie.");
      continue;
    }
    put(property, value);
  }
  const categoryField = lost || shelter ? "Typ" : target.section === "events" ? "Typ podujatia" : "Kategória";
  const category = shelter ? "SHELTER" : lost
    ? ({ STRATENÝ: "LOST", NÁJDENÝ: "FOUND", LOST: "LOST", FOUND: "FOUND" })[args.report_type]
    : target.categoryValue;
  if (lost && !category) throw Error("GEMINI_LOST_FOUND_TYPE_REQUIRED");
  if (!adoption) {
    if (!schema[categoryField]) throw Error("NOTION_CATEGORY_SCHEMA_INVALID");
    put(categoryField, category, true);
  }
  // Set every publication gate that exists. Never inherit a workspace default.
  let statusWritten = false;
  for (const field of ["Psipedia stav", "Stav"]) {
    const status = schema[field];
    if (!status) continue;
    const options = ["Koncept", "Nápad", "Na kontrolu", "draft", "DRAFT"];
    const value = status.type === "rich_text" ? (lost ? "DRAFT" : "draft")
      : options.find(option => notionDraftProperty(status, option));
    if (!value) throw Error("NOTION_DRAFT_OPTION_MISSING");
    put(field, value, true);
    statusWritten = true;
  }
  if (!statusWritten) throw Error("NOTION_DRAFT_SCHEMA_MISSING");
  const possibleDuplicate = (rows ?? []).some(page => {
    const known = identityText(pageValue(page, title));
    const sameName = known && known === identityText(name);
    const source = safeUrl(args.source_url);
    return sameName || Boolean(source && ["Zdroj dát", "Zdroj URL", "Web"].some(field => safeUrl(pageValue(page, field)) === source));
  });
  if (possibleDuplicate) warnings.push("Možná duplicita existujúceho Notion záznamu. Porovnajte identitu pred publikovaním; koncept nie je automaticky zlúčený ani zamietnutý.");
  if (restricted && ["contact", "phone", "email", "address", "street", "house_number", "postal_code", "latitude", "longitude"].some(field => args[field]))
    warnings.push("Súkromné kontakty a presná poloha sa do konceptu neprenášajú.");
  if (lost && args.report_status && args.report_status !== "OPEN")
    warnings.push("Zdroj uvádza neaktívny alebo vyriešený prípad; overte aktuálnosť pred ďalším spracovaním.");
  const note = [clean(args.gemini_note ?? fields["Gemini poznámka"]), ...new Set(warnings)].filter(Boolean).join("\n\n");
  if (note) put("Gemini poznámka", note);
  return { properties: result, possibleDuplicate, warnings };
}
