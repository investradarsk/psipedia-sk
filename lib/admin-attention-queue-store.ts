import { env } from "cloudflare:workers";
import { ADOPTION_STALE_DAYS } from "./adoption.ts";
import {
  ADMIN_ATTENTION_SOURCE_LIMIT,
  mapAdoptionStaleAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  sortAdminAttentionItems,
  type AdoptionStaleAttentionRow,
  type DirectoryChangeRequestAttentionRow,
  type DirectoryInquiryAttentionRow,
  type ModerationAttentionRow,
  type NewsTipAttentionRow,
} from "./admin-attention-queue.ts";

export type AdminAttentionD1Database = Pick<D1Database, "prepare">;
type RuntimeBindings = { DB?: D1Database };

function getD1Binding(database?: AdminAttentionD1Database) {
  if (database && typeof database.prepare === "function") return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  return bound && typeof bound.prepare === "function" ? bound : null;
}

function requireD1Binding(database?: AdminAttentionD1Database) {
  const resolved = getD1Binding(database);
  if (!resolved) throw new Error("Databáza admin operácií zatiaľ nie je pripojená.");
  return resolved;
}

export async function loadAdminAttentionQueue(database?: AdminAttentionD1Database, now = new Date()) {
  const db = requireD1Binding(database);
  const staleThreshold = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();

  const moderationPromise = db.prepare(`
    SELECT id, resource_type AS resourceType, operation, status, risk_flags_json AS riskFlagsJson,
      created_at AS createdAt, updated_at AS updatedAt
    FROM moderation_submissions
    WHERE status IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED')
      AND resource_type IN ('LOST_FOUND_CASE', 'ADOPTION_DOG')
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ModerationAttentionRow>();

  const newsTipsPromise = db.prepare(`
    SELECT id, title, topic, status, created_at AS createdAt
    FROM news_tips
    WHERE status = 'new'
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<NewsTipAttentionRow>();

  const changeRequestsPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt
    FROM directory_profile_change_requests
    WHERE status = 'new'
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryChangeRequestAttentionRow>();

  const inquiriesPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt
    FROM directory_inquiries
    WHERE status = 'new'
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryInquiryAttentionRow>();

  const adoptionsPromise = db.prepare(`
    SELECT id, name, status, organization_name AS organizationName,
      last_verified_at AS lastVerifiedAt, created_at AS createdAt
    FROM adoption_dogs
    WHERE status IN ('ACTIVE', 'RESERVED')
      AND (last_verified_at IS NULL OR last_verified_at < ?)
    ORDER BY COALESCE(last_verified_at, created_at) ASC, id ASC
    LIMIT ?
  `).bind(staleThreshold, ADMIN_ATTENTION_SOURCE_LIMIT).all<AdoptionStaleAttentionRow>();

  const [moderation, newsTips, changeRequests, inquiries, adoptions] = await Promise.all([
    moderationPromise,
    newsTipsPromise,
    changeRequestsPromise,
    inquiriesPromise,
    adoptionsPromise,
  ]);

  return sortAdminAttentionItems([
    ...moderation.results.map((row) => mapModerationAttention(row, now)).filter((item) => item !== null),
    ...newsTips.results.map((row) => mapNewsTipAttention(row, now)),
    ...changeRequests.results.map((row) => mapDirectoryChangeRequestAttention(row, now)),
    ...inquiries.results.map((row) => mapDirectoryInquiryAttention(row, now)),
    ...adoptions.results.map((row) => mapAdoptionStaleAttention(row, now)),
  ]);
}
