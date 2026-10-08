import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { createGeminiDiscoveryRequest, parseGeminiDiscoveryEnvelope, type GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import { readDirectoryPublicContacts, type DirectoryImportData } from "./directory-profile-metadata.ts";
import type { GeminiD1 } from "./gemini-automation-store.ts";
import { geminiCandidateSignals, normalizeGeminiCity, normalizeGeminiEmail,
  normalizeGeminiName, normalizeGeminiPhone, normalizeGeminiWebsite, isSharedGeminiDomain,
  type GeminiSignals } from "./gemini-automation-identity.ts";
import { isGeminiCandidateRejected } from "./gemini-automation-dedupe-store.ts";

export type GeminiDedupeStatus = "NEW" | "DUPLICATE" | "POSSIBLE_DUPLICATE" | "REJECTED_BEFORE";
export type GeminiDedupeResult = {
  status: GeminiDedupeStatus;
  reasonCodes: string[];
  matchedSignals: string[];
  matchedEntityType: "directory" | null;
  matchedEntityId: number | null;
  matchedDraftId: number | null;
};
type DirectoryRow = {
  id: number; category: string; status: string; name: string; city: string;
  website_url: string | null; source_data_json: string;
};
type Matched = { row: DirectoryRow; reasons: string[]; signals: string[] };
const MAX_CANONICAL_ROWS = 10000;
const MAX_AUDIT_SIGNALS = 5;
function result(status: GeminiDedupeStatus, reasons: string[], signals: string[], row?: DirectoryRow): GeminiDedupeResult {
  return {
    status, reasonCodes: reasons.slice(0, MAX_AUDIT_SIGNALS), matchedSignals: signals.slice(0, MAX_AUDIT_SIGNALS),
    matchedEntityType: row ? "directory" : null, matchedEntityId: row?.id ?? null,
    matchedDraftId: row?.status === "draft" ? row.id : null,
  };
}
function parsePublicContacts(raw: string): DirectoryImportData {
  try {
    if (raw.length > 65536) throw new Error("GEMINI_DEDUPE_CANONICAL_DATA_INVALID");
    const data: unknown = JSON.parse(raw);
    return data && typeof data === "object" && !Array.isArray(data) ? data as DirectoryImportData : {};
  } catch { throw new Error("GEMINI_DEDUPE_CANONICAL_DATA_INVALID"); }
}
function rowSignals(row: DirectoryRow): GeminiSignals {
  const contacts = readDirectoryPublicContacts(parsePublicContacts(row.source_data_json ?? "{}"), row.website_url ?? "");
  return {
    name: normalizeGeminiName(row.name), city: normalizeGeminiCity(row.city),
    website: normalizeGeminiWebsite(row.website_url || contacts.website),
    phone: normalizeGeminiPhone(contacts.phone), email: normalizeGeminiEmail(contacts.email),
  };
}
function compare(candidate: GeminiSignals, existing: GeminiSignals): { strength: 0 | 1 | 2; reasons: string[]; signals: string[] } {
  const sameName = Boolean(candidate.name && candidate.name === existing.name);
  const cityKnown = Boolean(candidate.city && existing.city);
  const sameCity = cityKnown && candidate.city === existing.city;
  const sameUrl = Boolean(candidate.website && existing.website && candidate.website.url === existing.website.url);
  const sameDomain = Boolean(candidate.website && existing.website &&
    candidate.website.domain === existing.website.domain && !isSharedGeminiDomain(candidate.website.domain));
  const samePhone = Boolean(candidate.phone && candidate.phone === existing.phone);
  const sameEmail = Boolean(candidate.email && candidate.email === existing.email);
  const strong = [];
  if (samePhone) strong.push("PHONE_EXACT");
  if (sameEmail) strong.push("EMAIL_EXACT");
  // A shared homepage is not proof of one branch when cities explicitly conflict.
  if (sameUrl && sameName && (!cityKnown || sameCity)) strong.push("URL_NAME_EXACT");
  if (sameDomain && sameName && sameCity) strong.push("DOMAIN_NAME_CITY_EXACT");
  if (strong.length) return { strength: 2, reasons: strong, signals: strong.map((s) => s.split("_")[0].toLowerCase()) };
  const possible = [];
  if (sameUrl) possible.push("URL_SHARED");
  if (sameDomain && sameName) possible.push("DOMAIN_NAME_SHARED");
  if (sameName && sameCity) possible.push("NAME_CITY_EXACT");
  if (sameName && !cityKnown) possible.push("NAME_LOCATION_UNKNOWN");
  return possible.length
    ? { strength: 1, reasons: possible, signals: [sameUrl ? "url" : sameDomain ? "domain" : "name"] }
    : { strength: 0, reasons: [], signals: [] };
}

/**
 * Dedupe policy boundary: directory is supported; events/help fail closed pending
 * their type-specific contracts in phases 9/10. No accidental NEW for unchecked data.
 *
 * Precedence: REJECTED_BEFORE > canonical DUPLICATE > POSSIBLE_DUPLICATE > NEW.
 * Entire canonical directory is inspected (published, draft and archived). If the
 * safety ceiling is reached, fail closed rather than misclassify unseen rows as NEW.
 */
export async function checkGeminiCandidateDedupe(
  db: GeminiD1, input: {
    stableKey: string; section: "directory" | "events" | "help"; subcategory: string;
    candidate: GeminiDiscoveryCandidateV1;
  },
): Promise<GeminiDedupeResult> {
  const catalog = getGeminiCatalogItem(input?.stableKey);
  if (!catalog || catalog.section !== input.section || catalog.subcategory !== input.subcategory)
    throw new Error("GEMINI_DEDUPE_INVALID_SCOPE");
  // Guard against use with an unparsed/raw provider shape; the only accepted
  // contract is the strict, validated Discovery Candidate V1.
  createGeminiDiscoveryRequest({ stableKey: input.stableKey, maxCandidates: 1 });
  try {
    const request = createGeminiDiscoveryRequest({ stableKey: input.stableKey, maxCandidates: 1 });
    parseGeminiDiscoveryEnvelope({ schema_version: 1, category_key: request.stableKey,
      candidates: [input.candidate] }, request);
  } catch { throw new Error("GEMINI_DEDUPE_INVALID_CANDIDATE"); }
  if (input.section !== "directory") throw new Error("GEMINI_DEDUPE_POLICY_NOT_READY");
  const candidate = geminiCandidateSignals(input.candidate);
  if (!candidate.name) throw new Error("GEMINI_DEDUPE_INVALID_CANDIDATE");
  const rejected = await isGeminiCandidateRejected(db, input);
  if (rejected) return result("REJECTED_BEFORE", ["REJECTION_MEMORY_MATCH"], [rejected.identityKind]);
  const rows = await db.prepare(`SELECT id, category, status, name, city, website_url, source_data_json
    FROM directory_profiles ORDER BY id ASC LIMIT ?`).bind(MAX_CANONICAL_ROWS + 1).all<DirectoryRow>();
  if (rows.results.length > MAX_CANONICAL_ROWS) throw new Error("GEMINI_DEDUPE_CANONICAL_LIMIT");
  let exact: Matched | null = null;
  let possible: Matched | null = null;
  for (const row of rows.results) {
    const match = compare(candidate, rowSignals(row));
    if (!match.strength) continue;
    const item = { row, reasons: match.reasons, signals: match.signals };
    if (match.strength === 2 && !exact) exact = item;
    if (match.strength === 1 && !possible) possible = item;
  }
  if (exact) return result("DUPLICATE", exact.reasons, exact.signals, exact.row);
  if (possible) return result("POSSIBLE_DUPLICATE", possible.reasons, possible.signals, possible.row);
  return result("NEW", ["NO_CANONICAL_OR_REJECTION_MATCH"], []);
}

/** Future run mapping; possible matches are NOT counted as definitive duplicates. */
export function geminiDedupeCountsAsDuplicate(status: GeminiDedupeStatus): boolean {
  return status === "DUPLICATE" || status === "REJECTED_BEFORE";
}
