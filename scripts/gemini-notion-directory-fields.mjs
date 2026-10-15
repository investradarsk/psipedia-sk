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
    if (!url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname) || /^(?:\d|\[|0x)/.test(url.hostname)) return "";
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
export function notionDraftProperty(schema, value) {
  if (!schema || value === undefined || value === null || value === "") return null;
  const text = Array.isArray(value) ? value.filter(v => typeof v === "string").join("\n") : String(value).trim();
  if (["title", "rich_text"].includes(schema.type)) {
    if (!text || text.length > 180000) return null;
    return { [schema.type]: richText(text) };
  }
  if (schema.type === "url") {
    const url = safeUrl(text);
    return url && url.length <= 2000 ? { url } : null;
  }
  if (schema.type === "email") return validEmail(text) ? { email: validEmail(text) } : null;
  if (schema.type === "phone_number") return validPhone(text) ? { phone_number: validPhone(text) } : null;
  if (["select", "status"].includes(schema.type)) {
    const option = schema[schema.type]?.options?.find(o => identityText(o.name) === identityText(text));
    return option ? { [schema.type]: { name: option.name } } : null;
  }
  if (schema.type === "multi_select") {
    const values = Array.isArray(value) ? value : text.split(/[,;\n]/);
    const options = schema.multi_select?.options ?? [];
    const names = [...new Set(values.map(v => options.find(o => identityText(o.name) === identityText(v))?.name).filter(Boolean))];
    return names.length === values.length ? { multi_select: names.map(name => ({ name })) } : null;
  }
  if (schema.type === "number") {
    const number = Number(text.replace(",", "."));
    return text && Number.isFinite(number) ? { number } : null;
  }
  if (schema.type === "checkbox") {
    if ([true, "true", "áno", "ano", 1, "1"].includes(value)) return { checkbox: true };
    if ([false, "false", "nie", 0, "0"].includes(value)) return { checkbox: false };
    return null;
  }
  if (schema.type === "date") {
    const eu = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
    const date = eu ? `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}` : text;
    const day = date.slice(0, 10);
    const parsed = new Date(day + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
    return { date: { start: date } };
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
  const warnings = [];
  const restricted = lost || adoption || shelter;
  const clean = value => {
    const text = typeof value === "string" ? value.trim() : value;
    if (restricted && geminiPrivateText(text)) {
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
    let cleaned = clean(value);
    if (["Zdroj dát", "Zdroj URL", "Web"].includes(property)) cleaned = safeUrl(cleaned);
    if (["Začiatok", "Koniec", "Dátum udalosti"].includes(property))
      cleaned = notionDraftProperty({ type: "date" }, cleaned)?.date.start ?? "";
    if (["Čas začiatku", "Čas konca"].includes(property)) {
      const time = /^(\d{1,2})[:.](\d{2})$/.exec(String(cleaned));
      cleaned = time && Number(time[1]) < 24 && Number(time[2]) < 60 ? time[1].padStart(2, "0") + ":" + time[2] : "";
    }
    const encoded = notionDraftProperty(schema[property], cleaned);
    if (encoded) result[property] = encoded;
    else if (essential) throw Error("NOTION_DRAFT_SCHEMA_INVALID");
    else warnings.push(`Pole „${property}“ nebolo zapísané pre nepodporovaný typ alebo formát; doplňte ho pri kontrole.`);
  };
  put(title, name, true);
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
  const note = [clean(args.gemini_note), ...new Set(warnings)].filter(Boolean).join("\n\n");
  if (note) put("Gemini poznámka", note);
  return { properties: result, possibleDuplicate, warnings };
}
