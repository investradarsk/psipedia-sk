import { env } from "cloudflare:workers";
import {
  createResourceManagementSession,
  issueResourceAccessToken,
  resolveResourceManagementSession,
  revokeResourceManagementSession,
} from "@/lib/resource-access-store";

export const PARTNER_ACCOUNT_RESOURCE_TYPE = "PARTNER_ACCOUNT";
export const PARTNER_AUTH_PURPOSE = "PARTNER_AUTH";
export const PARTNER_SESSION_COOKIE = "__Host-psipedia_partner_session";
export const PARTNER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const PARTNER_MAGIC_LINK_TTL_SECONDS = 15 * 60;

export type PartnerAccountStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

export type PartnerAccountRecord = {
  id: string;
  emailCiphertext: string;
  emailHash: string;
  status: PartnerAccountStatus;
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PartnerAccountRow = {
  id: string;
  email_ciphertext: string;
  email_hash: string;
  status: string;
  email_verified_at: string | null;
  suspended_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

type RuntimeBindings = { DB?: D1Database };

export function getPartnerDatabase(database?: D1Database) {
  const db = database ?? (env as unknown as RuntimeBindings).DB;
  if (!db?.prepare) throw new Error("Partner databáza nie je pripojená.");
  return db;
}

function isPartnerAccountStatus(value: string): value is PartnerAccountStatus {
  return value === "PENDING_VERIFICATION"
    || value === "ACTIVE"
    || value === "SUSPENDED"
    || value === "DEACTIVATED";
}

function rowToAccount(row: PartnerAccountRow): PartnerAccountRecord {
  if (!isPartnerAccountStatus(row.status)) throw new Error("Neplatný stav Partner účtu.");
  return {
    id: row.id,
    emailCiphertext: row.email_ciphertext,
    emailHash: row.email_hash,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    suspendedAt: row.suspended_at,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ACCOUNT_COLUMNS = [
  "id",
  "email_ciphertext",
  "email_hash",
  "status",
  "email_verified_at",
  "suspended_at",
  "deactivated_at",
  "created_at",
  "updated_at",
].join(", ");

export async function getPartnerAccountById(id: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  const row = await db.prepare(
    "SELECT " + ACCOUNT_COLUMNS + " FROM partner_accounts WHERE id = ?1 LIMIT 1",
  ).bind(id).first<PartnerAccountRow>();
  return row ? rowToAccount(row) : null;
}

export async function getPartnerAccountByEmailHash(emailHash: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  const row = await db.prepare(
    "SELECT " + ACCOUNT_COLUMNS + " FROM partner_accounts WHERE email_hash = ?1 LIMIT 1",
  ).bind(emailHash).first<PartnerAccountRow>();
  return row ? rowToAccount(row) : null;
}

export async function createPendingPartnerAccountIfMissing(input: {
  emailCiphertext: string;
  emailHash: string;
  now?: Date;
  database?: D1Database;
}) {
  const db = getPartnerDatabase(input.database);
  const nowIso = (input.now ?? new Date()).toISOString();
  const inserted = await db.prepare(
    "INSERT OR IGNORE INTO partner_accounts " +
    "(id,email_ciphertext,email_hash,status,created_at,updated_at) " +
    "VALUES (?1,?2,?3,'PENDING_VERIFICATION',?4,?4) RETURNING id",
  ).bind(crypto.randomUUID(), input.emailCiphertext, input.emailHash, nowIso).first<{ id: string }>();

  const account = await getPartnerAccountByEmailHash(input.emailHash, db);
  if (!account) throw new Error("Partner účet sa nepodarilo pripraviť.");
  return { account, created: Boolean(inserted?.id) };
}

export async function createOrGetPendingPartnerAccount(input: {
  emailCiphertext: string;
  emailHash: string;
  now?: Date;
  database?: D1Database;
}) {
  const db = getPartnerDatabase(input.database);
  const nowIso = (input.now ?? new Date()).toISOString();
  await db.prepare(
    "INSERT OR IGNORE INTO partner_accounts " +
    "(id,email_ciphertext,email_hash,status,created_at,updated_at) " +
    "VALUES (?1,?2,?3,'PENDING_VERIFICATION',?4,?4)",
  ).bind(crypto.randomUUID(), input.emailCiphertext, input.emailHash, nowIso).run();

  const account = await getPartnerAccountByEmailHash(input.emailHash, db);
  if (!account) throw new Error("Partner účet sa nepodarilo pripraviť.");
  return account;
}

export async function activateVerifiedPartnerAccount(accountId: string, now = new Date(), database?: D1Database) {
  const db = getPartnerDatabase(database);
  const nowIso = now.toISOString();
  const row = await db.prepare(
    "UPDATE partner_accounts SET " +
    "status=CASE WHEN status='PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END, " +
    "email_verified_at=COALESCE(email_verified_at,?2), updated_at=?2 " +
    "WHERE id=?1 AND status IN ('PENDING_VERIFICATION','ACTIVE') RETURNING " + ACCOUNT_COLUMNS,
  ).bind(accountId, nowIso).first<PartnerAccountRow>();
  return row ? rowToAccount(row) : null;
}

export async function revokeOutstandingPartnerAuthTokens(accountId: string, now = new Date(), database?: D1Database) {
  const db = getPartnerDatabase(database);
  await db.prepare(
    "UPDATE resource_access_tokens SET revoked_at=?2 " +
    "WHERE resource_type=?3 AND subject_id=?1 AND purpose=?4 " +
    "AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?2",
  ).bind(accountId, now.toISOString(), PARTNER_ACCOUNT_RESOURCE_TYPE, PARTNER_AUTH_PURPOSE).run();
}

export async function issuePartnerAuthToken(accountId: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  await revokeOutstandingPartnerAuthTokens(accountId, new Date(), db);
  return issueResourceAccessToken(db, {
    resourceType: PARTNER_ACCOUNT_RESOURCE_TYPE,
    subjectId: accountId,
    purpose: PARTNER_AUTH_PURPOSE,
    ttlSeconds: PARTNER_MAGIC_LINK_TTL_SECONDS,
  });
}

export async function createPartnerSession(accountId: string, database?: D1Database) {
  const db = getPartnerDatabase(database);
  return createResourceManagementSession(db, {
    resourceType: PARTNER_ACCOUNT_RESOURCE_TYPE,
    subjectId: accountId,
    permissions: [],
    ttlSeconds: PARTNER_SESSION_TTL_SECONDS,
    cookieName: PARTNER_SESSION_COOKIE,
  });
}

export async function resolvePartnerSessionToken(token: string, now = new Date(), database?: D1Database) {
  const db = getPartnerDatabase(database);
  const resolved = await resolveResourceManagementSession(db, token, now);
  if (!resolved || resolved.resourceType !== PARTNER_ACCOUNT_RESOURCE_TYPE) return null;
  return resolved;
}

export async function revokePartnerSessionToken(token: string, now = new Date(), database?: D1Database) {
  const db = getPartnerDatabase(database);
  await revokeResourceManagementSession(db, token, now);
}

export async function revokeAllPartnerSessions(accountId: string, now = new Date(), database?: D1Database) {
  const db = getPartnerDatabase(database);
  await db.prepare(
    "UPDATE resource_management_sessions SET revoked_at=?2 " +
    "WHERE resource_type=?3 AND subject_id=?1 AND revoked_at IS NULL",
  ).bind(accountId, now.toISOString(), PARTNER_ACCOUNT_RESOURCE_TYPE).run();
}

async function transitionPartnerAccount(
  accountId: string,
  status: "SUSPENDED" | "DEACTIVATED",
  now = new Date(),
  database?: D1Database,
) {
  const db = getPartnerDatabase(database);
  const nowIso = now.toISOString();
  const timestampColumn = status === "SUSPENDED" ? "suspended_at" : "deactivated_at";
  await db.prepare(
    "UPDATE partner_accounts SET status=?2," + timestampColumn + "=?3,updated_at=?3 WHERE id=?1",
  ).bind(accountId, status, nowIso).run();
  await Promise.all([
    revokeAllPartnerSessions(accountId, now, db),
    revokeOutstandingPartnerAuthTokens(accountId, now, db),
  ]);
  return getPartnerAccountById(accountId, db);
}

export function suspendPartnerAccount(accountId: string, now = new Date(), database?: D1Database) {
  return transitionPartnerAccount(accountId, "SUSPENDED", now, database);
}

export function deactivatePartnerAccount(accountId: string, now = new Date(), database?: D1Database) {
  return transitionPartnerAccount(accountId, "DEACTIVATED", now, database);
}
