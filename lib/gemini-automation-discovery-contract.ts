import { getGeminiCatalogItem, type GeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { GeminiAutomationError } from "./gemini-automation-types.ts";

/** No client-authored prompt or taxonomy fields are accepted at this boundary. */
export const GEMINI_DISCOVERY_SCHEMA_VERSION = 1;
export const GEMINI_DISCOVERY_MAX_CANDIDATES = 100;
export const GEMINI_DISCOVERY_MAX_SOURCES = 8;
export const GEMINI_DISCOVERY_MAX_EVIDENCE = 8;

export type GeminiDiscoveryRequestV1 = {
  schemaVersion: 1;
  stableKey: string;
  section: GeminiCatalogItem["section"];
  subcategory: string;
  categoryLabel: string;
  country: "Slovakia";
  maxCandidates: number;
};

export type GeminiDiscoveryCandidateV1 = {
  name: string;
  primary_url: string | null;
  source_urls: string[];
  description: string | null;
  location: {
    country: "Slovakia";
    region: string | null;
    district: string | null;
    city: string | null;
    address: string | null;
  };
  contacts: {
    phone: string | null;
    email: string | null;
    website: string | null;
    facebook: string | null;
    instagram: string | null;
  };
  confidence: number;
  evidence: Array<{
    source_url: string;
    fields: Array<"name" | "primary_url" | "description" | "location" | "contacts">;
  }>;
};

export type GeminiDiscoveryEnvelopeV1 = {
  schema_version: 1;
  category_key: string;
  candidates: GeminiDiscoveryCandidateV1[];
};

type RecordValue = Record<string, unknown>;
const evidenceFields = ["name", "primary_url", "description", "location", "contacts"] as const;
const candidateKeys = ["name", "primary_url", "source_urls", "description", "location", "contacts", "confidence", "evidence"];
const locationKeys = ["country", "region", "district", "city", "address"];
const contactKeys = ["phone", "email", "website", "facebook", "instagram"];

function invalid(): never { throw new GeminiAutomationError("INVALID_RESPONSE"); }
function asObject(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as RecordValue;
}
function exactKeys(value: RecordValue, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) invalid();
}
function stringValue(value: unknown, max: number, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") return invalid();
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) return invalid();
  return trimmed;
}
function urlValue(value: unknown, nullable = false): string | null {
  const raw = stringValue(value, 2048, nullable);
  if (raw === null) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    const octets = ipv4?.slice(1).map(Number);
    const privateIpv4 = octets && (
      octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
      octets[0] === 169 && octets[1] === 254 ||
      octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 ||
      octets[0] === 192 && octets[1] === 168 ||
      octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127 ||
      octets[0] === 198 && (octets[1] === 18 || octets[1] === 19) ||
      octets[0] >= 224
    );
    if (!["https:", "http:"].includes(parsed.protocol) || !host ||
      parsed.username || parsed.password || privateIpv4 ||
      /^(localhost|.*\.(?:localhost|local|internal))$/i.test(host) ||
      /^\[(?:::|::1|::ffff:|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(host)) return invalid();
    // URL serialization is deterministic (e.g. origin vs origin/, host casing).
    // Do not infer new facts or remove query parameters/path segments.
    return parsed.href;
  } catch { return invalid(); }
}
function nullableFields(value: unknown, keys: readonly string[], limits: Record<string, number>): Record<string, string | null> {
  const object = asObject(value);
  exactKeys(object, keys);
  return Object.fromEntries(keys.map((key) => [key, stringValue(object[key], limits[key], true)]));
}

export function createGeminiDiscoveryRequest(input: { stableKey: string; maxCandidates: number }): GeminiDiscoveryRequestV1 {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).some((key) => !["stableKey", "maxCandidates"].includes(key)) ||
    typeof input.stableKey !== "string") invalid();
  const entry = getGeminiCatalogItem(input.stableKey);
  if (!entry || !Number.isInteger(input.maxCandidates) ||
    input.maxCandidates < 1 || input.maxCandidates > GEMINI_DISCOVERY_MAX_CANDIDATES) invalid();
  return {
    schemaVersion: 1, stableKey: entry.stableKey, section: entry.section,
    subcategory: entry.subcategory, categoryLabel: entry.label,
    country: "Slovakia", maxCandidates: input.maxCandidates,
  };
}

function authoritativeRequest(request: GeminiDiscoveryRequestV1): GeminiDiscoveryRequestV1 {
  const canonical = createGeminiDiscoveryRequest({ stableKey: request?.stableKey, maxCandidates: request?.maxCandidates });
  const object = asObject(request);
  exactKeys(object, Object.keys(canonical));
  if (Object.keys(canonical).some((key) => object[key] !== (canonical as unknown as RecordValue)[key])) invalid();
  return canonical;
}

/** Server-side only. Nothing here references database profiles, Notion or prior candidates. */
export function buildGeminiDiscoveryPrompt(request: GeminiDiscoveryRequestV1): string {
  const item = authoritativeRequest(request);
  return [
    "Discover public dog-related entities for Psipedia.sk.",
    "Section: " + item.section + "; subcategory: " + item.subcategory + "; category: " + item.categoryLabel + ".",
    "Geographic scope: Slovakia (Slovensko) only. Require evidence of a Slovak location or public activity.",
    "Use Google Search grounding and publicly accessible web sources. Prefer an official website,",
    "an official social media page or another trustworthy public source.",
    "Never invent entities, names, contacts, locations, URLs, facts or evidence.",
    "Never create a candidate solely from model knowledge; omit unverified entities.",
    "Every candidate needs at least one verifiable public source URL and concise source-linked evidence.",
    "Use null for unknown optional facts. Do not claim sources support facts they do not support.",
    "Return at most " + item.maxCandidates + " candidates, and return an empty array if none can be grounded.",
    "Set schema_version to 1 and category_key to " + item.stableKey + ".",
    "Do not deduplicate against Psipedia: database comparisons happen in a later independent stage.",
    "Return only the structured JSON response.",
  ].join("\n");
}

/** The provider schema is advisory; parseGeminiDiscoveryEnvelope is the authoritative validator. */
export function buildGeminiDiscoveryJsonSchema(request: GeminiDiscoveryRequestV1) {
  const item = authoritativeRequest(request);
  const nullableString = { type: ["string", "null"] };
  const nullableUrl = { type: ["string", "null"], description: "Absolute HTTP(S) URL or null" };
  const object = (properties: Record<string, unknown>) => ({
    type: "object", properties, required: Object.keys(properties), additionalProperties: false,
  });
  return object({
    schema_version: { type: "integer", enum: [1] },
    category_key: { type: "string", enum: [item.stableKey] },
    candidates: {
      type: "array", minItems: 0, maxItems: item.maxCandidates,
      items: object({
        name: { type: "string", description: "Real public entity name, max 160 characters" },
        primary_url: nullableUrl,
        source_urls: { type: "array", minItems: 1, maxItems: GEMINI_DISCOVERY_MAX_SOURCES, items: { type: "string", description: "Public HTTP(S) source URL" } },
        description: nullableString,
        location: object({ country: { type: "string", enum: ["Slovakia"] }, region: nullableString, district: nullableString, city: nullableString, address: nullableString }),
        contacts: object({ phone: nullableString, email: nullableString, website: nullableUrl, facebook: nullableUrl, instagram: nullableUrl }),
        confidence: { type: "number", minimum: 0, maximum: 1 },
        evidence: { type: "array", minItems: 1, maxItems: GEMINI_DISCOVERY_MAX_EVIDENCE,
          items: object({ source_url: { type: "string" }, fields: { type: "array", minItems: 1, maxItems: evidenceFields.length,
            items: { type: "string", enum: [...evidenceFields] } } }) },
      }),
    },
  });
}

export function parseGeminiDiscoveryEnvelope(value: unknown, request: GeminiDiscoveryRequestV1): GeminiDiscoveryEnvelopeV1 {
  const canonical = authoritativeRequest(request);
  const envelope = asObject(value);
  exactKeys(envelope, ["schema_version", "category_key", "candidates"]);
  if (envelope.schema_version !== 1 || envelope.category_key !== canonical.stableKey ||
    !Array.isArray(envelope.candidates) || envelope.candidates.length > canonical.maxCandidates) invalid();
  const candidates: GeminiDiscoveryCandidateV1[] = envelope.candidates.map((item: unknown) => {
    const raw = asObject(item);
    exactKeys(raw, candidateKeys);
    const name = stringValue(raw.name, 160) as string;
    const primary_url = urlValue(raw.primary_url, true);
    if (!Array.isArray(raw.source_urls) || raw.source_urls.length < 1 ||
      raw.source_urls.length > GEMINI_DISCOVERY_MAX_SOURCES) invalid();
    const source_urls = [...new Set(raw.source_urls.map((source: unknown) => urlValue(source) as string))];
    if (primary_url && !source_urls.includes(primary_url)) invalid();
    const description = stringValue(raw.description, 600, true);
    const loc = asObject(raw.location);
    exactKeys(loc, locationKeys);
    if (loc.country !== "Slovakia") invalid();
    const location = {
      country: "Slovakia" as const,
      region: stringValue(loc.region, 100, true),
      district: stringValue(loc.district, 100, true),
      city: stringValue(loc.city, 100, true),
      address: stringValue(loc.address, 240, true),
    };
    const rawContacts = nullableFields(raw.contacts, contactKeys,
      { phone: 60, email: 254, website: 2048, facebook: 2048, instagram: 2048 });
    const contacts = {
      phone: rawContacts.phone,
      email: rawContacts.email,
      website: urlValue(rawContacts.website, true),
      facebook: urlValue(rawContacts.facebook, true),
      instagram: urlValue(rawContacts.instagram, true),
    };
    if (contacts.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacts.email)) invalid();
    if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) ||
      raw.confidence < 0 || raw.confidence > 1) invalid();
    if (!Array.isArray(raw.evidence) || raw.evidence.length < 1 ||
      raw.evidence.length > GEMINI_DISCOVERY_MAX_EVIDENCE) invalid();
    const evidence = raw.evidence.map((item: unknown) => {
      const entry = asObject(item);
      exactKeys(entry, ["source_url", "fields"]);
      const source_url = urlValue(entry.source_url) as string;
      if (!source_urls.includes(source_url) || !Array.isArray(entry.fields) ||
        entry.fields.length < 1 || entry.fields.length > evidenceFields.length ||
        entry.fields.some((field: unknown) => !evidenceFields.includes(field as (typeof evidenceFields)[number]))) invalid();
      return { source_url, fields: [...new Set(entry.fields)] as GeminiDiscoveryCandidateV1["evidence"][number]["fields"] };
    });
    return { name, primary_url, source_urls, description, location, contacts, confidence: raw.confidence, evidence };
  });
  return { schema_version: 1, category_key: canonical.stableKey, candidates };
}
