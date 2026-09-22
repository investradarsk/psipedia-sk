import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { helpOrganizations } from "./help-organization-schema";
import { directoryProfiles, managedEvents } from "./schema";

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

export const partnerAuditEvents = sqliteTable("partner_audit_events", {
  id:text("id").primaryKey(),actorType:text("actor_type").notNull(),actorRef:text("actor_ref").notNull(),action:text("action").notNull(),
  targetType:text("target_type").notNull(),targetId:text("target_id").notNull(),metadataJson:text("metadata_json").notNull().default("{}"),createdAt:text("created_at").notNull(),
}, table=>[index("partner_audit_target_created_idx").on(table.targetType,table.targetId,table.createdAt)]);
