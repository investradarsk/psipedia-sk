import { env } from "cloudflare:workers";
import { ADOPTION_STALE_DAYS } from "./adoption.ts";
import {
  ADMIN_ATTENTION_SOURCE_LIMIT,
  mapAdoptionStaleAttention,
  mapAutomationFindingAttention,
  mapArticleFeedbackAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  sortAdminAttentionItems,
  type AdoptionStaleAttentionRow,
  type AutomationFindingAttentionRow,
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

async function safeSourceResults<T>(source: string, query: Promise<D1Result<T>>) {
  try {
    return (await query).results;
  } catch (error) {
    console.warn("Admin attention source query failed.", {
      source,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return [] as T[];
  }
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

  const automationPromise = db.prepare(`
    SELECT f.id, f.entity_type AS entityType, f.finding_type AS findingType, f.priority,
      f.review_status AS reviewStatus, s.label AS sourceLabel, f.source_url AS sourceUrl,
      f.first_detected_at AS firstDetectedAt, f.last_detected_at AS lastDetectedAt
    FROM automation_findings f
    JOIN automation_sources s ON s.id = f.source_id
    ORDER BY
      CASE WHEN f.review_status IN ('NEW','IN_REVIEW') THEN 0 ELSE 1 END,
      CASE f.priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
      CASE WHEN f.review_status IN ('NEW','IN_REVIEW') THEN f.first_detected_at END ASC,
      CASE WHEN f.review_status NOT IN ('NEW','IN_REVIEW') THEN f.last_detected_at END DESC,
      f.id ASC
    LIMIT ?
  `).bind(ADMIN_ATTENTION_SOURCE_LIMIT).all<AutomationFindingAttentionRow>();

  const [moderation, newsTips, changeRequests, inquiries, feedback, adoptions, automation] = await Promise.all([
    safeSourceResults("moderation", moderationPromise),
    safeSourceResults("news_tips", newsTipsPromise),
    safeSourceResults("directory_change_requests", changeRequestsPromise),
    safeSourceResults("directory_inquiries", inquiriesPromise),
    safeSourceResults("article_feedback", feedbackPromise),
    safeSourceResults("adoption_stale", adoptionsPromise),
    safeSourceResults("automation_findings", automationPromise),
  ]);

  return sortAdminAttentionItems([
    ...moderation.map((row) => mapModerationAttention(row, now)).filter((item) => item !== null),
    ...newsTips.map((row) => mapNewsTipAttention(row, now)),
    ...changeRequests.map((row) => mapDirectoryChangeRequestAttention(row, now)),
    ...inquiries.map((row) => mapDirectoryInquiryAttention(row, now)),
    ...feedback.map((row) => mapArticleFeedbackAttention(row, now)),
    ...adoptions.map((row) => mapAdoptionStaleAttention(row, now)),
    ...automation.map((row) => mapAutomationFindingAttention(row, now)),
  ]);
}

export async function loadExactAdminAttentionSummary(database?: AdminAttentionD1Database, now = new Date()) {
  const db=requireD1Binding(database);
  const staleThreshold=new Date(now.getTime()-ADOPTION_STALE_DAYS*86_400_000).toISOString();
  const queries=[
    ["MODERATION_SUBMISSION",`SELECT COUNT(*) count FROM moderation_submissions WHERE resource_type IN ('LOST_FOUND_CASE','ADOPTION_DOG') AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')`,[]],
    ["NEWS_TIP",`SELECT COUNT(*) count FROM news_tips WHERE status IN ('new','reviewing')`,[]],
    ["DIRECTORY_CHANGE_REQUEST",`SELECT COUNT(*) count FROM directory_profile_change_requests WHERE status='new'`,[]],
    ["DIRECTORY_INQUIRY",`SELECT COUNT(*) count FROM directory_inquiries WHERE status IN ('new','read')`,[]],
    ["ARTICLE_FEEDBACK",`SELECT COUNT(*) count FROM article_feedback WHERE helpful=0 AND status IN ('new','reviewing')`,[]],
    ["ADOPTION_STALE",`SELECT COUNT(*) count FROM adoption_dogs WHERE status IN ('ACTIVE','RESERVED') AND (last_verified_at IS NULL OR last_verified_at<?)`,[staleThreshold]],
    ["AUTOMATION_FINDING",`SELECT COUNT(*) count FROM automation_findings WHERE review_status IN ('NEW','IN_REVIEW')`,[]],
  ] as const;
  const counts=await Promise.all(queries.map(async([source,sql,bindings])=>{
    try{const row=await db.prepare(sql).bind(...bindings).first<{count:number}>();return [source,Number(row?.count??0)] as const;}catch{return [source,0] as const;}
  }));
  const bySource=Object.fromEntries(counts) as Record<string,number>;
  return {active:Object.values(bySource).reduce((sum,value)=>sum+value,0),bySource};
}
