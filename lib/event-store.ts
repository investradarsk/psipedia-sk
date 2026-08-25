import { env } from "cloudflare:workers";
import {
  eventTypes,
  slovakRegions,
  type DogEvent,
  type EventStatus,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import { getPortalSubpage } from "@/lib/portal";
import { slugifyArticleTitle } from "@/lib/article-store";
import { cleanEditableSeo, type EditableSeo } from "@/lib/content-seo";

export type ManagedEventInput = {
  slug?: string;
  title?: string;
  excerpt?: string;
  eventType?: string;
  status?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string | null;
  endTime?: string | null;
  venue?: string;
  city?: string;
  region?: string;
  address?: string;
  organizer?: string;
  description?: string;
  practicalInfo?: string;
  websiteUrl?: string | null;
  registrationUrl?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  cancelled?: boolean;
  seo?: EditableSeo;
};

export type ManagedEventSummary = Pick<
  DogEvent,
  | "id"
  | "slug"
  | "title"
  | "eventType"
  | "status"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "city"
  | "organizer"
  | "cancelled"
>;

type EventRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  event_type: string;
  status: string;
  start_date: string;
  start_time: string;
  end_date: string | null;
  end_time: string | null;
  venue: string;
  city: string;
  region: string;
  address: string;
  organizer: string;
  description: string;
  practical_info: string;
  website_url: string | null;
  registration_url: string | null;
  image_url: string | null;
  image_key: string | null;
  cancelled: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
  seo_json: string;
};

type EventSummaryRow = {
  id: number;
  slug: string;
  title: string;
  event_type: string;
  status: string;
  start_date: string;
  start_time: string;
  end_date: string | null;
  end_time: string | null;
  city: string;
  organizer: string;
  cancelled: number;
};

type RuntimeBindings = { DB?: D1Database };

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza podujatí zatiaľ nie je pripojená.");
  return database;
}

async function ensureEventStore(database: D1Database) {
  void database;
  // Schema creation and indexes are handled by deployment migrations.
}

function rowToEvent(row: EventRow): DogEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    eventType: (eventTypes as readonly string[]).includes(row.event_type) ? row.event_type as EventType : "Iné",
    status: row.status === "published" ? "published" : "draft",
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    venue: row.venue,
    city: row.city,
    region: (slovakRegions as readonly string[]).includes(row.region) ? row.region as SlovakRegion : "Online",
    address: row.address,
    organizer: row.organizer,
    description: row.description,
    practicalInfo: row.practical_info,
    websiteUrl: row.website_url,
    registrationUrl: row.registration_url,
    imageUrl: row.image_url,
    imageKey: row.image_key,
    cancelled: Boolean(row.cancelled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    seo: parseSeo(row.seo_json),
  };
}

function parseSeo(value: string): EditableSeo { try { return cleanEditableSeo(JSON.parse(value) as EditableSeo); } catch { return {}; } }

function rowToEventSummary(row: EventSummaryRow): ManagedEventSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    eventType: (eventTypes as readonly string[]).includes(row.event_type) ? row.event_type as EventType : "Iné",
    status: row.status === "published" ? "published" : "draft",
    startDate: row.start_date,
    startTime: row.start_time,
    endDate: row.end_date,
    endTime: row.end_time,
    city: row.city,
    organizer: row.organizer,
    cancelled: Boolean(row.cancelled),
  };
}

function normalizeUrl(value: string | null | undefined, label: string) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error(`${label} nie je platný odkaz.`); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label} musí začínať http:// alebo https://.`);
  return clean;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function validTime(value: string) {
  return !value || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeInput(payload: ManagedEventInput) {
  const title = payload.title?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || title);
  const excerpt = payload.excerpt?.trim() ?? "";
  const eventType = (eventTypes as readonly string[]).includes(payload.eventType ?? "") ? payload.eventType as EventType : null;
  const status: EventStatus = payload.status === "published" ? "published" : "draft";
  const startDate = payload.startDate?.trim() ?? "";
  const startTime = payload.startTime?.trim() ?? "";
  const endDate = payload.endDate?.trim() || null;
  const endTime = payload.endTime?.trim() || null;
  const city = payload.city?.trim() ?? "";
  const region = (slovakRegions as readonly string[]).includes(payload.region ?? "") ? payload.region as SlovakRegion : null;
  const organizer = payload.organizer?.trim() ?? "";
  const description = payload.description?.trim() ?? "";

  if (!title) throw new Error("Doplň názov podujatia.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa podujatia nie je platná.");
  if (getPortalSubpage("podujatia", slug)) throw new Error("Túto adresu už používa podsekcia portálu. Uprav adresu podujatia.");
  if (!eventType) throw new Error("Vyber typ podujatia.");
  if (!validDate(startDate)) throw new Error("Vyber platný dátum začiatku.");
  if (endDate && !validDate(endDate)) throw new Error("Dátum konca nie je platný.");
  if (endDate && endDate < startDate) throw new Error("Koniec podujatia nemôže byť pred začiatkom.");
  if (!validTime(startTime) || !validTime(endTime ?? "")) throw new Error("Čas podujatia nie je platný.");
  if (!city) throw new Error("Doplň mesto alebo označ podujatie ako online.");
  if (!region) throw new Error("Vyber kraj.");
  if (!organizer) throw new Error("Doplň organizátora.");
  if (excerpt.length < 20) throw new Error("Krátky popis by mal mať aspoň 20 znakov.");
  if (description.length < 30) throw new Error("Popis podujatia by mal mať aspoň 30 znakov.");

  const imageUrl = payload.imageUrl?.trim() || null;
  if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) {
    throw new Error("Adresa obrázka nie je platná.");
  }

  return {
    slug, title, excerpt, eventType, status, startDate, startTime, endDate, endTime,
    venue: payload.venue?.trim() ?? "",
    city,
    region,
    address: payload.address?.trim() ?? "",
    organizer,
    description,
    practicalInfo: payload.practicalInfo?.trim() ?? "",
    websiteUrl: normalizeUrl(payload.websiteUrl, "Web podujatia"),
    registrationUrl: normalizeUrl(payload.registrationUrl, "Odkaz na registráciu"),
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    cancelled: Boolean(payload.cancelled),
    seo: cleanEditableSeo(payload.seo),
  };
}

export async function getPublishedEvents() {
  const database = getD1Binding();
  if (!database) return [] as DogEvent[];
  const result = await database.prepare("SELECT * FROM managed_events WHERE status = 'published' ORDER BY start_date ASC, start_time ASC, id ASC").all<EventRow>();
  return result.results.map(rowToEvent);
}

export async function getUpcomingEvents(limit = 2) {
  const database = getD1Binding();
  if (!database) return [] as DogEvent[];
  const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
  const today = new Date().toISOString().slice(0, 10);
  const result = await database
    .prepare("SELECT * FROM managed_events WHERE status = 'published' AND cancelled = 0 AND COALESCE(end_date, start_date) >= ? ORDER BY start_date ASC, start_time ASC, id ASC LIMIT ?")
    .bind(today, safeLimit)
    .all<EventRow>();
  return result.results.map(rowToEvent);
}

export async function getPublishedEvent(slug: string) {
  const database = getD1Binding();
  if (!database) return null;
  const row = await database.prepare("SELECT * FROM managed_events WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first<EventRow>();
  return row ? rowToEvent(row) : null;
}

export async function listManagedEventSummaries(limit = 100) {
  const database = requireD1Binding();
  await ensureEventStore(database);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const result = await database.prepare(`
    SELECT id, slug, title, event_type, status, start_date, start_time, end_date, end_time, city, organizer, cancelled
    FROM managed_events
    ORDER BY start_date DESC, updated_at DESC, id DESC
    LIMIT ?
  `).bind(safeLimit).all<EventSummaryRow>();
  return result.results.map(rowToEventSummary);
}

export async function getManagedEventById(id: number) {
  const database = requireD1Binding();
  await ensureEventStore(database);
  const row = await database.prepare("SELECT * FROM managed_events WHERE id = ? LIMIT 1").bind(id).first<EventRow>();
  return row ? rowToEvent(row) : null;
}

export async function createManagedEvent(payload: ManagedEventInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureEventStore(database);
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO managed_events (
      slug, title, excerpt, event_type, status, start_date, start_time, end_date, end_time,
      venue, city, region, address, organizer, description, practical_info,
      website_url, registration_url, image_url, image_key, cancelled, seo_json,
      created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    input.slug, input.title, input.excerpt, input.eventType, input.status, input.startDate, input.startTime,
    input.endDate, input.endTime, input.venue, input.city, input.region, input.address, input.organizer,
    input.description, input.practicalInfo, input.websiteUrl, input.registrationUrl, input.imageUrl, input.imageKey,
    input.cancelled ? 1 : 0, JSON.stringify(input.seo), now, now, input.status === "published" ? now : null, editorEmail, editorEmail,
  ).first<EventRow>();
  if (!row) throw new Error("Podujatie sa nepodarilo vytvoriť.");
  return rowToEvent(row);
}

export async function updateManagedEvent(id: number, payload: ManagedEventInput, editorEmail: string, existingEvent?: DogEvent) {
  const database = requireD1Binding();
  await ensureEventStore(database);
  const existing = existingEvent ?? await getManagedEventById(id);
  if (!existing) return null;
  const input = normalizeInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.publishedAt ?? now : existing.publishedAt;
  const row = await database.prepare(`
    UPDATE managed_events SET
      slug = ?, title = ?, excerpt = ?, event_type = ?, status = ?, start_date = ?, start_time = ?,
      end_date = ?, end_time = ?, venue = ?, city = ?, region = ?, address = ?, organizer = ?,
      description = ?, practical_info = ?, website_url = ?, registration_url = ?, image_url = ?, image_key = ?,
      cancelled = ?, seo_json = ?, updated_at = ?, published_at = ?, updated_by = ?
    WHERE id = ? RETURNING *
  `).bind(
    input.slug, input.title, input.excerpt, input.eventType, input.status, input.startDate, input.startTime,
    input.endDate, input.endTime, input.venue, input.city, input.region, input.address, input.organizer,
    input.description, input.practicalInfo, input.websiteUrl, input.registrationUrl, input.imageUrl, input.imageKey,
    input.cancelled ? 1 : 0, JSON.stringify(input.seo), now, publishedAt, editorEmail, id,
  ).first<EventRow>();
  return row ? rowToEvent(row) : null;
}

export async function deleteManagedEvent(id: number) {
  const database = requireD1Binding();
  await ensureEventStore(database);
  const row = await database.prepare("DELETE FROM managed_events WHERE id = ? RETURNING *").bind(id).first<EventRow>();
  return row ? rowToEvent(row) : null;
}

export function isEventSlugConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("managed_events.slug");
}
