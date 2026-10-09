import type { GeminiD1 } from "./gemini-automation-store.ts";
import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";

export type GeminiDirectoryReviewConcept = {
  id: number;
  stableKey: string;
  canonicalEntityId: number;
  notionPageId: string | null;
  name: string;
  category: string;
  city: string;
  district: string;
  region: string;
  description: string;
  website: string;
  phone: string;
  email: string;
  facebook: string;
  instagram: string;
  primarySourceUrl: string | null;
  sourceUrls: string[];
  discoveredAt: string;
};

type ReviewRow = {
  concept_id: number;
  stable_key: string;
  canonical_entity_id: number;
  notion_page_id: string | null;
  primary_source_url: string | null;
  source_urls_json: string;
  discovered_at: string;
  name: string;
  category: string;
  city: string;
  district: string;
  region: string;
  description: string;
  website_url: string | null;
  source_data_json: string;
};

export type GeminiLinkedConcept = {
  id: number;
  stable_key: string;
  canonical_entity_type: string;
  canonical_entity_id: number | null;
  status: string;
};

export function safeGeminiReviewUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sourceUrls(primary: string | null, serialized: string): string[] {
  let parsed: unknown = [];
  if (serialized.length <= 40_000) {
    try { parsed = JSON.parse(serialized); } catch { /* Ignore malformed provider data. */ }
  }
  const sources = [primary, ...(Array.isArray(parsed) ? parsed.slice(0, 8) : [])];
  return [...new Set(sources.map(safeGeminiReviewUrl).filter((url): url is string => Boolean(url)))];
}

function contactsFromSourceData(raw: string, website: string | null) {
  let data: Record<string, string | number | null> | null = null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      data = Object.fromEntries(Object.entries(value).filter(([, item]) =>
        item === null || typeof item === "string" || typeof item === "number"));
    }
  } catch { /* The canonical profile remains reviewable if metadata is malformed. */ }
  return readDirectoryPublicContacts(data, website ?? "");
}

function reviewRow(row: ReviewRow): GeminiDirectoryReviewConcept {
  const contacts = contactsFromSourceData(row.source_data_json, row.website_url);
  return {
    id: row.concept_id,
    stableKey: row.stable_key,
    canonicalEntityId: row.canonical_entity_id,
    notionPageId: row.notion_page_id,
    name: row.name,
    category: row.category,
    city: row.city,
    district: row.district,
    region: row.region,
    description: row.description,
    website: contacts.website,
    phone: contacts.phone,
    email: contacts.email,
    facebook: contacts.facebook,
    instagram: contacts.instagram,
    primarySourceUrl: safeGeminiReviewUrl(row.primary_source_url),
    sourceUrls: sourceUrls(row.primary_source_url, row.source_urls_json),
    discoveredAt: row.discovered_at,
  };
}

/** Bounded read-only canonical join. Bridge-incomplete or non-draft profiles never appear. */
export async function listPendingGeminiDirectoryConcepts(db: GeminiD1, limit = 50) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.min(50, Math.max(1, limit)) : 50;
  const result = await db.prepare(
    "SELECT c.id AS concept_id, c.stable_key, c.canonical_entity_id, c.notion_page_id, " +
    "c.primary_source_url, c.source_urls_json, c.discovered_at, " +
    "d.name, d.category, d.city, d.district, d.region, d.description, " +
    "d.website_url, d.source_data_json " +
    "FROM gemini_automation_concepts c " +
    "JOIN directory_profiles d ON d.id = c.canonical_entity_id " +
    "WHERE c.canonical_entity_type = 'DIRECTORY' AND c.status = 'NOTION_LINKED' " +
    "AND c.canonical_entity_id IS NOT NULL AND d.status = 'draft' " +
    "ORDER BY c.discovered_at DESC, c.id DESC LIMIT ?"
  ).bind(boundedLimit).all<ReviewRow>();
  return (result.results ?? []).map(reviewRow);
}

export async function getLinkedGeminiConcept(db: GeminiD1, id: number): Promise<GeminiLinkedConcept | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return db.prepare(
    "SELECT id, stable_key, canonical_entity_type, canonical_entity_id, status " +
    "FROM gemini_automation_concepts WHERE id = ? LIMIT 1"
  ).bind(id).first<GeminiLinkedConcept>();
}
