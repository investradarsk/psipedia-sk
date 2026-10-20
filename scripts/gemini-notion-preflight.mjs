import { normalizeIdentity, canonicalIdentityUrl, sameDirectoryIdentity } from "./gemini-notion-identity.mjs";
import { externalWorkerCategorySupported } from "./gemini-notion-category.mjs";

// Pure, offline-safe Notion identity gate. No private contacts, coordinates,
// approximate addresses, publication controls or editorial notes are consulted.
function value(page, key) {
  const property = page?.properties?.[key];
  if (!property) return "";
  if (property.date?.start) return String(property.date.start).slice(0, 10);
  if (typeof property.url === "string") return property.url;
  if (typeof property.select?.name === "string") return property.select.name;
  if (typeof property.status?.name === "string") return property.status.name;
  const entries = property.title ?? property.rich_text ?? [];
  return Array.isArray(entries) ? entries.map(item => item.plain_text ?? item.text?.content ?? "").join("") : "";
}
const same = (a, b) => Boolean(normalizeIdentity(a) && normalizeIdentity(a) === normalizeIdentity(b));
const url = v => canonicalIdentityUrl(v);
const sharedSource = (a, b) => Boolean(url(a) && url(a) === url(b));
function identity(page, key) {
  return {
    name: value(page, key === "help.adopcia" ? "Meno" : "Názov"),
    city: value(page, "Mesto"), website: value(page, "Web"),
    source: value(page, "Zdroj URL") || value(page, "Zdroj dát"),
    date: value(page, "Začiatok") || value(page, "Dátum udalosti"),
    organizer: value(page, "Organizátor") || value(page, "Organizácia"),
    venue: value(page, "Miesto"), type: value(page, "Typ"),
  };
}
function comparison(key, candidate, existing) {
  const name = same(candidate.name, existing.name);
  if (key.startsWith("events.")) {
    if (!name) return "NEW";
    if (!candidate.date || !existing.date) return "POSSIBLE_DUPLICATE";
    if (candidate.date !== existing.date) return "NEW";
    if ((candidate.organizer && same(candidate.organizer, existing.organizer)) ||
        (candidate.city && same(candidate.city, existing.city)) ||
        sharedSource(candidate.website || candidate.source, existing.website || existing.source))
      return "DUPLICATE";
    return "POSSIBLE_DUPLICATE";
  }
  if (key === "help.stratene-a-najdene") {
    if (candidate.date && existing.date && candidate.date !== existing.date) return "NEW";
    if (candidate.type && existing.type && !same(candidate.type, existing.type)) return "NEW";
    if (sharedSource(candidate.source, existing.source) &&
        (!candidate.date || !existing.date || candidate.date === existing.date)) return "DUPLICATE";
    return name ? "POSSIBLE_DUPLICATE" : "NEW"; // Unknown location is ambiguity, not clearance.
  }
  if (key === "help.adopcia") {
    if (!name) return "NEW";
    if (sharedSource(candidate.source, existing.source) &&
      candidate.organizer && same(candidate.organizer, existing.organizer)) return "DUPLICATE";
    return "POSSIBLE_DUPLICATE"; // Common dog names never establish confirmed identity.
  }
  if (key === "help.utulky" || key.startsWith("directory.")) {
    if (sameDirectoryIdentity(candidate, existing)) return "DUPLICATE";
    const conflictingCities = candidate.city && existing.city && !same(candidate.city, existing.city);
    if (name && !conflictingCities) return "POSSIBLE_DUPLICATE";
    if (sharedSource(candidate.website || candidate.source, existing.website || existing.source))
      return "POSSIBLE_DUPLICATE"; // Shared domains can represent distinct branches.
    return "NEW";
  }
  if (!name) return "NEW";
  if (candidate.date && existing.date && candidate.date !== existing.date) return "NEW";
  if (sharedSource(candidate.source, existing.source) && candidate.city && same(candidate.city, existing.city))
    return "DUPLICATE";
  return "POSSIBLE_DUPLICATE";
}

/** All 22 worker categories, including published and archived Notion rows. */
export function classifyGeminiNotionIdentity(stableKey, properties, rows) {
  if (!externalWorkerCategorySupported(stableKey) || !Array.isArray(rows) ||
      !properties || typeof properties !== "object") return "BLOCKED";
  const candidate = identity({ properties }, stableKey);
  if (!candidate.name || candidate.name.length > 160) return "BLOCKED";
  let possible = false;
  for (const page of rows) {
    if (!page || !page.properties) return "BLOCKED";
    const status = comparison(stableKey, candidate, identity(page, stableKey));
    if (status === "DUPLICATE") return "DUPLICATE";
    if (status === "POSSIBLE_DUPLICATE") possible = true;
  }
  return possible ? "POSSIBLE_DUPLICATE" : "NEW";
}

/** Deliberately small public identity payload; never serialize the full draft. */
export function geminiDedupeCandidate(stableKey, properties) {
  if (!externalWorkerCategorySupported(stableKey)) throw Error("GEMINI_DEDUPE_INVALID_SCOPE");
  const item = identity({ properties }, stableKey);
  return {
    name: item.name, city: item.city, website: item.website,
    source: item.source, start_date: item.date, organizer: item.organizer,
    venue: item.venue, type: item.type,
  };
}

/** Only business-public Directory fields. Identity and sensitive-location fields
 * are intentionally excluded; a matching profile is never edited here.
 */
export function geminiDirectoryQualityProposal(stableKey, properties) {
  if (!stableKey.startsWith("directory.") || !properties || typeof properties !== "object")
    return {};
  const read = name => {
    const field = properties[name];
    if (!field || typeof field !== "object") return "";
    const direct = field.url ?? field.email ?? field.phone_number;
    if (typeof direct === "string") return direct.trim().slice(0,2048);
    const items = field.rich_text ?? field.title ?? [];
    return Array.isArray(items)
      ? items.map(item => item?.plain_text ?? item?.text?.content ?? "").join("").trim().slice(0,2048)
      : "";
  };
  const mapping = {
    websiteUrl:"Web",publicPhone:"Telefón",publicEmail:"E-mail",
    facebookUrl:"Facebook",instagramUrl:"Instagram",
  };
  return Object.fromEntries(Object.entries(mapping).map(([key,name])=>[key,read(name)]).filter(([,val])=>val));
}

/** Public-only update candidates for existing approved Events and Help feeds.
 * No exact address, private contacts, patient data, status or publishing fields.
 * If no suitable public field exists, the signed gate returns NO_CHANGES.
 */
export function geminiFeedQualityProposal(stableKey, properties) {
  if (!stableKey.startsWith("events.") && !stableKey.startsWith("help.")) return {};
  const read=name=>{
    const field=properties?.[name];
    if (!field || typeof field!=="object")return "";
    const direct=field.url;
    if (typeof direct==="string")return direct.trim().slice(0,2048);
    const values=field.rich_text??field.title??[];
    return Array.isArray(values)?values.map(x=>x?.plain_text??x?.text?.content??"").join("").trim().slice(0,1024):"";
  };
  let mapping;
  if(stableKey.startsWith("events.")) mapping={excerpt:"Perex",websiteUrl:"Web",registrationUrl:"Registrácia"};
  else if(stableKey==="help.utulky")mapping={shortDescription:"Krátky popis",websiteUrl:"Web"};
  else if(stableKey==="help.adopcia")mapping={shortDescription:"Krátky popis",breedName:"Plemeno",color:"Farba"};
  else if(stableKey==="help.stratene-a-najdene")mapping={dogName:"Meno psa",breed:"Plemeno",color:"Farba"};
  else if(["help.docasna-opatera","help.zbierky","help.dobrovolnictvo"].includes(stableKey))
    mapping={excerpt:"Perex",actionUrl:"Web"};
  else return {};
  return Object.fromEntries(Object.entries(mapping).map(([key,name])=>[key,read(name)]).filter(([,value])=>value));
}
