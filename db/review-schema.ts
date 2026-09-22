import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { partnerAccounts, partnerMemberships, partnerResources } from "./partner-schema";

export const reviewAuthors = sqliteTable("review_authors", {
  id: text("id").primaryKey(),
  emailCiphertext: text("email_ciphertext").notNull(),
  emailHash: text("email_hash").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default("PENDING_VERIFICATION"),
  emailVerifiedAt: text("email_verified_at"),
  deactivatedAt: text("deactivated_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("review_authors_status_check", sql`${table.status} IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DEACTIVATED')`),
  uniqueIndex("review_authors_email_hash_unique").on(table.emailHash),
  index("review_authors_status_updated_idx").on(table.status, table.updatedAt),
]);

export const reviewAuthNotificationOutbox = sqliteTable("review_auth_notification_outbox", {
  id: text("id").primaryKey(),
  reviewAuthorId: text("review_author_id").notNull().references(() => reviewAuthors.id, { onDelete: "restrict" }),
  notificationType: text("notification_type").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("PENDING"),
  encryptedSecret: text("encrypted_secret"),
  expiresAt: text("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  providerMessageId: text("provider_message_id"),
  lastError: text("last_error"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("review_auth_notification_type_check", sql`${table.notificationType} IN ('AUTH_MAGIC_LINK')`),
  check("review_auth_notification_status_check", sql`${table.status} IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')`),
  uniqueIndex("review_auth_notification_dedupe_unique").on(table.dedupeKey),
  index("review_auth_notification_status_expiry_idx").on(table.status, table.expiresAt, table.updatedAt),
  index("review_auth_notification_author_created_idx").on(table.reviewAuthorId, table.createdAt),
]);

export const profileReviews = sqliteTable("profile_reviews", {
  id: text("id").primaryKey(),
  resourceId: text("resource_id").notNull().references(() => partnerResources.id, { onDelete: "restrict" }),
  authorId: text("author_id").notNull().references(() => reviewAuthors.id, { onDelete: "restrict" }),
  overallRating: integer("overall_rating").notNull(),
  body: text("body").notNull(),
  serviceMonth: text("service_month"),
  serviceTypeKey: text("service_type_key"),
  ratingSchemaVersion: integer("rating_schema_version").notNull().default(1),
  status: text("status").notNull().default("PENDING_REVIEW"),
  riskFlagsJson: text("risk_flags_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
  deletedAt: text("deleted_at"),
}, table => [
  check("profile_reviews_rating_check", sql`${table.overallRating} BETWEEN 1 AND 5`),
  check("profile_reviews_body_length_check", sql`length(${table.body}) BETWEEN 20 AND 5000`),
  check("profile_reviews_schema_version_check", sql`${table.ratingSchemaVersion} >= 1`),
  check("profile_reviews_status_check", sql`${table.status} IN ('PENDING_REVIEW','VISIBLE','HIDDEN','REJECTED','AUTHOR_DELETED','REMOVED')`),
  uniqueIndex("profile_reviews_resource_author_unique").on(table.resourceId, table.authorId),
  index("profile_reviews_resource_status_created_idx").on(table.resourceId, table.status, table.createdAt),
  index("profile_reviews_resource_status_rating_idx").on(table.resourceId, table.status, table.overallRating),
  index("profile_reviews_author_created_idx").on(table.authorId, table.createdAt),
  index("profile_reviews_status_created_idx").on(table.status, table.createdAt),
]);

export const profileReviewRatingValues = sqliteTable("profile_review_rating_values", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => profileReviews.id, { onDelete: "restrict" }),
  dimensionKey: text("dimension_key").notNull(),
  value: integer("value").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("profile_review_rating_values_value_check", sql`${table.value} BETWEEN 1 AND 5`),
  uniqueIndex("profile_review_rating_values_review_dimension_unique").on(table.reviewId, table.dimensionKey),
  index("profile_review_rating_values_review_idx").on(table.reviewId),
  index("profile_review_rating_values_dimension_idx").on(table.dimensionKey, table.reviewId),
]);

export const profileReviewProviderReplies = sqliteTable("profile_review_provider_replies", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => profileReviews.id, { onDelete: "restrict" }),
  partnerAccountId: text("partner_account_id").notNull().references(() => partnerAccounts.id, { onDelete: "restrict" }),
  partnerMembershipId: text("partner_membership_id").notNull().references(() => partnerMemberships.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  status: text("status").notNull().default("VISIBLE"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  removedAt: text("removed_at"),
}, table => [
  check("profile_review_provider_replies_status_check", sql`${table.status} IN ('VISIBLE','HIDDEN','REMOVED')`),
  check("profile_review_provider_replies_body_check", sql`length(${table.body}) BETWEEN 1 AND 5000`),
  uniqueIndex("profile_review_provider_replies_review_unique").on(table.reviewId),
  index("profile_review_provider_replies_account_created_idx").on(table.partnerAccountId, table.createdAt),
]);

export const profileReviewHelpfulVotes = sqliteTable("profile_review_helpful_votes", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => profileReviews.id, { onDelete: "restrict" }),
  authorId: text("author_id").notNull().references(() => reviewAuthors.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("profile_review_helpful_votes_review_author_unique").on(table.reviewId, table.authorId),
  index("profile_review_helpful_votes_review_created_idx").on(table.reviewId, table.createdAt),
  index("profile_review_helpful_votes_author_created_idx").on(table.authorId, table.createdAt),
]);

export const profileReviewReports = sqliteTable("profile_review_reports", {
  id: text("id").primaryKey(),
  reviewId: text("review_id").notNull().references(() => profileReviews.id, { onDelete: "restrict" }),
  providerReplyId: text("provider_reply_id").references(() => profileReviewProviderReplies.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  reporterType: text("reporter_type").notNull(),
  reviewAuthorId: text("review_author_id").references(() => reviewAuthors.id, { onDelete: "restrict" }),
  partnerAccountId: text("partner_account_id").references(() => partnerAccounts.id, { onDelete: "restrict" }),
  reasonCode: text("reason_code").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("OPEN"),
  resolvedBy: text("resolved_by"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  check("profile_review_reports_target_check", sql`(${table.targetType}='REVIEW' AND ${table.providerReplyId} IS NULL) OR (${table.targetType}='PROVIDER_REPLY' AND ${table.providerReplyId} IS NOT NULL)`),
  check("profile_review_reports_reporter_check", sql`(${table.reporterType}='REVIEW_AUTHOR' AND ${table.reviewAuthorId} IS NOT NULL AND ${table.partnerAccountId} IS NULL) OR (${table.reporterType}='PARTNER' AND ${table.reviewAuthorId} IS NULL AND ${table.partnerAccountId} IS NOT NULL)`),
  check("profile_review_reports_status_check", sql`${table.status} IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')`),
  uniqueIndex("profile_review_reports_review_author_unique").on(table.reviewId, table.reviewAuthorId)
    .where(sql`${table.targetType}='REVIEW' AND ${table.reporterType}='REVIEW_AUTHOR'`),
  uniqueIndex("profile_review_reports_review_partner_unique").on(table.reviewId, table.partnerAccountId)
    .where(sql`${table.targetType}='REVIEW' AND ${table.reporterType}='PARTNER'`),
  uniqueIndex("profile_review_reports_reply_author_unique").on(table.providerReplyId, table.reviewAuthorId)
    .where(sql`${table.targetType}='PROVIDER_REPLY' AND ${table.reporterType}='REVIEW_AUTHOR'`),
  uniqueIndex("profile_review_reports_reply_partner_unique").on(table.providerReplyId, table.partnerAccountId)
    .where(sql`${table.targetType}='PROVIDER_REPLY' AND ${table.reporterType}='PARTNER'`),
  index("profile_review_reports_status_created_idx").on(table.status, table.createdAt),
  index("profile_review_reports_review_status_idx").on(table.reviewId, table.status, table.createdAt),
]);
