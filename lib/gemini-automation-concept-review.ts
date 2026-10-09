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

export type GeminiEventReviewConcept = {
  id:number;stableKey:string;canonicalEntityId:number;notionPageId:string|null;
  name:string;category:string;startDate:string;startTime:string;endDate:string|null;
  endTime:string|null;organizer:string;venue:string;city:string;region:string;
  description:string;website:string;registrationUrl:string;primarySourceUrl:string|null;
  sourceUrls:string[];discoveredAt:string;
};
type EventReviewRow = {
  concept_id:number;stable_key:string;canonical_entity_id:number;notion_page_id:string|null;
  primary_source_url:string|null;source_urls_json:string;discovered_at:string;
  title:string;event_type:string;start_date:string;start_time:string;end_date:string|null;
  end_time:string|null;organizer:string;venue:string;city:string;region:string;
  description:string;website_url:string|null;registration_url:string|null;
};
/** One canonical Event review queue; human publish still happens only in /admin/podujatia/[id]. */
export async function listPendingGeminiEventConcepts(db:GeminiD1,limit=50):Promise<GeminiEventReviewConcept[]> {
  const bounded=Number.isSafeInteger(limit)?Math.min(50,Math.max(1,limit)):50;
  const rows=await db.prepare(
    "SELECT c.id AS concept_id,c.stable_key,c.canonical_entity_id,c.notion_page_id, "+
    "c.primary_source_url,c.source_urls_json,c.discovered_at, "+
    "e.title,e.event_type,e.start_date,e.start_time,e.end_date,e.end_time,e.organizer, "+
    "e.venue,e.city,e.region,e.description,e.website_url,e.registration_url "+
    "FROM gemini_automation_concepts c JOIN managed_events e ON e.id=c.canonical_entity_id "+
    "WHERE c.canonical_entity_type='EVENT' AND c.status='NOTION_LINKED' AND "+
    "c.canonical_entity_id IS NOT NULL AND e.status='draft' AND "+
    "NOT EXISTS(SELECT 1 FROM gemini_automation_event_rejections r WHERE "+
    "r.concept_id=c.id OR (r.canonical_event_id=e.id AND r.stable_key=c.stable_key)) "+
    "ORDER BY c.discovered_at DESC,c.id DESC LIMIT ?"
  ).bind(bounded).all<EventReviewRow>();
  return (rows.results??[]).map(row=>({
    id:row.concept_id,stableKey:row.stable_key,canonicalEntityId:row.canonical_entity_id,
    notionPageId:row.notion_page_id,name:row.title,category:row.event_type,startDate:row.start_date,
    startTime:row.start_time,endDate:row.end_date,endTime:row.end_time,
    organizer:row.organizer,venue:row.venue,city:row.city,region:row.region,
    description:row.description,website:row.website_url??"",registrationUrl:row.registration_url??"",
    primarySourceUrl:safeGeminiReviewUrl(row.primary_source_url),
    sourceUrls:sourceUrls(row.primary_source_url,row.source_urls_json),discoveredAt:row.discovered_at,
  }));
}
