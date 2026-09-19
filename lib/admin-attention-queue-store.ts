import { env } from "cloudflare:workers";
import { ADOPTION_STALE_DAYS } from "./adoption.ts";
import {
  ADMIN_ATTENTION_SOURCE_LIMIT,
  mapAdoptionStaleAttention,
  mapArticleFeedbackAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  sortAdminAttentionItems,
  type AdoptionStaleAttentionRow,
  type ArticleFeedbackAttentionRow,
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
    WHERE resource_type IN ('LOST_FOUND_CASE', 'ADOPTION_DOG')
    ORDER BY
      CASE WHEN status IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN created_at END ASC,
      CASE WHEN status NOT IN ('SUBMITTED', 'PENDING_REVIEW', 'QUARANTINED') THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ModerationAttentionRow>();

  const newsTipsPromise = db.prepare(`
    SELECT id, title, topic, status, created_at AS createdAt, updated_at AS updatedAt
    FROM news_tips
    ORDER BY
      CASE WHEN status IN ('new', 'reviewing') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'reviewing') THEN created_at END ASC,
      CASE WHEN status NOT IN ('new', 'reviewing') THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<NewsTipAttentionRow>();

  const changeRequestsPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt, updated_at AS updatedAt
    FROM directory_profile_change_requests
    ORDER BY
      CASE WHEN status = 'new' THEN 0 ELSE 1 END,
      CASE WHEN status = 'new' THEN created_at END ASC,
      CASE WHEN status != 'new' THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryChangeRequestAttentionRow>();

  const inquiriesPromise = db.prepare(`
    SELECT id, profile_name AS profileName, profile_category AS profileCategory, status,
      created_at AS createdAt, updated_at AS updatedAt
    FROM directory_inquiries
    ORDER BY
      CASE WHEN status IN ('new', 'read') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'read') THEN created_at END ASC,
      CASE WHEN status = 'resolved' THEN updated_at END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<DirectoryInquiryAttentionRow>();

  const feedbackPromise = db.prepare(`
    SELECT id, article_title AS articleTitle, article_path AS articlePath, status,
      created_at AS createdAt, attention_updated_at AS updatedAt
    FROM article_feedback
    WHERE helpful = 0
    ORDER BY
      CASE WHEN status IN ('new', 'reviewing') THEN 0 ELSE 1 END,
      CASE WHEN status IN ('new', 'reviewing') THEN created_at END ASC,
      CASE WHEN status NOT IN ('new', 'reviewing') THEN COALESCE(attention_updated_at, created_at) END DESC,
      id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<ArticleFeedbackAttentionRow>();

  const adoptionsPromise = db.prepare(`
    SELECT id, name, status, last_verified_at AS lastVerifiedAt, created_at AS createdAt
    FROM adoption_dogs
    WHERE status IN ('ACTIVE', 'RESERVED')
      AND (last_verified_at IS NULL OR last_verified_at < ?)
    ORDER BY COALESCE(last_verified_at, created_at) ASC, id ASC
    LIMIT ?
  `).bind(staleThreshold, ADMIN_ATTENTION_SOURCE_LIMIT).all<AdoptionStaleAttentionRow>();

  const [moderation, newsTips, changeRequests, inquiries, feedback, adoptions] = await Promise.all([
    moderationPromise,
    newsTipsPromise,
    changeRequestsPromise,
    inquiriesPromise,
    feedbackPromise,
    adoptionsPromise,
  ]);

  return sortAdminAttentionItems([
    ...moderation.results.map((row) => mapModerationAttention(row, now)).filter((item) => item !== null),
    ...newsTips.results.map((row) => mapNewsTipAttention(row, now)),
    ...changeRequests.results.map((row) => mapDirectoryChangeRequestAttention(row, now)),
    ...inquiries.results.map((row) => mapDirectoryInquiryAttention(row, now)),
    ...feedback.results.map((row) => mapArticleFeedbackAttention(row, now)),
    ...adoptions.results.map((row) => mapAdoptionStaleAttention(row, now)),
  ]);
}
