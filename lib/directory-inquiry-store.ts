import { env } from "cloudflare:workers";
import {
  isDirectoryCategory,
  type DirectoryInquiry,
  type DirectoryInquiryStatus,
} from "@/lib/directory";

export type DirectoryInquiryInput = {
  profileId?: number;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  dogInfo?: string;
  message?: string;
  consent?: boolean;
  submissionKey?: string;
};

export class DirectoryRateLimitError extends Error {}

type RuntimeBindings = { DB?: D1Database };

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
  submission_key: string | null;
  created_at: string;
  updated_at: string;
};

type DirectoryInquiryProfileRow = {
  id: number;
  name: string;
  slug: string;
  category: string;
  internal_email: string | null;
};

const DIRECTORY_INQUIRY_COLUMNS = `
  id, profile_id, profile_name, profile_slug, profile_category, recipient_email,
  sender_name, sender_email, sender_phone, dog_info, message, status, consent,
  submission_key, created_at, updated_at
`;

function getD1Binding(database?: D1Database) {
  if (database && typeof database.prepare === "function") return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function requireD1Binding(database?: D1Database) {
  const bound = getD1Binding(database);
  if (!bound) throw new Error("Databáza adresára zatiaľ nie je pripojená.");
  return bound;
}

function normalizeEmail(value: string | null | undefined) {
  const clean = value?.trim().toLowerCase() || null;
  if (!clean || clean.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error("E-mailová adresa nie je platná.");
  }
  return clean;
}

function normalizeSubmissionKey(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)) {
    throw new Error("Neplatný identifikátor odoslania.");
  }
  return clean.toLowerCase();
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

async function purgeExpiredDirectoryInquiries(database: D1Database) {
  const resolvedBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1_000).toISOString();
  const absoluteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await database.prepare("DELETE FROM directory_inquiries WHERE (status = 'resolved' AND updated_at < ?) OR created_at < ?")
    .bind(resolvedBefore, absoluteBefore).run();
}

async function findInquiryBySubmissionKey(database: D1Database, submissionKey: string) {
  const row = await database.prepare(`
    SELECT ${DIRECTORY_INQUIRY_COLUMNS}
    FROM directory_inquiries
    WHERE submission_key = ?
    LIMIT 1
  `).bind(submissionKey).first<DirectoryInquiryRow>();
  return row ? rowToInquiry(row) : null;
}

function isUniqueSubmissionKeyConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("directory_inquiries.submission_key") || message.includes("directory_inquiries_submission_key_unique");
}

export async function createDirectoryInquiry(payload: DirectoryInquiryInput, database?: D1Database) {
  const db = requireD1Binding(database);
  await purgeExpiredDirectoryInquiries(db);

  const submissionKey = normalizeSubmissionKey(payload.submissionKey);
  const existing = await findInquiryBySubmissionKey(db, submissionKey);
  if (existing) return { inquiry: existing, created: false as const };

  const profileId = Number(payload.profileId);
  if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error("Profil sa nenašiel.");
  const profile = await db.prepare(`
    SELECT id, name, slug, category, internal_email
    FROM directory_profiles
    WHERE id = ? AND status = 'published'
    LIMIT 1
  `).bind(profileId).first<DirectoryInquiryProfileRow>();
  if (!profile) throw new Error("Profil sa nenašiel alebo už nie je verejný.");

  const senderName = payload.senderName?.trim() ?? "";
  const senderEmail = normalizeEmail(payload.senderEmail);
  const senderPhone = payload.senderPhone?.trim() ?? "";
  const dogInfo = payload.dogInfo?.trim() ?? "";
  const message = payload.message?.trim() ?? "";
  if (senderName.length < 2 || senderName.length > 100) throw new Error("Doplň svoje meno.");
  if (senderPhone.length > 40) throw new Error("Telefónne číslo je príliš dlhé.");
  if (dogInfo.length > 300) throw new Error("Informácie o psovi sú príliš dlhé.");
  if (message.length < 20 || message.length > 3000) throw new Error("Správa musí mať 20 až 3 000 znakov.");
  if (!payload.consent) throw new Error("Pred odoslaním potvrď oboznámenie sa so spracúvaním údajov.");

  const limitSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM directory_inquiries WHERE sender_email = ? AND created_at >= ?")
    .bind(senderEmail, limitSince).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 3) {
    throw new DirectoryRateLimitError("Za krátky čas bolo odoslaných príliš veľa správ. Skús to neskôr.");
  }

  const now = new Date().toISOString();
  try {
    const row = await db.prepare(`
      INSERT INTO directory_inquiries (
        profile_id, profile_name, profile_slug, profile_category, recipient_email,
        sender_name, sender_email, sender_phone, dog_info, message, status, consent,
        submission_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 1, ?, ?, ?)
      RETURNING ${DIRECTORY_INQUIRY_COLUMNS}
    `).bind(
      profile.id, profile.name, profile.slug, profile.category, profile.internal_email,
      senderName, senderEmail, senderPhone, dogInfo, message, submissionKey, now, now,
    ).first<DirectoryInquiryRow>();
    if (!row) throw new Error("Dopyt sa nepodarilo uložiť.");
    return { inquiry: rowToInquiry(row), created: true as const };
  } catch (error) {
    if (!isUniqueSubmissionKeyConflict(error)) throw error;
    const concurrent = await findInquiryBySubmissionKey(db, submissionKey);
    if (!concurrent) throw error;
    return { inquiry: concurrent, created: false as const };
  }
}

export async function getNewDirectoryInquiryCount(database?: D1Database) {
  const db = getD1Binding(database);
  if (!db) return 0;
  const row = await db.prepare("SELECT COUNT(*) AS count FROM directory_inquiries WHERE status = 'new'")
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function listRecentNewDirectoryInquiriesNeedingNotification(cutoffIso: string, database?: D1Database) {
  const db = requireD1Binding(database);
  const result = await db.prepare(`
    SELECT
      i.id, i.profile_id, i.profile_name, i.profile_slug, i.profile_category, i.recipient_email,
      i.sender_name, i.sender_email, i.sender_phone, i.dog_info, i.message, i.status, i.consent,
      i.submission_key, i.created_at, i.updated_at
    FROM directory_inquiries i
    LEFT JOIN directory_inquiry_notifications n
      ON n.inquiry_id = i.id
      AND n.notification_type = 'new'
      AND n.status = 'sent'
    WHERE i.status = 'new'
      AND i.submission_key IS NOT NULL
      AND i.created_at > ?
      AND n.id IS NULL
    ORDER BY i.created_at ASC, i.id ASC
    LIMIT 200
  `).bind(cutoffIso).all<DirectoryInquiryRow>();
  return result.results.map(rowToInquiry);
}

export async function listStaleNewDirectoryInquiries(cutoffIso: string, database?: D1Database) {
  const db = requireD1Binding(database);
  const result = await db.prepare(`
    SELECT
      i.id, i.profile_id, i.profile_name, i.profile_slug, i.profile_category, i.recipient_email,
      i.sender_name, i.sender_email, i.sender_phone, i.dog_info, i.message, i.status, i.consent,
      i.submission_key, i.created_at, i.updated_at
    FROM directory_inquiries i
    LEFT JOIN directory_inquiry_notifications n
      ON n.inquiry_id = i.id
      AND n.notification_type = 'stale-24h'
      AND n.status = 'sent'
    WHERE i.status = 'new'
      AND i.created_at <= ?
      AND n.id IS NULL
    ORDER BY i.created_at ASC, i.id ASC
    LIMIT 200
  `).bind(cutoffIso).all<DirectoryInquiryRow>();
  return result.results.map(rowToInquiry);
}

export async function getDirectoryInquiryStatus(id: number, database?: D1Database): Promise<DirectoryInquiryStatus | null> {
  const db = requireD1Binding(database);
  const row = await db.prepare("SELECT status FROM directory_inquiries WHERE id = ? LIMIT 1")
    .bind(id).first<{ status: string }>();
  if (!row) return null;
  return row.status === "resolved" ? "resolved" : row.status === "read" ? "read" : "new";
}
