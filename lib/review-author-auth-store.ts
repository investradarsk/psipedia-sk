import { env } from "cloudflare:workers";
import {
  createResourceManagementSession,
  issueResourceAccessToken,
  resolveResourceManagementSession,
  revokeResourceManagementSession,
} from "@/lib/resource-access-store";

export const REVIEW_AUTHOR_RESOURCE_TYPE = "REVIEW_AUTHOR";
export const REVIEW_AUTHOR_AUTH_PURPOSE = "REVIEW_AUTHOR_AUTH";
export const REVIEW_AUTHOR_SESSION_COOKIE = "__Host-psipedia_review_author_session";
export const REVIEW_AUTHOR_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const REVIEW_AUTHOR_MAGIC_LINK_TTL_SECONDS = 15 * 60;

export type ReviewAuthorStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

export type ReviewAuthorRecord = {
  id: string;
  emailCiphertext: string;
  emailHash: string;
  displayName: string | null;
  status: ReviewAuthorStatus;
  emailVerifiedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReviewAuthorRow = {
  id: string;
  email_ciphertext: string;
  email_hash: string;
  display_name: string | null;
  status: string;
  email_verified_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

type RuntimeBindings = { DB?: D1Database };

export function getReviewAuthorDatabase(database?: D1Database) {
  const db = database ?? (env as unknown as RuntimeBindings).DB;
  if (!db?.prepare) throw new Error("Databáza autorov recenzií nie je pripojená.");
  return db;
}

function isReviewAuthorStatus(value: string): value is ReviewAuthorStatus {
  return value === "PENDING_VERIFICATION"
    || value === "ACTIVE"
    || value === "SUSPENDED"
    || value === "DEACTIVATED";
}

function rowToReviewAuthor(row: ReviewAuthorRow): ReviewAuthorRecord {
  if (!isReviewAuthorStatus(row.status)) throw new Error("Neplatný stav autora recenzie.");
  return {
    id: row.id,
    emailCiphertext: row.email_ciphertext,
    emailHash: row.email_hash,
    displayName: row.display_name,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const AUTHOR_COLUMNS = [
  "id",
  "email_ciphertext",
  "email_hash",
  "display_name",
  "status",
  "email_verified_at",
  "deactivated_at",
  "created_at",
  "updated_at",
].join(", ");

export async function getReviewAuthorById(id: string, database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  const row = await db.prepare(
    "SELECT " + AUTHOR_COLUMNS + " FROM review_authors WHERE id=?1 LIMIT 1",
  ).bind(id).first<ReviewAuthorRow>();
  return row ? rowToReviewAuthor(row) : null;
}

export async function getReviewAuthorByEmailHash(emailHash: string, database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  const row = await db.prepare(
    "SELECT " + AUTHOR_COLUMNS + " FROM review_authors WHERE email_hash=?1 LIMIT 1",
  ).bind(emailHash).first<ReviewAuthorRow>();
  return row ? rowToReviewAuthor(row) : null;
}

export async function createOrGetPendingReviewAuthor(input: {
  emailCiphertext: string;
  emailHash: string;
  now?: Date;
  database?: D1Database;
}) {
  const db = getReviewAuthorDatabase(input.database);
  const nowIso = (input.now ?? new Date()).toISOString();
  await db.prepare(
    "INSERT OR IGNORE INTO review_authors " +
    "(id,email_ciphertext,email_hash,status,created_at,updated_at) " +
    "VALUES (?1,?2,?3,'PENDING_VERIFICATION',?4,?4)",
  ).bind(crypto.randomUUID(), input.emailCiphertext, input.emailHash, nowIso).run();

  const author = await getReviewAuthorByEmailHash(input.emailHash, db);
  if (!author) throw new Error("Autor recenzie sa nepodaril pripraviť.");
  return author;
}

export async function activateVerifiedReviewAuthor(authorId: string, now = new Date(), database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  const nowIso = now.toISOString();
  const row = await db.prepare(
    "UPDATE review_authors SET " +
    "status=CASE WHEN status='PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END, " +
    "email_verified_at=COALESCE(email_verified_at,?2),updated_at=?2 " +
    "WHERE id=?1 AND status IN ('PENDING_VERIFICATION','ACTIVE') RETURNING " + AUTHOR_COLUMNS,
  ).bind(authorId, nowIso).first<ReviewAuthorRow>();
  return row ? rowToReviewAuthor(row) : null;
}

export async function revokeOutstandingReviewAuthorAuthTokens(authorId: string, now = new Date(), database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  await db.prepare(
    "UPDATE resource_access_tokens SET revoked_at=?2 " +
    "WHERE resource_type=?3 AND subject_id=?1 AND purpose=?4 " +
    "AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?2",
  ).bind(authorId, now.toISOString(), REVIEW_AUTHOR_RESOURCE_TYPE, REVIEW_AUTHOR_AUTH_PURPOSE).run();
}

export async function issueReviewAuthorAuthToken(authorId: string, database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  await revokeOutstandingReviewAuthorAuthTokens(authorId, new Date(), db);
  return issueResourceAccessToken(db, {
    resourceType: REVIEW_AUTHOR_RESOURCE_TYPE,
    subjectId: authorId,
    purpose: REVIEW_AUTHOR_AUTH_PURPOSE,
    ttlSeconds: REVIEW_AUTHOR_MAGIC_LINK_TTL_SECONDS,
  });
}

export async function createReviewAuthorSession(authorId: string, database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  return createResourceManagementSession(db, {
    resourceType: REVIEW_AUTHOR_RESOURCE_TYPE,
    subjectId: authorId,
    permissions: [],
    ttlSeconds: REVIEW_AUTHOR_SESSION_TTL_SECONDS,
    cookieName: REVIEW_AUTHOR_SESSION_COOKIE,
  });
}

export async function resolveReviewAuthorSessionToken(token: string, now = new Date(), database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  const resolved = await resolveResourceManagementSession(db, token, now);
  if (!resolved || resolved.resourceType !== REVIEW_AUTHOR_RESOURCE_TYPE) return null;
  return resolved;
}

export async function revokeReviewAuthorSessionToken(token: string, now = new Date(), database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  await revokeResourceManagementSession(db, token, now);
}

export async function revokeAllReviewAuthorSessions(authorId: string, now = new Date(), database?: D1Database) {
  const db = getReviewAuthorDatabase(database);
  await db.prepare(
    "UPDATE resource_management_sessions SET revoked_at=?2 " +
    "WHERE resource_type=?3 AND subject_id=?1 AND revoked_at IS NULL",
  ).bind(authorId, now.toISOString(), REVIEW_AUTHOR_RESOURCE_TYPE).run();
}
