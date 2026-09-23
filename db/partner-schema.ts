import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { helpOrganizations } from "./help-organization-schema";
import { directoryProfiles, managedEvents } from "./schema";
import { moderationSubmissions } from "./foundation-schema";

export const partnerAccounts = sqliteTable(
  "partner_accounts",
  {
    id: text("id").primaryKey(),
    emailCiphertext: text("email_ciphertext").notNull(),
    emailHash: text("email_hash").notNull(),
    status: text("status").notNull().default("PENDING_VERIFICATION"),
    emailVerifiedAt: text("email_verified_at"),
    suspendedAt: text("suspended_at"),
    deactivatedAt: text("deactivated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("partner_accounts_email_hash_unique").on(table.emailHash),
    index("partner_accounts_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const partnerNotificationOutbox = sqliteTable(
  "partner_notification_outbox",
  {
    id: text("id").primaryKey(),
    partnerAccountId: text("partner_account_id").notNull(),
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
  },
  (table) => [
    check("partner_notification_outbox_type_check", sql`${table.notificationType} IN ('AUTH_MAGIC_LINK','CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED','VERIFICATION_APPROVED','VERIFICATION_REJECTED','PROFILE_CHANGE_SUBMITTED','PROFILE_CHANGE_APPROVED','PROFILE_CHANGE_REJECTED','NEW_PROFILE_SUBMITTED','NEW_PROFILE_CREATED','NEW_PROFILE_LINKED_EXISTING','NEW_PROFILE_REJECTED','EVENT_SUBMITTED','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED')`),
    check("partner_notification_outbox_status_check", sql`${table.status} IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')`),
    uniqueIndex("partner_notification_outbox_dedupe_unique").on(table.dedupeKey),
    index("partner_notification_outbox_status_expiry_idx").on(table.status, table.expiresAt, table.updatedAt),
    index("partner_notification_outbox_account_created_idx").on(table.partnerAccountId, table.createdAt),
  ],
);

export const partnerResources = sqliteTable("partner_resources", {
  id: text("id").primaryKey(), entityType: text("entity_type").notNull(),
  directoryProfileId: integer("directory_profile_id").references(() => directoryProfiles.id, { onDelete: "restrict" }),
  helpOrganizationId: integer("help_organization_id").references(() => helpOrganizations.id, { onDelete: "restrict" }),
  managedEventId: integer("managed_event_id").references(() => managedEvents.id, { onDelete: "restrict" }),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  check("partner_resources_entity_type_check", sql`${table.entityType} IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION','MANAGED_EVENT')`),
  check("partner_resources_target_check", sql`(${table.entityType}='DIRECTORY_PROFILE' AND ${table.directoryProfileId} IS NOT NULL AND ${table.helpOrganizationId} IS NULL AND ${table.managedEventId} IS NULL) OR (${table.entityType}='HELP_ORGANIZATION' AND ${table.directoryProfileId} IS NULL AND ${table.helpOrganizationId} IS NOT NULL AND ${table.managedEventId} IS NULL) OR (${table.entityType}='MANAGED_EVENT' AND ${table.directoryProfileId} IS NULL AND ${table.helpOrganizationId} IS NULL AND ${table.managedEventId} IS NOT NULL)`),
  uniqueIndex("partner_resources_directory_unique").on(table.directoryProfileId).where(sql`${table.directoryProfileId} IS NOT NULL`),
  uniqueIndex("partner_resources_organization_unique").on(table.helpOrganizationId).where(sql`${table.helpOrganizationId} IS NOT NULL`),
  uniqueIndex("partner_resources_event_unique").on(table.managedEventId).where(sql`${table.managedEventId} IS NOT NULL`),
]);

export const partnerMemberships = sqliteTable("partner_memberships", {
  id:text("id").primaryKey(), accountId:text("account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  resourceId:text("resource_id").notNull().references(()=>partnerResources.id,{onDelete:"restrict"}), role:text("role").notNull(),
  createdAt:text("created_at").notNull(),createdBy:text("created_by").notNull(),updatedAt:text("updated_at").notNull(),revokedAt:text("revoked_at"),revokedBy:text("revoked_by"),
}, table=>[
  check("partner_memberships_role_check",sql`${table.role} IN ('OWNER','MANAGER','EDITOR')`),
  uniqueIndex("partner_memberships_active_unique").on(table.accountId,table.resourceId).where(sql`${table.revokedAt} IS NULL`),
]);

export const partnerCommercialInterests = sqliteTable("partner_commercial_interests", {
  id:text("id").primaryKey(),
  accountId:text("account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  resourceId:text("resource_id").references(()=>partnerResources.id,{onDelete:"restrict"}),
  interestType:text("interest_type").notNull(),status:text("status").notNull().default("NEW"),
  message:text("message"),adminNote:text("admin_note"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
  statusUpdatedAt:text("status_updated_at"),statusUpdatedBy:text("status_updated_by"),
}, table=>[
  check("partner_commercial_interest_type_check",sql`${table.interestType} IN ('PREMIUM_PROFILE','PROMOTED_PROFILE','AD_CAMPAIGN','OTHER')`),
  check("partner_commercial_status_check",sql`${table.status} IN ('NEW','CONTACTED','INTERESTED','NOT_NOW','CLOSED')`),
  uniqueIndex("partner_commercial_new_resource_unique").on(table.accountId,table.resourceId,table.interestType).where(sql`${table.status}='NEW' AND ${table.resourceId} IS NOT NULL`),
  uniqueIndex("partner_commercial_new_account_unique").on(table.accountId,table.interestType).where(sql`${table.status}='NEW' AND ${table.resourceId} IS NULL`),
  index("partner_commercial_status_created_idx").on(table.status,table.createdAt),
  index("partner_commercial_account_created_idx").on(table.accountId,table.createdAt),
  index("partner_commercial_resource_created_idx").on(table.resourceId,table.createdAt),
]);


export const partnerClaims = sqliteTable("partner_claims", {
  id:text("id").primaryKey(),
  accountId:text("account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  resourceId:text("resource_id").notNull().references(()=>partnerResources.id,{onDelete:"restrict"}),
  status:text("status").notNull().default("PENDING"),
  requestMessage:text("request_message"),
  createdAt:text("created_at").notNull(),
  updatedAt:text("updated_at").notNull(),
  reviewedAt:text("reviewed_at"),
  reviewedBy:text("reviewed_by"),
  decisionNote:text("decision_note"),
  cancelledAt:text("cancelled_at"),
}, table=>[
  check("partner_claims_status_check",sql`${table.status} IN ('PENDING','APPROVED','REJECTED','CANCELLED')`),
  uniqueIndex("partner_claims_pending_unique").on(table.accountId,table.resourceId).where(sql`${table.status}='PENDING'`),
  index("partner_claims_status_created_idx").on(table.status,table.createdAt),
  index("partner_claims_account_created_idx").on(table.accountId,table.createdAt),
  index("partner_claims_resource_status_idx").on(table.resourceId,table.status,table.createdAt),
]);

export const partnerResourceVerifications = sqliteTable("partner_resource_verifications", {
  id:text("id").primaryKey(),
  accountId:text("account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  resourceId:text("resource_id").notNull().references(()=>partnerResources.id,{onDelete:"restrict"}),
  status:text("status").notNull().default("PENDING_VERIFICATION"),
  requestNote:text("request_note"),
  createdAt:text("created_at").notNull(),
  updatedAt:text("updated_at").notNull(),
  submittedAt:text("submitted_at"),
  reviewedAt:text("reviewed_at"),
  reviewedBy:text("reviewed_by"),
  reviewNote:text("review_note"),
}, table=>[
  check("partner_resource_verifications_status_check",sql`${table.status} IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')`),
  uniqueIndex("partner_resource_verifications_account_resource_unique").on(table.accountId,table.resourceId),
  index("partner_resource_verifications_status_submitted_idx").on(table.status,table.submittedAt),
  index("partner_resource_verifications_resource_status_idx").on(table.resourceId,table.status),
]);

export const partnerProfileChangeMetadata = sqliteTable("partner_profile_change_metadata", {
  submissionId:text("submission_id").primaryKey().references(()=>moderationSubmissions.id,{onDelete:"restrict"}),
  partnerResourceId:text("partner_resource_id").notNull().references(()=>partnerResources.id,{onDelete:"restrict"}),
  partnerAccountId:text("partner_account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  baseUpdatedAt:text("base_updated_at").notNull(),
  baseSnapshotJson:text("base_snapshot_json").notNull().default("{}"),
  changedFieldCount:integer("changed_field_count").notNull().default(0),
  dedupeActive:integer("dedupe_active").notNull().default(1),
  createdAt:text("created_at").notNull(),
}, table=>[
  check("partner_profile_change_changed_field_count_check",sql`${table.changedFieldCount} >= 0 AND ${table.changedFieldCount} <= 64`),
  check("partner_profile_change_dedupe_active_check",sql`${table.dedupeActive} IN (0,1)`),
  uniqueIndex("partner_profile_change_active_unique").on(table.partnerAccountId,table.partnerResourceId).where(sql`${table.dedupeActive}=1`),
  index("partner_profile_change_resource_created_idx").on(table.partnerResourceId,table.createdAt),
  index("partner_profile_change_account_created_idx").on(table.partnerAccountId,table.createdAt),
]);

export const partnerNewProfileMetadata = sqliteTable("partner_new_profile_metadata", {
  submissionId:text("submission_id").primaryKey().references(()=>moderationSubmissions.id,{onDelete:"restrict"}),
  partnerAccountId:text("partner_account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  intendedResourceType:text("intended_resource_type").notNull(),
  displayName:text("display_name").notNull(),
  categoryOrType:text("category_or_type").notNull(),
  identityFingerprint:text("identity_fingerprint").notNull(),
  duplicateConfidence:text("duplicate_confidence").notNull().default("NONE"),
  duplicateCandidatesJson:text("duplicate_candidates_json").notNull().default("[]"),
  resolutionType:text("resolution_type"),
  resolvedResourceId:text("resolved_resource_id").references(()=>partnerResources.id,{onDelete:"restrict"}),
  resolvedCanonicalId:integer("resolved_canonical_id"),
  dedupeActive:integer("dedupe_active").notNull().default(1),
  createdAt:text("created_at").notNull(),
}, table=>[
  check("partner_new_profile_resource_type_check",sql`${table.intendedResourceType} IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')`),
  check("partner_new_profile_duplicate_confidence_check",sql`${table.duplicateConfidence} IN ('NONE','MEDIUM','HIGH')`),
  check("partner_new_profile_resolution_type_check",sql`${table.resolutionType} IS NULL OR ${table.resolutionType} IN ('CREATED_NEW','LINKED_EXISTING')`),
  check("partner_new_profile_dedupe_active_check",sql`${table.dedupeActive} IN (0,1)`),
  uniqueIndex("partner_new_profile_active_identity_unique").on(table.partnerAccountId,table.identityFingerprint).where(sql`${table.dedupeActive}=1`),
  index("partner_new_profile_account_created_idx").on(table.partnerAccountId,table.createdAt),
  index("partner_new_profile_duplicate_created_idx").on(table.duplicateConfidence,table.createdAt),
  index("partner_new_profile_resolution_idx").on(table.resolutionType,table.resolvedCanonicalId),
]);

export const partnerEventSubmissionMetadata = sqliteTable("partner_event_submission_metadata", {
  submissionId:text("submission_id").primaryKey().references(()=>moderationSubmissions.id,{onDelete:"restrict"}),
  partnerAccountId:text("partner_account_id").notNull().references(()=>partnerAccounts.id,{onDelete:"restrict"}),
  partnerResourceId:text("partner_resource_id").references(()=>partnerResources.id,{onDelete:"restrict"}),
  operation:text("operation").notNull(),
  baseUpdatedAt:text("base_updated_at"),
  baseSnapshotJson:text("base_snapshot_json").notNull().default("{}"),
  changedFieldCount:integer("changed_field_count").notNull().default(0),
  dedupeKey:text("dedupe_key").notNull(),
  dedupeActive:integer("dedupe_active").notNull().default(1),
  duplicateConfidence:text("duplicate_confidence").notNull().default("NONE"),
  duplicateCandidateId:integer("duplicate_candidate_id").references(()=>managedEvents.id,{onDelete:"restrict"}),
  duplicateReasonsJson:text("duplicate_reasons_json").notNull().default("[]"),
  resolutionType:text("resolution_type"),
  resolvedEventId:integer("resolved_event_id").references(()=>managedEvents.id,{onDelete:"restrict"}),
  createdAt:text("created_at").notNull(),
}, table=>[
  check("partner_event_submission_operation_check",sql`${table.operation} IN ('CREATE','UPDATE')`),
  check("partner_event_submission_changed_count_check",sql`${table.changedFieldCount} >= 0 AND ${table.changedFieldCount} <= 32`),
  check("partner_event_submission_dedupe_active_check",sql`${table.dedupeActive} IN (0,1)`),
  check("partner_event_submission_duplicate_check",sql`${table.duplicateConfidence} IN ('NONE','MEDIUM','HIGH')`),
  check("partner_event_submission_resolution_check",sql`${table.resolutionType} IS NULL OR ${table.resolutionType} IN ('CREATED_NEW','LINKED_EXISTING','UPDATED')`),
  uniqueIndex("partner_event_submission_active_dedupe_unique").on(table.partnerAccountId,table.dedupeKey).where(sql`${table.dedupeActive}=1`),
  index("partner_event_submission_resource_created_idx").on(table.partnerResourceId,table.createdAt),
  index("partner_event_submission_account_created_idx").on(table.partnerAccountId,table.createdAt),
  index("partner_event_submission_duplicate_created_idx").on(table.duplicateConfidence,table.duplicateCandidateId,table.createdAt),
  index("partner_event_submission_resolution_idx").on(table.resolutionType,table.resolvedEventId),
]);

export const partnerAuditEvents = sqliteTable("partner_audit_events", {
  id:text("id").primaryKey(),actorType:text("actor_type").notNull(),actorRef:text("actor_ref").notNull(),action:text("action").notNull(),
  targetType:text("target_type").notNull(),targetId:text("target_id").notNull(),metadataJson:text("metadata_json").notNull().default("{}"),createdAt:text("created_at").notNull(),
}, table=>[
  check("partner_audit_actor_check",sql`${table.actorType} IN ('PARTNER','ADMIN','SYSTEM')`),
  check("partner_audit_action_check",sql`${table.action} IN ('ACCOUNT_CREATED','EMAIL_VERIFIED','ACCOUNT_SUSPENDED','ACCOUNT_REACTIVATED','ACCOUNT_DEACTIVATED','SESSIONS_REVOKED','MEMBERSHIP_CREATED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REVOKED','COMMERCIAL_INTEREST_CREATED','COMMERCIAL_INTEREST_STATUS_CHANGED','COMMERCIAL_INTEREST_NOTE_UPDATED','CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_CANCELLED','VERIFICATION_REQUESTED','VERIFICATION_VERIFIED','VERIFICATION_REJECTED','PROFILE_CHANGE_SUBMITTED','PROFILE_CHANGE_WITHDRAWN','PROFILE_CHANGE_APPROVED','PROFILE_CHANGE_REJECTED','NEW_PROFILE_SUBMITTED','NEW_PROFILE_WITHDRAWN','NEW_PROFILE_CREATED','NEW_PROFILE_LINKED_EXISTING','NEW_PROFILE_REJECTED','EVENT_SUBMITTED','EVENT_CHANGE_SUBMITTED','EVENT_WITHDRAWN','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED')`),
  index("partner_audit_target_created_idx").on(table.targetType,table.targetId,table.createdAt),
]);
