import type { GeminiD1 } from "./gemini-automation-store.ts";

/**
 * Read-only canonical comparison for the four existing Help storage models.
 * All statuses count: a private/archived canonical record is still an identity.
 * No private contact, full address, GEO or unpublished content is queried.
 */
export type HelpDedupeStatus = "NEW" | "DUPLICATE" | "POSSIBLE_DUPLICATE" | "BLOCKED";
export type HelpIdentity = {
  name: string; city: string; website: string; source: string;
  start_date: string; organizer: string; venue: string; type: string;
};
type Row = Record<string, string | number | null>;
const MAX_ROWS = 5000;
const normalize = (value: unknown) => typeof value === "string"
  ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") : "";
const same = (a: unknown, b: unknown) => Boolean(normalize(a) && normalize(a) === normalize(b));
const normalizedUrl = (value: unknown): string => {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return ""; }
};
const sharedUrl = (a: unknown, b: unknown) => Boolean(normalizedUrl(a)
  && normalizedUrl(a) === normalizedUrl(b));

async function readAll(db: GeminiD1, sql: string): Promise<Row[]> {
  // Static SQL only; inspect the complete model or fail closed at the safety ceiling.
  const result = await db.prepare(sql).bind(MAX_ROWS + 1).all<Row>();
  if (!Array.isArray(result?.results) || result.results.length > MAX_ROWS)
    throw Error("GEMINI_HELP_CANONICAL_SCAN_INCOMPLETE");
  return result.results;
}
const stronger = (current: HelpDedupeStatus, incoming: HelpDedupeStatus): HelpDedupeStatus =>
  current === "DUPLICATE" || incoming === "DUPLICATE" ? "DUPLICATE"
  : current === "POSSIBLE_DUPLICATE" || incoming === "POSSIBLE_DUPLICATE"
    ? "POSSIBLE_DUPLICATE" : "NEW";

function genericCase(candidate: HelpIdentity, stableKey: string, row: Row): HelpDedupeStatus {
  const category = stableKey.slice("help.".length);
  const name = same(candidate.name, row.title);
  const source = sharedUrl(candidate.source, row.action_url)
    || sharedUrl(candidate.website, row.action_url);
  if (source && name && same(row.category, category)) return "DUPLICATE";
  if (source) return "POSSIBLE_DUPLICATE";
  if (name && (same(candidate.city, row.city) || same(candidate.organizer, row.organization)))
    return "POSSIBLE_DUPLICATE";
  return "NEW";
}
function organization(candidate: HelpIdentity, row: Row): HelpDedupeStatus {
  const name = same(candidate.name, row.name);
  const city = same(candidate.city, row.city);
  const site = sharedUrl(candidate.website, row.website_url);
  const source = sharedUrl(candidate.source, row.source_url);
  if (name && city && (site || source)) return "DUPLICATE";
  if (source || (name && (city || site)) || (site && city)) return "POSSIBLE_DUPLICATE";
  return "NEW";
}
function adoption(candidate: HelpIdentity, row: Row): HelpDedupeStatus {
  const name = same(candidate.name, row.name);
  const org = same(candidate.organizer, row.organization_name);
  const source = sharedUrl(candidate.source, row.external_source_url);
  if (name && org && source) return "DUPLICATE";
  if (source || (name && (org || same(candidate.city, row.city)))) return "POSSIBLE_DUPLICATE";
  return "NEW";
}
function lostFound(candidate: HelpIdentity, row: Row): HelpDedupeStatus {
  const source = sharedUrl(candidate.source, row.source_url);
  if (source && same(candidate.type, row.type)
      && candidate.start_date === row.event_date) return "DUPLICATE";
  if (source || (same(candidate.type, row.type)
    && candidate.start_date === row.event_date && same(candidate.city, row.city)))
    return "POSSIBLE_DUPLICATE";
  return "NEW";
}

/** Canonical D1 identity preflight. Never creates or updates profiles. */
export async function checkGeminiHelpCanonicalDedupe(
  db: GeminiD1, stableKey: string, candidate: HelpIdentity,
): Promise<HelpDedupeStatus> {
  if (!stableKey.startsWith("help.") || !candidate.name.trim()
    || !normalizedUrl(candidate.source || candidate.website)) return "BLOCKED";
  if (stableKey === "help.stratene-a-najdene" &&
    (!["LOST", "FOUND"].includes(candidate.type) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(candidate.start_date) ||
      !candidate.city.trim() || !normalizedUrl(candidate.source))) return "BLOCKED";
  if (stableKey === "help.adopcia" && (!candidate.organizer.trim()
    || !normalizedUrl(candidate.source))) return "BLOCKED";
  if (stableKey === "help.utulky" && !candidate.city.trim()) return "BLOCKED";
  // City and organization may be missing on a publicly sourced private
  // proposal. A candidate must instead have its own verifiable source URL.
  if (["help.docasna-opatera", "help.zbierky", "help.dobrovolnictvo"].includes(stableKey)
    && !normalizedUrl(candidate.source)) return "BLOCKED";

  let outcome: HelpDedupeStatus = "NEW";
  if (["help.docasna-opatera", "help.zbierky", "help.dobrovolnictvo"].includes(stableKey)) {
    const rows = await readAll(db, "SELECT id,title,category,organization,city,action_url,status FROM help_cases ORDER BY id LIMIT ?");
    for (const row of rows) outcome = stronger(outcome, genericCase(candidate, stableKey, row));
  } else if (stableKey === "help.utulky") {
    const rows = await readAll(db, "SELECT id,name,city,website_url,source_url,type,status FROM help_organizations ORDER BY id LIMIT ?");
    for (const row of rows) outcome = stronger(outcome, organization(candidate, row));
    // A shelter might already have a Directory record, even if no Help record exists.
    const directory = await readAll(db, "SELECT id,name,city,website_url,status FROM directory_profiles ORDER BY id LIMIT ?");
    for (const row of directory) {
      if (same(candidate.name, row.name) &&
        (same(candidate.city, row.city) || sharedUrl(candidate.website, row.website_url)))
        outcome = stronger(outcome, "POSSIBLE_DUPLICATE");
    }
  } else if (stableKey === "help.adopcia") {
    const rows = await readAll(db,
      "SELECT id,name,city,organization_name,external_source_url,status FROM adoption_dogs ORDER BY id LIMIT ?");
    for (const row of rows) outcome = stronger(outcome, adoption(candidate, row));
  } else if (stableKey === "help.stratene-a-najdene") {
    const rows = await readAll(db,
      "SELECT id,type,dog_name,event_date,city,source_url,status FROM lost_found_dog_reports ORDER BY id LIMIT ?");
    for (const row of rows) outcome = stronger(outcome, lostFound(candidate, row));
  } else return "BLOCKED";
  return outcome;
}
