import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const moderationSubmissions = sqliteTable(
  "moderation_submissions",
  {
    id: text("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    subjectId: text("subject_id"),
    operation: text("operation").notNull(),
    status: text("status").notNull().default("SUBMITTED"),
    submitterType: text("submitter_type").notNull(),
    submitterRef: text("submitter_ref"),
    proposedPatchJson: text("proposed_patch_json").notNull().default("{}"),
    riskFlagsJson: text("risk_flags_json").notNull().default("[]"),
    duplicateResourceType: text("duplicate_resource_type"),
    duplicateSubjectId: text("duplicate_subject_id"),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    rejectionReasonCode: text("rejection_reason_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("moderation_submissions_status_created_idx").on(table.status, table.createdAt),
    index("moderation_submissions_resource_subject_idx").on(table.resourceType, table.subjectId, table.createdAt),
    index("moderation_submissions_submitter_idx").on(table.submitterType, table.submitterRef, table.createdAt),
  ],
);

export const moderationEvents = sqliteTable(
  "moderation_events",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id"),
    resourceType: text("resource_type").notNull(),
    subjectId: text("subject_id"),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorRef: text("actor_ref"),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    reasonCode: text("reason_code"),
    changedFieldsJson: text("changed_fields_json").notNull().default("[]"),
    requestId: text("request_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("moderation_events_subject_created_idx").on(table.resourceType, table.subjectId, table.createdAt),
    index("moderation_events_submission_created_idx").on(table.submissionId, table.createdAt),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    state: text("state").notNull().default("QUARANTINE"),
    privateKey: text("private_key").notNull(),
    safeKey: text("safe_key"),
    publicKey: text("public_key"),
    originalMime: text("original_mime").notNull(),
    safeMime: text("safe_mime"),
    sizeBytes: integer("size_bytes").notNull(),
    safeSizeBytes: integer("safe_size_bytes"),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at"),
    publishedAt: text("published_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("media_assets_private_key_unique").on(table.privateKey),
    uniqueIndex("media_assets_safe_key_unique").on(table.safeKey),
    uniqueIndex("media_assets_public_key_unique").on(table.publicKey),
    index("media_assets_owner_state_idx").on(table.ownerType, table.ownerId, table.state),
    index("media_assets_state_created_idx").on(table.state, table.createdAt),
  ],
);

export const resourceAccessTokens = sqliteTable(
  "resource_access_tokens",
  {
    id: text("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    subjectId: text("subject_id").notNull(),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("resource_access_tokens_hash_unique").on(table.tokenHash),
    index("resource_access_tokens_subject_purpose_idx").on(table.resourceType, table.subjectId, table.purpose, table.expiresAt),
  ],
);

export const resourceManagementSessions = sqliteTable(
  "resource_management_sessions",
  {
    id: text("id").primaryKey(),
    resourceType: text("resource_type").notNull(),
    subjectId: text("subject_id").notNull(),
    sessionHash: text("session_hash").notNull(),
    permissionsJson: text("permissions_json").notNull().default("[]"),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    uniqueIndex("resource_management_sessions_hash_unique").on(table.sessionHash),
    index("resource_management_sessions_subject_idx").on(table.resourceType, table.subjectId, table.expiresAt),
  ],
);

export const securityRateLimits = sqliteTable("security_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStartedAt: text("window_started_at").notNull(),
  count: integer("count").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const turnstileTokenUses = sqliteTable("turnstile_token_uses", {
  tokenHash: text("token_hash").primaryKey(),
  action: text("action").notNull(),
  hostname: text("hostname").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at").notNull(),
});
