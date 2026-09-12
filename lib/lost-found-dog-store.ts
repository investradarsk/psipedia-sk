import { env } from "cloudflare:workers";
import { cache } from "react";
import { defaultLostFoundExpiresAt, effectiveLostFoundStatus, expiredArchiveThreshold, LOST_FOUND_STATUSES, type LostFoundStatus } from "@/lib/lost-found-lifecycle.js";
import {
  chipStates,
  dogReportTypes,
  dogSexes,
  dogSizes,
  publicLocationPrecisions,
  type AdminDogReport,
  type AdminDogReportFilters,
  type BreedOption,
  type ChipState,
  type DogReportFilters,
  type DogReportType,
  type DogSex,
  type DogSize,
  type PublicDogReport,
  type PublicLocationPrecision,
} from "@/lib/lost-found-dogs";

type RuntimeBindings = { DB?: D1Database };

type ReportRow = {
  id: number;
  type: string;
  status: string;
  slug: string;
  dog_name: string | null;
  sex: string;
  breed_id: number | null;
  breed: string;
  breed_unknown: number;
  breed_slug: string | null;
  color: string;
  approximate_age: string;
  size: string;
  description: string;
  distinguishing_marks: string;
  collar_description: string;
  chipped: string;
  main_image: string | null;
  main_image_key?: string | null;
  gallery_json: string;
  event_date: string;
  last_seen_date_time: string | null;
  region: string;
  district: string;
  city: string;
  location_description: string;
  public_latitude: number | null;
  public_longitude: number | null;
  public_location_precision: string;
  public_contact_note: string;
  source: string;
  source_url: string | null;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  resolved_at: string | null;
  private_contact_name?: string | null;
  private_contact_phone?: string | null;
  private_contact_email?: string | null;
  duplicate_of_id?: number | null;
  duplicate_reason?: string;
  private_note?: string;
  created_at?: string;
  archived_at?: string | null;
  private_created_by?: string;
  private_updated_by?: string;
};

export type ManagedDogReportInput = {
  type?: string;
  status?: string;
  slug?: string;
  dogName?: string | null;
  sex?: string;
  breedId?: number | string | null;
  breed?: string;
  breedUnknown?: boolean;
  color?: string;
  approximateAge?: string;
  size?: string;
  description?: string;
  distinguishingMarks?: string;
  collarDescription?: string;
  chipped?: string;
  mainImage?: string | null;
  mainImageKey?: string | null;
  gallery?: string[];
  eventDate?: string;
  lastSeenDateTime?: string | null;
  region?: string;
  district?: string;
  city?: string;
  locationDescription?: string;
  publicLatitude?: number | string | null;
  publicLongitude?: number | string | null;
  publicLocationPrecision?: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  publicContactNote?: string;
  source?: string;
  sourceUrl?: string | null;
  expiresAt?: string | null;
  duplicateOfId?: number | string | null;
  duplicateReason?: string;
  internalNote?: string;
};

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza stratených a nájdených psov nie je pripojená.");
  return database;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? value as T : fallback;
}

function safeGallery(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch { return []; }
}

function rowToPublic(row: ReportRow): PublicDogReport {
  const status = oneOf(row.status, LOST_FOUND_STATUSES, "DRAFT");
  return {
    id: row.id,
    type: oneOf(row.type, dogReportTypes, "LOST"),
    status: effectiveLostFoundStatus({ status, expiresAt: row.expires_at }),
    slug: row.slug,
    dogName: row.dog_name,
    sex: oneOf(row.sex, dogSexes, "UNKNOWN"),
    breedId: row.breed_id,
    breed: row.breed,
    breedUnknown: Boolean(row.breed_unknown),
    breedSlug: row.breed_slug,
    color: row.color,
    approximateAge: row.approximate_age,
    size: oneOf(row.size, dogSizes, "UNKNOWN"),
    description: row.description,
    distinguishingMarks: row.distinguishing_marks,
    collarDescription: row.collar_description,
    chipped: oneOf(row.chipped, chipStates, "UNKNOWN"),
    mainImage: row.main_image,
    gallery: safeGallery(row.gallery_json),
    eventDate: row.event_date,
    lastSeenDateTime: row.last_seen_date_time,
    region: row.region,
    district: row.district,
    city: row.city,
    locationDescription: row.location_description,
    publicLatitude: row.public_latitude,
    publicLongitude: row.public_longitude,
    publicLocationPrecision: oneOf(row.public_location_precision, publicLocationPrecisions, "MUNICIPALITY"),
    publicContactNote: row.public_contact_note,
    source: row.source,
    sourceUrl: row.source_url,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
  };
}

function rowToAdmin(row: ReportRow): AdminDogReport {
  return {
    ...rowToPublic(row),
    mainImageKey: row.main_image_key ?? null,
    contactName: row.private_contact_name ?? null,
    contactPhone: row.private_contact_phone ?? null,
    contactEmail: row.private_contact_email ?? null,
    duplicateOfId: row.duplicate_of_id ?? null,
    duplicateReason: row.duplicate_reason ?? "",
    internalNote: row.private_note ?? "",
    createdAt: row.created_at ?? row.updated_at,
    archivedAt: row.archived_at ?? null,
    createdBy: row.private_created_by ?? "",
    updatedBy: row.private_updated_by ?? "",
  };
}

const publicSelect = `
  r.id, r.type, r.status, r.slug, r.dog_name, r.sex, r.breed_id, r.breed, r.breed_unknown,
  CASE WHEN b.status = 'published' THEN b.slug ELSE NULL END AS breed_slug,
  r.color, r.approximate_age, r.size, r.description, r.distinguishing_marks, r.collar_description,
  r.chipped, r.main_image, r.gallery_json, r.event_date, r.last_seen_date_time,
  r.region, r.district, r.city, r.location_description, r.public_latitude, r.public_longitude,
  r.public_location_precision, r.public_contact_note, r.source, r.source_url,
  r.updated_at, r.published_at, r.expires_at, r.resolved_at`;

const adminSelect = `${publicSelect}, r.main_image_key, r.duplicate_of_id, r.duplicate_reason, r.created_at, r.archived_at,
  p.contact_name AS private_contact_name, p.contact_phone AS private_contact_phone, p.contact_email AS private_contact_email,
  p.private_note AS private_note, p.created_by AS private_created_by, p.updated_by AS private_updated_by`;

export const listPublishedBreedOptions = cache(async (): Promise<BreedOption[]> => {
  const database = getD1Binding();
  if (!database) return [];
  const result = await database.prepare("SELECT id, name, slug FROM managed_breeds WHERE status = 'published' ORDER BY name COLLATE NOCASE ASC").all<BreedOption>();
  return result.results ?? [];
});

export async function persistLostFoundLifecycle(database: D1Database, now = new Date()) {
  const nowIso = now.toISOString();
  await database.prepare(`UPDATE lost_found_dog_reports SET status = 'EXPIRED', updated_at = ? WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= ?`).bind(nowIso, nowIso).run();
  const threshold = expiredArchiveThreshold(now);
  await database.prepare(`UPDATE lost_found_dog_reports SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE status = 'EXPIRED' AND expires_at IS NOT NULL AND expires_at <= ?`).bind(nowIso, nowIso, threshold).run();
}

function clampPage(value: number | undefined) { return Math.max(1, Math.floor(value || 1)); }
function clampPageSize(value: number | undefined, fallback: number) { return Math.min(100, Math.max(1, Math.floor(value || fallback))); }

export async function listPublicDogReports(type: DogReportType, filters: DogReportFilters = {}) {
  const database = getD1Binding();
  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize, 24);
  if (!database) return { items: [] as PublicDogReport[], total: 0, page, pageSize, pages: 0 };

  const where = ["r.type = ?", "r.status = 'ACTIVE'", "r.published_at IS NOT NULL", "(r.expires_at IS NULL OR r.expires_at > ?)"];
  const args: unknown[] = [type, new Date().toISOString()];
  if (filters.region) { where.push("r.region = ?"); args.push(filters.region); }
  if (filters.locality) { where.push("(r.district LIKE ? OR r.city LIKE ? OR r.location_description LIKE ?)"); const q = `%${filters.locality.trim()}%`; args.push(q, q, q); }
  if (filters.date) { where.push("r.event_date = ?"); args.push(filters.date); }
  if (filters.sex && dogSexes.includes(filters.sex)) { where.push("r.sex = ?"); args.push(filters.sex); }
  if (filters.size && dogSizes.includes(filters.size)) { where.push("r.size = ?"); args.push(filters.size); }
  if (filters.breedId) { where.push("r.breed_id = ?"); args.push(filters.breedId); }
  if (filters.q?.trim()) { where.push("r.search_text LIKE ?"); args.push(`%${normalizeSearch(filters.q)}%`); }

  const whereSql = where.join(" AND ");
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM lost_found_dog_reports r WHERE ${whereSql}`).bind(...args).first<{ count: number }>();
  const total = Number(count?.count || 0);
  const offset = (page - 1) * pageSize;
  const result = await database.prepare(`SELECT ${publicSelect} FROM lost_found_dog_reports r LEFT JOIN managed_breeds b ON b.id = r.breed_id WHERE ${whereSql} ORDER BY r.event_date DESC, r.published_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...args, pageSize, offset).all<ReportRow>();
  return { items: (result.results ?? []).map(rowToPublic), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function getPublicDogReport(type: DogReportType, slug: string) {
  const database = getD1Binding();
  if (!database) return null;
  const row = await database.prepare(`SELECT ${publicSelect} FROM lost_found_dog_reports r LEFT JOIN managed_breeds b ON b.id = r.breed_id WHERE r.type = ? AND r.slug = ? AND r.published_at IS NOT NULL AND r.duplicate_of_id IS NULL AND r.status IN ('ACTIVE','RESOLVED','EXPIRED','ARCHIVED') LIMIT 1`).bind(type, slug).first<ReportRow>();
  return row ? rowToPublic(row) : null;
}

export async function listSitemapDogReports() {
  const database = getD1Binding();
  if (!database) return [] as PublicDogReport[];
  const nowIso = new Date().toISOString();
  const result = await database.prepare(`SELECT ${publicSelect} FROM lost_found_dog_reports r LEFT JOIN managed_breeds b ON b.id = r.breed_id WHERE r.status = 'ACTIVE' AND r.published_at IS NOT NULL AND (r.expires_at IS NULL OR r.expires_at > ?) ORDER BY r.updated_at DESC`).bind(nowIso).all<ReportRow>();
  return (result.results ?? []).map(rowToPublic);
}

export async function listAdminDogReports(filters: AdminDogReportFilters = {}) {
  const database = requireD1Binding();
  await persistLostFoundLifecycle(database);
  const page = clampPage(filters.page);
  const pageSize = clampPageSize(filters.pageSize, 50);
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.type && dogReportTypes.includes(filters.type)) { where.push("r.type = ?"); args.push(filters.type); }
  if (filters.status && LOST_FOUND_STATUSES.includes(filters.status)) { where.push("r.status = ?"); args.push(filters.status); }
  if (filters.region) { where.push("r.region = ?"); args.push(filters.region); }
  if (filters.locality) { where.push("(r.district LIKE ? OR r.city LIKE ? OR r.location_description LIKE ?)"); const q = `%${filters.locality.trim()}%`; args.push(q, q, q); }
  if (filters.q?.trim()) { where.push("r.search_text LIKE ?"); args.push(`%${normalizeSearch(filters.q)}%`); }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await database.prepare(`SELECT COUNT(*) AS count FROM lost_found_dog_reports r ${whereSql}`).bind(...args).first<{ count: number }>();
  const total = Number(count?.count || 0);
  const result = await database.prepare(`SELECT ${adminSelect} FROM lost_found_dog_reports r LEFT JOIN managed_breeds b ON b.id = r.breed_id LEFT JOIN lost_found_dog_private_details p ON p.report_id = r.id ${whereSql} ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END, r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...args, pageSize, (page - 1) * pageSize).all<ReportRow>();
  return { items: (result.results ?? []).map(rowToAdmin), total, page, pageSize, pages: Math.ceil(total / pageSize) };
}

export async function getAdminDogReport(id: number) {
  const database = requireD1Binding();
  await persistLostFoundLifecycle(database);
  const row = await database.prepare(`SELECT ${adminSelect} FROM lost_found_dog_reports r LEFT JOIN managed_breeds b ON b.id = r.breed_id LEFT JOIN lost_found_dog_private_details p ON p.report_id = r.id WHERE r.id = ? LIMIT 1`).bind(id).first<ReportRow>();
  return row ? rowToAdmin(row) : null;
}

export async function getAdminDogReportCounts() {
  const database = requireD1Binding();
  await persistLostFoundLifecycle(database);
  const result = await database.prepare("SELECT status, COUNT(*) AS count FROM lost_found_dog_reports GROUP BY status").all<{ status: string; count: number }>();
  const counts = Object.fromEntries(LOST_FOUND_STATUSES.map((status) => [status, 0])) as Record<LostFoundStatus, number>;
  let total = 0;
  for (const row of result.results ?? []) {
    if (LOST_FOUND_STATUSES.includes(row.status as LostFoundStatus)) counts[row.status as LostFoundStatus] = Number(row.count || 0);
    total += Number(row.count || 0);
  }
  return { total, ...counts };
}

export async function createAdminDogReport(input: ManagedDogReportInput, actor: string) {
  const database = requireD1Binding();
  const clean = await cleanInput(database, input, null);
  const now = new Date().toISOString();
  const lifecycle = lifecycleFields(clean.status, null, clean.expiresAt, now);

  // Create the case unpublished/DRAFT first. If private persistence fails, no public record can leak incomplete contact handling.
  const result = await database.prepare(`INSERT INTO lost_found_dog_reports (
    type,status,slug,dog_name,sex,breed_id,breed,breed_unknown,color,approximate_age,size,description,distinguishing_marks,collar_description,chipped,
    main_image,main_image_key,gallery_json,event_date,last_seen_date_time,region,district,city,location_description,public_latitude,public_longitude,public_location_precision,
    public_contact_note,source,source_url,search_text,duplicate_of_id,duplicate_reason,created_at,updated_at,published_at,expires_at,resolved_at,archived_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    clean.type, "DRAFT", clean.slug, clean.dogName, clean.sex, clean.breedId, clean.breed, clean.breedUnknown ? 1 : 0, clean.color, clean.approximateAge, clean.size, clean.description, clean.distinguishingMarks, clean.collarDescription, clean.chipped,
    clean.mainImage, clean.mainImageKey, JSON.stringify(clean.gallery), clean.eventDate, clean.lastSeenDateTime, clean.region, clean.district, clean.city, clean.locationDescription, clean.publicLatitude, clean.publicLongitude, clean.publicLocationPrecision,
    clean.publicContactNote, clean.source, clean.sourceUrl, clean.searchText, clean.duplicateOfId, clean.duplicateReason, now, now, null, null, null, null
  ).run();
  const reportId = Number(result.meta.last_row_id);

  const privateInsert = database.prepare(`INSERT INTO lost_found_dog_private_details (
    report_id,contact_name,contact_phone,contact_email,private_note,created_by,updated_by,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
    reportId, clean.contactName, clean.contactPhone, clean.contactEmail, clean.internalNote, actor, actor, now, now
  );
  const publishCase = database.prepare(`UPDATE lost_found_dog_reports SET status=?,updated_at=?,published_at=?,expires_at=?,resolved_at=?,archived_at=? WHERE id=?`).bind(
    clean.status, now, lifecycle.publishedAt, lifecycle.expiresAt, lifecycle.resolvedAt, lifecycle.archivedAt, reportId
  );
  await database.batch([privateInsert, publishCase]);
  return getAdminDogReport(reportId);
}

export async function updateAdminDogReport(id: number, input: ManagedDogReportInput, actor: string) {
  const database = requireD1Binding();
  const existing = await getAdminDogReport(id);
  if (!existing) throw new Error("Hlásenie neexistuje.");
  const clean = await cleanInput(database, input, id);
  const now = new Date().toISOString();
  const lifecycle = lifecycleFields(clean.status, existing, clean.expiresAt, now);

  const publicUpdate = database.prepare(`UPDATE lost_found_dog_reports SET
    type=?,status=?,slug=?,dog_name=?,sex=?,breed_id=?,breed=?,breed_unknown=?,color=?,approximate_age=?,size=?,description=?,distinguishing_marks=?,collar_description=?,chipped=?,
    main_image=?,main_image_key=?,gallery_json=?,event_date=?,last_seen_date_time=?,region=?,district=?,city=?,location_description=?,public_latitude=?,public_longitude=?,public_location_precision=?,
    public_contact_note=?,source=?,source_url=?,search_text=?,duplicate_of_id=?,duplicate_reason=?,updated_at=?,published_at=?,expires_at=?,resolved_at=?,archived_at=? WHERE id=?`).bind(
    clean.type, clean.status, clean.slug, clean.dogName, clean.sex, clean.breedId, clean.breed, clean.breedUnknown ? 1 : 0, clean.color, clean.approximateAge, clean.size, clean.description, clean.distinguishingMarks, clean.collarDescription, clean.chipped,
    clean.mainImage, clean.mainImageKey, JSON.stringify(clean.gallery), clean.eventDate, clean.lastSeenDateTime, clean.region, clean.district, clean.city, clean.locationDescription, clean.publicLatitude, clean.publicLongitude, clean.publicLocationPrecision,
    clean.publicContactNote, clean.source, clean.sourceUrl, clean.searchText, clean.duplicateOfId, clean.duplicateReason,
    now, lifecycle.publishedAt, lifecycle.expiresAt, lifecycle.resolvedAt, lifecycle.archivedAt, id
  );
  const privateUpsert = database.prepare(`INSERT INTO lost_found_dog_private_details (
    report_id,contact_name,contact_phone,contact_email,private_note,created_by,updated_by,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?)
  ON CONFLICT(report_id) DO UPDATE SET
    contact_name=excluded.contact_name,
    contact_phone=excluded.contact_phone,
    contact_email=excluded.contact_email,
    private_note=excluded.private_note,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at`).bind(
    id, clean.contactName, clean.contactPhone, clean.contactEmail, clean.internalNote, actor, actor, now, now
  );
  await database.batch([publicUpdate, privateUpsert]);
  return getAdminDogReport(id);
}

function lifecycleFields(status: LostFoundStatus, existing: AdminDogReport | null, requestedExpiry: string | null, now: string) {
  const publicStatus = ["ACTIVE", "RESOLVED", "EXPIRED", "ARCHIVED"].includes(status);
  const publishedAt = publicStatus ? (existing?.publishedAt || now) : existing?.publishedAt || null;
  const expiresAt = status === "ACTIVE" ? (requestedExpiry || existing?.expiresAt || defaultLostFoundExpiresAt(new Date(now))) : (requestedExpiry || existing?.expiresAt || null);
  const resolvedAt = status === "RESOLVED" ? (existing?.resolvedAt || now) : null;
  const archivedAt = status === "ARCHIVED" ? (existing?.archivedAt || now) : null;
  return { publishedAt, expiresAt, resolvedAt, archivedAt };
}

async function cleanInput(database: D1Database, input: ManagedDogReportInput, currentId: number | null) {
  const type = oneOf(input.type, dogReportTypes, "LOST") as DogReportType;
  let status = oneOf(input.status, LOST_FOUND_STATUSES, "DRAFT") as LostFoundStatus;
  const dogName = cleanNullable(input.dogName, 120);
  const eventDate = cleanText(input.eventDate, 10);
  const region = cleanText(input.region, 80);
  const district = cleanText(input.district, 120);
  const city = cleanText(input.city, 120);
  const description = cleanText(input.description, 6000);
  const lastSeenDateTime = cleanIsoNullable(input.lastSeenDateTime);
  let slug = slugify(cleanText(input.slug, 100) || `${type === "LOST" ? "strateny" : "najdeny"}-${dogName || city || "pes"}-${eventDate || "hlasenie"}`);
  if (!slug) slug = `${type.toLowerCase()}-${Date.now()}`;

  if (status !== "DRAFT") {
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("Zadaj dátum udalosti.");
    if (!region || !city) throw new Error("Zadaj kraj a obec/mesto.");
    if (description.length < 20) throw new Error("Popis hlásenia musí mať aspoň 20 znakov.");
  }
  if (status === "ACTIVE" && type === "LOST" && !lastSeenDateTime) throw new Error("Pri aktívnom stratenom psovi zadaj čas, kedy bol naposledy videný.");

  const breedUnknown = Boolean(input.breedUnknown);
  const breedId = breedUnknown ? null : positiveInt(input.breedId);
  let breed = breedUnknown ? "" : cleanText(input.breed, 160);
  if (breedId) {
    const linked = await database.prepare("SELECT id, name FROM managed_breeds WHERE id = ? AND status = 'published' LIMIT 1").bind(breedId).first<{ id: number; name: string }>();
    if (!linked) throw new Error("Vybrané plemeno nie je publikované v atlase.");
    breed = linked.name;
  }

  const duplicateOfId = positiveInt(input.duplicateOfId);
  const duplicateReason = cleanText(input.duplicateReason, 500);
  if (duplicateOfId) {
    if (currentId && duplicateOfId === currentId) throw new Error("Hlásenie nemôže byť duplicitou samého seba.");
    const target = await database.prepare("SELECT id, type FROM lost_found_dog_reports WHERE id = ? LIMIT 1").bind(duplicateOfId).first<{ id: number; type: string }>();
    if (!target) throw new Error("Kanonické hlásenie pre duplicitu neexistuje.");
    if (target.type !== type) throw new Error("Duplicitné hlásenia musia mať rovnaký typ LOST/FOUND.");
    status = "ARCHIVED";
  }

  const publicLatitude = optionalNumber(input.publicLatitude);
  const publicLongitude = optionalNumber(input.publicLongitude);
  if ((publicLatitude === null) !== (publicLongitude === null)) throw new Error("Pre mapu zadaj obe približné súradnice alebo ani jednu.");
  if (publicLatitude !== null && (publicLatitude < -90 || publicLatitude > 90)) throw new Error("Neplatná zemepisná šírka.");
  if (publicLongitude !== null && (publicLongitude < -180 || publicLongitude > 180)) throw new Error("Neplatná zemepisná dĺžka.");

  const sourceUrl = cleanUrlNullable(input.sourceUrl);
  const mainImage = cleanImageNullable(input.mainImage);
  const gallery = (Array.isArray(input.gallery) ? input.gallery : []).map(cleanImageNullable).filter((item): item is string => Boolean(item)).slice(0, 8);
  const expiresAt = cleanIsoNullable(input.expiresAt);
  const contactEmail = cleanNullable(input.contactEmail, 254);
  if (contactEmail && !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("Kontaktný e-mail nemá platný formát.");

  const cleaned = {
    type, status, slug, dogName,
    sex: oneOf(input.sex, dogSexes, "UNKNOWN") as DogSex,
    breedId, breed, breedUnknown,
    color: cleanText(input.color, 160), approximateAge: cleanText(input.approximateAge, 120),
    size: oneOf(input.size, dogSizes, "UNKNOWN") as DogSize,
    description, distinguishingMarks: cleanText(input.distinguishingMarks, 1200), collarDescription: cleanText(input.collarDescription, 700),
    chipped: oneOf(input.chipped, chipStates, "UNKNOWN") as ChipState,
    mainImage, mainImageKey: cleanNullable(input.mainImageKey, 500), gallery,
    eventDate, lastSeenDateTime, region, district, city, locationDescription: cleanText(input.locationDescription, 1000),
    publicLatitude, publicLongitude, publicLocationPrecision: oneOf(input.publicLocationPrecision, publicLocationPrecisions, "MUNICIPALITY") as PublicLocationPrecision,
    contactName: cleanNullable(input.contactName, 160), contactPhone: cleanNullable(input.contactPhone, 80), contactEmail,
    publicContactNote: cleanText(input.publicContactNote, 800), source: cleanText(input.source, 160) || "EDITORIAL", sourceUrl,
    expiresAt, duplicateOfId, duplicateReason, internalNote: cleanText(input.internalNote, 4000),
  };
  return { ...cleaned, searchText: normalizeSearch([type, dogName, breed, cleaned.color, cleaned.description, cleaned.distinguishingMarks, region, district, city, cleaned.locationDescription, cleaned.source].filter(Boolean).join(" ")) };
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function slugify(value: string) { return normalizeSearch(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100); }
function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanNullable(value: unknown, max: number) { const text = cleanText(value, max); return text || null; }
function positiveInt(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function optionalNumber(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function cleanIsoNullable(value: unknown) { const text = cleanText(value, 50); if (!text) return null; const date = new Date(text); if (Number.isNaN(date.getTime())) throw new Error("Neplatný dátum alebo čas."); return date.toISOString(); }
function cleanUrlNullable(value: unknown) { const text = cleanText(value, 1000); if (!text) return null; try { const url = new URL(text); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); return url.toString(); } catch { throw new Error("Odkaz zdroja musí byť platná HTTP/HTTPS adresa."); } }
function cleanImageNullable(value: unknown) { const text = cleanText(value, 1000); if (!text) return null; if (text.startsWith("/media/") || text.startsWith("/images/")) return text; try { const url = new URL(text); if (["http:", "https:"].includes(url.protocol)) return url.toString(); } catch {} throw new Error("Obrázok musí byť interná /media/ adresa alebo platná HTTP/HTTPS URL."); }
