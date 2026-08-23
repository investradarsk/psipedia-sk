import { env } from "cloudflare:workers";
import { slugifyArticleTitle } from "@/lib/article-store";
import {
  directoryCategories,
  isDirectoryCategory,
  type DirectoryCategorySlug,
  type DirectoryInquiry,
  type DirectoryInquiryStatus,
  type DirectoryProfileStatus,
  type ManagedDirectoryProfile,
  type PublicDirectoryProfile,
} from "@/lib/directory";
import { slovakRegions, type SlovakRegion } from "@/lib/events";

export type ManagedDirectoryProfileInput = {
  slug?: string;
  name?: string;
  category?: string;
  status?: string;
  excerpt?: string;
  description?: string;
  services?: string[];
  qualifications?: string[];
  city?: string;
  region?: string;
  address?: string;
  online?: boolean;
  priceNote?: string;
  websiteUrl?: string | null;
  internalEmail?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
  verified?: boolean;
  featured?: boolean;
};

export type DirectoryInquiryInput = {
  profileId?: number;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  dogInfo?: string;
  message?: string;
  consent?: boolean;
};

type DirectoryProfileRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  status: string;
  excerpt: string;
  description: string;
  services_json: string;
  qualifications_json: string;
  city: string;
  region: string;
  address: string;
  online: number;
  price_note: string;
  website_url: string | null;
  internal_email: string | null;
  image_url: string | null;
  image_key: string | null;
  verified: number;
  featured: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  created_by: string;
  updated_by: string;
};

type DirectoryInquiryRow = {
  id: number;
  profile_id: number | null;
  profile_name: string;
  profile_slug: string;
  profile_category: string;
  recipient_email: string | null;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  dog_info: string;
  message: string;
  status: string;
  consent: number;
  created_at: string;
  updated_at: string;
};

type RuntimeBindings = { DB?: D1Database };
let directorySchemaReady: Promise<void> | null = null;

function getD1Binding() {
  const database = (env as unknown as RuntimeBindings).DB;
  return database && typeof database.prepare === "function" ? database : null;
}

function requireD1Binding() {
  const database = getD1Binding();
  if (!database) throw new Error("Databáza adresára zatiaľ nie je pripojená.");
  return database;
}

async function ensureDirectoryStore(database: D1Database) {
  if (directorySchemaReady) return directorySchemaReady;
  directorySchemaReady = (async () => {
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS directory_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        excerpt TEXT NOT NULL,
        description TEXT NOT NULL,
        services_json TEXT NOT NULL DEFAULT '[]',
        qualifications_json TEXT NOT NULL DEFAULT '[]',
        city TEXT NOT NULL,
        region TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        online INTEGER NOT NULL DEFAULT 0,
        price_note TEXT NOT NULL DEFAULT '',
        website_url TEXT,
        internal_email TEXT,
        image_url TEXT,
        image_key TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL
      )
    `).run();
    await database.prepare(`
      CREATE TABLE IF NOT EXISTS directory_inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        profile_name TEXT NOT NULL,
        profile_slug TEXT NOT NULL,
        profile_category TEXT NOT NULL,
        recipient_email TEXT,
        sender_name TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        sender_phone TEXT NOT NULL DEFAULT '',
        dog_info TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        consent INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();
    const inquiryColumns = await database.prepare("PRAGMA table_info(directory_inquiries)").all<{ name: string }>();
    if (!inquiryColumns.results.some((column) => column.name === "recipient_email")) {
      await database.prepare("ALTER TABLE directory_inquiries ADD COLUMN recipient_email TEXT").run();
    }
    await database.batch([
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS directory_profiles_category_slug_unique ON directory_profiles (category, slug)"),
      database.prepare("CREATE INDEX IF NOT EXISTS directory_profiles_public_idx ON directory_profiles (status, category, region, featured)"),
      database.prepare("CREATE INDEX IF NOT EXISTS directory_profiles_updated_idx ON directory_profiles (updated_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS directory_inquiries_status_created_idx ON directory_inquiries (status, created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS directory_inquiries_profile_idx ON directory_inquiries (profile_id, created_at)"),
      database.prepare("CREATE INDEX IF NOT EXISTS directory_inquiries_email_idx ON directory_inquiries (sender_email, created_at)"),
    ]);
  })().catch((error) => {
    directorySchemaReady = null;
    throw error;
  });
  return directorySchemaReady;
}

function safeList(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function rowToPublicProfile(row: DirectoryProfileRow): PublicDirectoryProfile {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: isDirectoryCategory(row.category) ? row.category : "salony-a-sluzby",
    excerpt: row.excerpt,
    description: row.description,
    services: safeList(row.services_json),
    qualifications: safeList(row.qualifications_json),
    city: row.city,
    region: (slovakRegions as readonly string[]).includes(row.region) ? row.region as SlovakRegion : "Online",
    address: row.address,
    online: Boolean(row.online),
    priceNote: row.price_note,
    websiteUrl: row.website_url,
    imageUrl: row.image_url,
    verified: Boolean(row.verified),
    featured: Boolean(row.featured),
    updatedAt: row.updated_at,
  };
}

function rowToManagedProfile(row: DirectoryProfileRow): ManagedDirectoryProfile {
  return {
    ...rowToPublicProfile(row),
    status: row.status === "published" ? "published" : "draft",
    internalEmail: row.internal_email,
    imageKey: row.image_key,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function rowToInquiry(row: DirectoryInquiryRow): DirectoryInquiry {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name,
    profileSlug: row.profile_slug,
    profileCategory: isDirectoryCategory(row.profile_category) ? row.profile_category : "salony-a-sluzby",
    recipientEmail: row.recipient_email,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    senderPhone: row.sender_phone,
    dogInfo: row.dog_info,
    message: row.message,
    status: row.status === "resolved" ? "resolved" : row.status === "read" ? "read" : "new",
    consent: Boolean(row.consent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeUrl(value: string | null | undefined) {
  const clean = value?.trim() || null;
  if (!clean) return null;
  let parsed: URL;
  try { parsed = new URL(clean); } catch { throw new Error("Webová adresa nie je platná."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Webová adresa musí začínať http:// alebo https://.");
  return clean;
}

function normalizeEmail(value: string | null | undefined, required = false) {
  const clean = value?.trim().toLowerCase() || null;
  if (!clean && !required) return null;
  if (!clean || clean.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("E-mailová adresa nie je platná.");
  return clean;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

function normalizeProfileInput(payload: ManagedDirectoryProfileInput) {
  const name = payload.name?.trim() ?? "";
  const slug = slugifyArticleTitle(payload.slug?.trim() || name);
  const category = payload.category && isDirectoryCategory(payload.category) ? payload.category : null;
  const status: DirectoryProfileStatus = payload.status === "published" ? "published" : "draft";
  const excerpt = payload.excerpt?.trim() ?? "";
  const description = payload.description?.trim() ?? "";
  const city = payload.city?.trim() ?? "";
  const region = (slovakRegions as readonly string[]).includes(payload.region ?? "") ? payload.region as SlovakRegion : null;
  const imageUrl = payload.imageUrl?.trim() || null;

  if (!name) throw new Error("Doplň názov profilu.");
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Adresa profilu nie je platná.");
  if (!category) throw new Error("Vyber kategóriu adresára.");
  if (directoryCategories.some((item) => item.slug === slug)) throw new Error("Túto adresu používa kategória. Uprav adresu profilu.");
  if (excerpt.length < 20) throw new Error("Krátky popis by mal mať aspoň 20 znakov.");
  if (description.length < 40) throw new Error("Podrobný popis by mal mať aspoň 40 znakov.");
  if (!city) throw new Error("Doplň mesto alebo uveď Online.");
  if (!region) throw new Error("Vyber kraj.");
  if (imageUrl && !imageUrl.startsWith("/media/") && !imageUrl.startsWith("/images/") && !/^https:\/\//i.test(imageUrl)) throw new Error("Adresa obrázka nie je platná.");

  return {
    slug,
    name,
    category,
    status,
    excerpt,
    description,
    services: normalizeStringList(payload.services),
    qualifications: normalizeStringList(payload.qualifications),
    city,
    region,
    address: payload.address?.trim() ?? "",
    online: Boolean(payload.online),
    priceNote: payload.priceNote?.trim() ?? "",
    websiteUrl: normalizeUrl(payload.websiteUrl),
    internalEmail: normalizeEmail(payload.internalEmail),
    imageUrl,
    imageKey: payload.imageKey?.trim() || null,
    verified: Boolean(payload.verified),
    featured: Boolean(payload.featured),
  };
}

export async function getPublishedDirectoryProfiles(category?: DirectoryCategorySlug) {
  const database = getD1Binding();
  if (!database) return [] as PublicDirectoryProfile[];
  await ensureDirectoryStore(database);
  const result = category
    ? await database.prepare("SELECT * FROM directory_profiles WHERE status = 'published' AND category = ? ORDER BY featured DESC, verified DESC, name ASC").bind(category).all<DirectoryProfileRow>()
    : await database.prepare("SELECT * FROM directory_profiles WHERE status = 'published' ORDER BY featured DESC, verified DESC, name ASC").all<DirectoryProfileRow>();
  return result.results.map(rowToPublicProfile);
}

export async function getPublishedDirectoryProfile(category: string, slug: string) {
  const database = getD1Binding();
  if (!database || !isDirectoryCategory(category)) return null;
  await ensureDirectoryStore(database);
  const row = await database.prepare("SELECT * FROM directory_profiles WHERE status = 'published' AND category = ? AND slug = ? LIMIT 1").bind(category, slug).first<DirectoryProfileRow>();
  return row ? rowToPublicProfile(row) : null;
}

export async function listManagedDirectoryProfiles() {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const result = await database.prepare("SELECT * FROM directory_profiles ORDER BY updated_at DESC, id DESC").all<DirectoryProfileRow>();
  return result.results.map(rowToManagedProfile);
}

export async function getManagedDirectoryProfileById(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare("SELECT * FROM directory_profiles WHERE id = ? LIMIT 1").bind(id).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export async function createManagedDirectoryProfile(payload: ManagedDirectoryProfileInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const input = normalizeProfileInput(payload);
  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO directory_profiles (
      slug, name, category, status, excerpt, description, services_json, qualifications_json,
      city, region, address, online, price_note, website_url, internal_email, image_url, image_key,
      verified, featured, created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).bind(
    input.slug, input.name, input.category, input.status, input.excerpt, input.description,
    JSON.stringify(input.services), JSON.stringify(input.qualifications), input.city, input.region,
    input.address, input.online ? 1 : 0, input.priceNote, input.websiteUrl, input.internalEmail,
    input.imageUrl, input.imageKey, input.verified ? 1 : 0, input.featured ? 1 : 0,
    now, now, input.status === "published" ? now : null, editorEmail, editorEmail,
  ).first<DirectoryProfileRow>();
  if (!row) throw new Error("Profil sa nepodarilo vytvoriť.");
  return rowToManagedProfile(row);
}

export async function updateManagedDirectoryProfile(id: number, payload: ManagedDirectoryProfileInput, editorEmail: string) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const existing = await database.prepare("SELECT * FROM directory_profiles WHERE id = ? LIMIT 1").bind(id).first<DirectoryProfileRow>();
  if (!existing) return null;
  const input = normalizeProfileInput(payload);
  const now = new Date().toISOString();
  const publishedAt = input.status === "published" ? existing.published_at ?? now : existing.published_at;
  const row = await database.prepare(`
    UPDATE directory_profiles SET
      slug = ?, name = ?, category = ?, status = ?, excerpt = ?, description = ?, services_json = ?,
      qualifications_json = ?, city = ?, region = ?, address = ?, online = ?, price_note = ?, website_url = ?,
      internal_email = ?, image_url = ?, image_key = ?, verified = ?, featured = ?, updated_at = ?, published_at = ?, updated_by = ?
    WHERE id = ? RETURNING *
  `).bind(
    input.slug, input.name, input.category, input.status, input.excerpt, input.description,
    JSON.stringify(input.services), JSON.stringify(input.qualifications), input.city, input.region,
    input.address, input.online ? 1 : 0, input.priceNote, input.websiteUrl, input.internalEmail,
    input.imageUrl, input.imageKey, input.verified ? 1 : 0, input.featured ? 1 : 0,
    now, publishedAt, editorEmail, id,
  ).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export async function deleteManagedDirectoryProfile(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare("DELETE FROM directory_profiles WHERE id = ? RETURNING *").bind(id).first<DirectoryProfileRow>();
  return row ? rowToManagedProfile(row) : null;
}

export function isDirectoryProfileConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("directory_profiles.category, directory_profiles.slug");
}

export class DirectoryRateLimitError extends Error {}

async function purgeExpiredDirectoryInquiries(database: D1Database) {
  const resolvedBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  const absoluteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await database.prepare("DELETE FROM directory_inquiries WHERE (status = 'resolved' AND updated_at < ?) OR created_at < ?")
    .bind(resolvedBefore, absoluteBefore).run();
}

export async function createDirectoryInquiry(payload: DirectoryInquiryInput) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  await purgeExpiredDirectoryInquiries(database);
  const profileId = Number(payload.profileId);
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error("Profil sa nenašiel.");
  const profile = await database.prepare("SELECT * FROM directory_profiles WHERE id = ? AND status = 'published' LIMIT 1").bind(profileId).first<DirectoryProfileRow>();
  if (!profile) throw new Error("Profil sa nenašiel alebo už nie je verejný.");

  const senderName = payload.senderName?.trim() ?? "";
  const senderEmail = normalizeEmail(payload.senderEmail, true) as string;
  const senderPhone = payload.senderPhone?.trim() ?? "";
  const dogInfo = payload.dogInfo?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  if (senderName.length < 2 || senderName.length > 100) throw new Error("Doplň svoje meno.");
  if (senderPhone.length > 40) throw new Error("Telefónne číslo je príliš dlhé.");
  if (dogInfo.length > 300) throw new Error("Informácie o psovi sú príliš dlhé.");
  if (message.length < 20 || message.length > 3000) throw new Error("Správa musí mať 20 až 3 000 znakov.");
  if (!payload.consent) throw new Error("Pred odoslaním potvrď oboznámenie sa so spracúvaním údajov.");

  const limitSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await database.prepare("SELECT COUNT(*) AS count FROM directory_inquiries WHERE sender_email = ? AND created_at >= ?").bind(senderEmail, limitSince).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3) throw new DirectoryRateLimitError("Za krátky čas bolo odoslaných príliš veľa správ. Skús to neskôr.");

  const now = new Date().toISOString();
  const row = await database.prepare(`
    INSERT INTO directory_inquiries (
      profile_id, profile_name, profile_slug, profile_category, recipient_email, sender_name, sender_email,
      sender_phone, dog_info, message, status, consent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?, ?) RETURNING *
  `).bind(
    profile.id, profile.name, profile.slug, profile.category, profile.internal_email, senderName, senderEmail,
    senderPhone, dogInfo, message, now, now,
  ).first<DirectoryInquiryRow>();
  if (!row) throw new Error("Dopyt sa nepodarilo uložiť.");
  return rowToInquiry(row);
}

export async function listDirectoryInquiries() {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  await purgeExpiredDirectoryInquiries(database);
  const result = await database.prepare("SELECT * FROM directory_inquiries ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC").all<DirectoryInquiryRow>();
  return result.results.map(rowToInquiry);
}

export async function updateDirectoryInquiryStatus(id: number, status: DirectoryInquiryStatus) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const now = new Date().toISOString();
  const row = await database.prepare("UPDATE directory_inquiries SET status = ?, updated_at = ? WHERE id = ? RETURNING *").bind(status, now, id).first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}

export async function deleteDirectoryInquiry(id: number) {
  const database = requireD1Binding();
  await ensureDirectoryStore(database);
  const row = await database.prepare("DELETE FROM directory_inquiries WHERE id = ? RETURNING *").bind(id).first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}
