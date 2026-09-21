import { env } from "cloudflare:workers";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPartnerPassword,
  normalizePartnerDisplayName,
  normalizePartnerEmail,
  validatePartnerPassword,
  verifyPartnerPassword,
  PARTNER_SESSION_DAYS,
} from "@/lib/partner-auth-core";

type RuntimeBindings = { DB?: D1Database };

export type PartnerAccount = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  createdAt: string;
  lastLoginAt: string | null;
};

export type PartnerEntityType = "directory_profile" | "help_organization" | "event";
export type PartnerMembershipRole = "OWNER" | "MANAGER" | "EDITOR";
export type PartnerVerificationStatus = "UNVERIFIED" | "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type PartnerInterestType = "PREMIUM_PROFILE" | "PROMOTED_PROFILE" | "ADVERTISING" | "OTHER";
export type PartnerInterestStatus = "NEW" | "CONTACTED" | "INTERESTED" | "NOT_NOW" | "CLOSED";

export type PartnerManagedEntity = {
  membershipId: string;
  entityType: PartnerEntityType;
  entityId: string;
  role: PartnerMembershipRole;
  name: string;
  subtype: string;
  publicationStatus: string;
  verificationStatus: PartnerVerificationStatus;
};

type AccountRow = {
  id: string; email: string; display_name: string; password_hash: string; password_salt: string;
  password_iterations: number; email_verified_at: string | null; status: PartnerAccount["status"];
  created_at: string; last_login_at: string | null;
};

function db() {
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database?.prepare) throw new Error("Partner databáza nie je pripojená.");
  return database;
}

function toAccount(row: AccountRow): PartnerAccount {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerifiedAt: row.email_verified_at,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

async function audit(
  database: D1Database,
  actorType: "PARTNER" | "ADMIN" | "SYSTEM",
  actorRef: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await database.prepare(`INSERT INTO partner_audit_log
    (actor_type, actor_ref, action, target_type, target_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      actorType, actorRef, action, targetType, targetId, JSON.stringify(metadata), new Date().toISOString(),
    ).run();
}

export async function consumePartnerRateLimit(bucketKey: string, limit: number, windowMs: number) {
  const database = db();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + windowMs).toISOString();
  const row = await database.prepare(`INSERT INTO security_rate_limits
    (bucket_key, window_started_at, count, expires_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      count = CASE WHEN security_rate_limits.expires_at <= excluded.window_started_at THEN 1 ELSE security_rate_limits.count + 1 END,
      window_started_at = CASE WHEN security_rate_limits.expires_at <= excluded.window_started_at THEN excluded.window_started_at ELSE security_rate_limits.window_started_at END,
      expires_at = CASE WHEN security_rate_limits.expires_at <= excluded.window_started_at THEN excluded.expires_at ELSE security_rate_limits.expires_at END
    RETURNING count, expires_at`).bind(bucketKey, nowIso, expiresAt).first<{ count: number; expires_at: string }>();
  if (!row || row.count > limit) throw new Error("Príliš veľa pokusov. Skúste to neskôr.");
  return row;
}

async function createEmailToken(database: D1Database, accountId: string, purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMs: number) {
  const token = createOpaqueToken();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date();
  await database.prepare(`UPDATE partner_email_tokens SET used_at = ?
    WHERE account_id = ? AND purpose = ? AND used_at IS NULL`).bind(now.toISOString(), accountId, purpose).run();
  await database.prepare(`INSERT INTO partner_email_tokens
    (id, account_id, purpose, token_hash, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)`).bind(
      crypto.randomUUID(), accountId, purpose, tokenHash,
      new Date(now.getTime() + ttlMs).toISOString(), now.toISOString(),
    ).run();
  return token;
}

export async function createPartnerAccount(payload: Record<string, unknown>) {
  const database = db();
  const email = normalizePartnerEmail(payload.email);
  const displayName = normalizePartnerDisplayName(payload.displayName);
  const password = validatePartnerPassword(payload.password);
  const existing = await database.prepare("SELECT id FROM partner_accounts WHERE email = ? COLLATE NOCASE LIMIT 1")
    .bind(email).first<{ id: string }>();
  if (existing) throw new Error("Účet s týmto e-mailom už existuje.");

  const credentials = await hashPartnerPassword(password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO partner_accounts
    (id, email, display_name, password_hash, password_salt, password_iterations, email_verified_at,
      status, created_at, updated_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', ?, ?, NULL)`).bind(
      id, email, displayName, credentials.hash, credentials.salt, credentials.iterations, now, now,
    ).run();
  await audit(database, "PARTNER", id, "account.created", "partner_account", id);
  const verificationToken = await createEmailToken(database, id, "EMAIL_VERIFICATION", 24 * 60 * 60 * 1000);
  return { account: { id, email, displayName, emailVerifiedAt: null, status: "ACTIVE", createdAt: now, lastLoginAt: null } as PartnerAccount, verificationToken };
}

export async function authenticatePartner(emailValue: unknown, passwordValue: unknown) {
  const database = db();
  const email = normalizePartnerEmail(emailValue);
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const row = await database.prepare(`SELECT id, email, display_name, password_hash, password_salt, password_iterations,
      email_verified_at, status, created_at, last_login_at
    FROM partner_accounts WHERE email = ? COLLATE NOCASE LIMIT 1`).bind(email).first<AccountRow>();
  if (!row || row.status !== "ACTIVE" || !(await verifyPartnerPassword(password, row.password_hash, row.password_salt, row.password_iterations))) {
    throw new Error("E-mail alebo heslo nie je správne.");
  }
  const now = new Date().toISOString();
  await database.prepare("UPDATE partner_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, row.id).run();
  await audit(database, "PARTNER", row.id, "account.login", "partner_account", row.id);
  return { ...toAccount(row), lastLoginAt: now };
}

export async function createPartnerSession(accountId: string) {
  const database = db();
  const token = createOpaqueToken();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date();
  await database.prepare(`INSERT INTO partner_sessions
    (id, account_id, token_hash, expires_at, revoked_at, created_at, last_used_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)`).bind(
      crypto.randomUUID(), accountId, tokenHash,
      new Date(now.getTime() + PARTNER_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(), now.toISOString(),
    ).run();
  return token;
}

export async function revokePartnerSession(token: string | null) {
  if (!token) return;
  const database = db();
  const tokenHash = await hashOpaqueToken(token);
  const row = await database.prepare("SELECT account_id FROM partner_sessions WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1")
    .bind(tokenHash).first<{ account_id: string }>();
  const now = new Date().toISOString();
  await database.prepare("UPDATE partner_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(now, tokenHash).run();
  if (row) await audit(database, "PARTNER", row.account_id, "account.logout", "partner_account", row.account_id);
}

export async function getPartnerAccountBySessionToken(token: string | null) {
  if (!token) return null;
  const database = db();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date().toISOString();
  const row = await database.prepare(`SELECT a.id, a.email, a.display_name, a.password_hash, a.password_salt,
      a.password_iterations, a.email_verified_at, a.status, a.created_at, a.last_login_at
    FROM partner_sessions s
    JOIN partner_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND a.status = 'ACTIVE'
    LIMIT 1`).bind(tokenHash, now).first<AccountRow>();
  if (!row) return null;
  await database.prepare("UPDATE partner_sessions SET last_used_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return toAccount(row);
}

export async function verifyPartnerEmailToken(token: string) {
  if (!token || token.length > 200) throw new Error("Overovací odkaz nie je platný.");
  const database = db();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date().toISOString();
  const row = await database.prepare(`SELECT t.id, t.account_id
    FROM partner_email_tokens t
    JOIN partner_accounts a ON a.id = t.account_id
    WHERE t.token_hash = ? AND t.purpose = 'EMAIL_VERIFICATION' AND t.used_at IS NULL
      AND t.expires_at > ? AND a.status = 'ACTIVE' LIMIT 1`).bind(tokenHash, now)
    .first<{ id: string; account_id: string }>();
  if (!row) throw new Error("Overovací odkaz vypršal alebo už bol použitý.");
  await database.prepare("UPDATE partner_email_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
  await database.prepare("UPDATE partner_accounts SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?")
    .bind(now, now, row.account_id).run();
  await audit(database, "PARTNER", row.account_id, "account.email_verified", "partner_account", row.account_id);
}

export async function createPartnerVerificationToken(accountId: string) {
  const database = db();
  const account = await database.prepare("SELECT email, display_name, email_verified_at, status FROM partner_accounts WHERE id = ? LIMIT 1")
    .bind(accountId).first<{ email: string; display_name: string; email_verified_at: string | null; status: string }>();
  if (!account || account.status !== "ACTIVE" || account.email_verified_at) return null;
  return {
    email: account.email,
    displayName: account.display_name,
    token: await createEmailToken(database, accountId, "EMAIL_VERIFICATION", 24 * 60 * 60 * 1000),
  };
}

export async function createPartnerPasswordReset(emailValue: unknown) {
  const database = db();
  let email: string;
  try { email = normalizePartnerEmail(emailValue); } catch { return null; }
  const account = await database.prepare(`SELECT id, email, display_name FROM partner_accounts
    WHERE email = ? COLLATE NOCASE AND status = 'ACTIVE' LIMIT 1`).bind(email)
    .first<{ id: string; email: string; display_name: string }>();
  if (!account) return null;
  return {
    email: account.email,
    displayName: account.display_name,
    token: await createEmailToken(database, account.id, "PASSWORD_RESET", 60 * 60 * 1000),
  };
}

export async function resetPartnerPassword(token: string, passwordValue: unknown) {
  const password = validatePartnerPassword(passwordValue);
  const database = db();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date().toISOString();
  const row = await database.prepare(`SELECT t.id, t.account_id FROM partner_email_tokens t
    JOIN partner_accounts a ON a.id = t.account_id
    WHERE t.token_hash = ? AND t.purpose = 'PASSWORD_RESET' AND t.used_at IS NULL
      AND t.expires_at > ? AND a.status = 'ACTIVE' LIMIT 1`).bind(tokenHash, now)
    .first<{ id: string; account_id: string }>();
  if (!row) throw new Error("Odkaz na obnovu hesla vypršal alebo už bol použitý.");
  const credentials = await hashPartnerPassword(password);
  await database.prepare("UPDATE partner_email_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, row.id).run();
  await database.prepare(`UPDATE partner_accounts SET password_hash = ?, password_salt = ?,
    password_iterations = ?, updated_at = ? WHERE id = ?`).bind(
      credentials.hash, credentials.salt, credentials.iterations, now, row.account_id,
    ).run();
  await database.prepare("UPDATE partner_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL")
    .bind(now, row.account_id).run();
  await audit(database, "PARTNER", row.account_id, "account.password_reset", "partner_account", row.account_id);
}

export async function listPartnerManagedEntities(accountId: string): Promise<PartnerManagedEntity[]> {
  const database = db();
  const memberships = await database.prepare(`SELECT m.id, m.entity_type, m.entity_id, m.role,
      COALESCE(v.status, 'UNVERIFIED') AS verification_status
    FROM partner_memberships m
    LEFT JOIN partner_entity_verifications v ON v.entity_type = m.entity_type AND v.entity_id = m.entity_id
    WHERE m.account_id = ? AND m.status = 'ACTIVE'
    ORDER BY m.created_at ASC`).bind(accountId)
    .all<{ id: string; entity_type: PartnerEntityType; entity_id: string; role: PartnerMembershipRole; verification_status: PartnerVerificationStatus }>();

  const values = await Promise.all((memberships.results ?? []).map(async (membership) => {
    let row: { name: string; subtype: string; status: string } | null = null;
    const numericId = Number.parseInt(membership.entity_id, 10);
    if (membership.entity_type === "directory_profile" && Number.isSafeInteger(numericId)) {
      row = await database.prepare("SELECT name, category AS subtype, status FROM directory_profiles WHERE id = ? LIMIT 1")
        .bind(numericId).first<{ name: string; subtype: string; status: string }>();
    } else if (membership.entity_type === "help_organization" && Number.isSafeInteger(numericId)) {
      row = await database.prepare("SELECT name, type AS subtype, status FROM help_organizations WHERE id = ? LIMIT 1")
        .bind(numericId).first<{ name: string; subtype: string; status: string }>();
    } else if (membership.entity_type === "event" && Number.isSafeInteger(numericId)) {
      row = await database.prepare("SELECT title AS name, event_type AS subtype, status FROM managed_events WHERE id = ? LIMIT 1")
        .bind(numericId).first<{ name: string; subtype: string; status: string }>();
    }
    if (!row) return null;
    return {
      membershipId: membership.id,
      entityType: membership.entity_type,
      entityId: membership.entity_id,
      role: membership.role,
      name: row.name,
      subtype: row.subtype,
      publicationStatus: row.status,
      verificationStatus: membership.verification_status,
    } satisfies PartnerManagedEntity;
  }));
  return values.filter((value): value is PartnerManagedEntity => Boolean(value));
}

export async function createPartnerCommercialInterest(accountId: string, payload: Record<string, unknown>) {
  const database = db();
  const interestType = String(payload.interestType ?? "") as PartnerInterestType;
  if (!["PREMIUM_PROFILE", "PROMOTED_PROFILE", "ADVERTISING", "OTHER"].includes(interestType)) {
    throw new Error("Vyberte typ propagácie.");
  }
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 1200) : "";
  const entityType = typeof payload.entityType === "string" && payload.entityType ? payload.entityType as PartnerEntityType : null;
  const entityId = typeof payload.entityId === "string" && payload.entityId ? payload.entityId : null;
  if ((entityType && !entityId) || (!entityType && entityId)) throw new Error("Profil propagácie nie je platný.");
  if (entityType && entityId) {
    const membership = await database.prepare(`SELECT id FROM partner_memberships
      WHERE account_id = ? AND entity_type = ? AND entity_id = ? AND status = 'ACTIVE' LIMIT 1`)
      .bind(accountId, entityType, entityId).first<{ id: string }>();
    if (!membership) throw new Error("K tomuto profilu nemáte oprávnenie.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO partner_commercial_interests
    (id, account_id, entity_type, entity_id, interest_type, note, status, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?, ?, NULL)`).bind(
      id, accountId, entityType, entityId, interestType, note, now, now,
    ).run();
  await audit(database, "PARTNER", accountId, "commercial_interest.submitted", "partner_commercial_interest", id, { interestType, entityType, entityId });
  return id;
}

export async function listPartnerCommercialInterests(accountId: string) {
  const database = db();
  const result = await database.prepare(`SELECT id, entity_type, entity_id, interest_type, note, status, created_at, updated_at
    FROM partner_commercial_interests WHERE account_id = ? ORDER BY created_at DESC LIMIT 50`).bind(accountId)
    .all<{ id: string; entity_type: PartnerEntityType | null; entity_id: string | null; interest_type: PartnerInterestType; note: string; status: PartnerInterestStatus; created_at: string; updated_at: string }>();
  return (result.results ?? []).map((row) => ({
    id: row.id, entityType: row.entity_type, entityId: row.entity_id, interestType: row.interest_type,
    note: row.note, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function deactivatePartnerAccount(accountId: string) {
  const database = db();
  const now = new Date().toISOString();
  await database.prepare("UPDATE partner_accounts SET status = 'DEACTIVATED', updated_at = ? WHERE id = ? AND status = 'ACTIVE'")
    .bind(now, accountId).run();
  await database.prepare("UPDATE partner_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL")
    .bind(now, accountId).run();
  await audit(database, "PARTNER", accountId, "account.deactivated", "partner_account", accountId);
}
