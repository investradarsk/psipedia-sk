import { buildManagementSessionCookie, createOpaqueToken, hashOpaqueToken, isManagementSessionUsable, isStoredTokenUsable } from "@/lib/resource-access";

export type ResourceIdentity = { resourceType: string; subjectId: string };

export async function issueResourceAccessToken(db: D1Database, input: ResourceIdentity & { purpose: string; ttlSeconds: number }) {
  if (!input.resourceType || !input.subjectId || !input.purpose) throw new Error("Resource access token scope is required");
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 24 * 60 * 60) throw new Error("Invalid access-token lifetime");
  const token = createOpaqueToken();
  const tokenHash = await hashOpaqueToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000).toISOString();
  await db.prepare(`INSERT INTO resource_access_tokens (id, resource_type, subject_id, purpose, token_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(crypto.randomUUID(), input.resourceType, input.subjectId, input.purpose, tokenHash, expiresAt, now.toISOString()).run();
  return { token, expiresAt };
}

export async function consumeResourceAccessToken(db: D1Database, input: { token: string; purpose: string; now?: Date }) {
  const now = input.now ?? new Date();
  const tokenHash = await hashOpaqueToken(input.token);
  const row = await db.prepare(`SELECT resource_type, subject_id, purpose, expires_at, used_at, revoked_at FROM resource_access_tokens WHERE token_hash = ?1 LIMIT 1`)
    .bind(tokenHash).first<{ resource_type: string; subject_id: string; purpose: string; expires_at: string; used_at: string | null; revoked_at: string | null }>();
  if (!row || row.purpose !== input.purpose || !isStoredTokenUsable({ expiresAt: row.expires_at, usedAt: row.used_at, revokedAt: row.revoked_at }, now)) return null;
  const update = await db.prepare(`UPDATE resource_access_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?2`)
    .bind(tokenHash, now.toISOString()).run();
  if ((update.meta?.changes ?? 0) !== 1) return null;
  return { resourceType: row.resource_type, subjectId: row.subject_id };
}

export async function createResourceManagementSession(db: D1Database, input: ResourceIdentity & { permissions: string[]; ttlSeconds: number; cookieName: string }) {
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 60 || input.ttlSeconds > 7 * 24 * 60 * 60) throw new Error("Invalid management-session lifetime");
  const token = createOpaqueToken();
  const sessionHash = await hashOpaqueToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000).toISOString();
  await db.prepare(`INSERT INTO resource_management_sessions (id, resource_type, subject_id, session_hash, permissions_json, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(crypto.randomUUID(), input.resourceType, input.subjectId, sessionHash, JSON.stringify([...new Set(input.permissions)]), expiresAt, now.toISOString()).run();
  return { token, expiresAt, cookie: buildManagementSessionCookie(input.cookieName, token, input.ttlSeconds) };
}

export async function resolveResourceManagementSession(db: D1Database, token: string, now = new Date()) {
  const sessionHash = await hashOpaqueToken(token);
  const row = await db.prepare(`SELECT resource_type, subject_id, permissions_json, expires_at, revoked_at FROM resource_management_sessions WHERE session_hash = ?1 LIMIT 1`)
    .bind(sessionHash).first<{ resource_type: string; subject_id: string; permissions_json: string; expires_at: string; revoked_at: string | null }>();
  if (!row || !isManagementSessionUsable({ expiresAt: row.expires_at, revokedAt: row.revoked_at }, now)) return null;
  await db.prepare(`UPDATE resource_management_sessions SET last_used_at = ?2 WHERE session_hash = ?1 AND revoked_at IS NULL`).bind(sessionHash, now.toISOString()).run();
  return { resourceType: row.resource_type, subjectId: row.subject_id, permissions: JSON.parse(row.permissions_json) as string[] };
}

export async function revokeResourceManagementSession(db: D1Database, token: string, now = new Date()) {
  const sessionHash = await hashOpaqueToken(token);
  await db.prepare(`UPDATE resource_management_sessions SET revoked_at = ?2 WHERE session_hash = ?1 AND revoked_at IS NULL`).bind(sessionHash, now.toISOString()).run();
}
