import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const partnerAccounts = sqliteTable(
  "partner_accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastLoginAt: text("last_login_at"),
  },
  (table) => [
    uniqueIndex("partner_accounts_email_unique").on(table.email),
    index("partner_accounts_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const partnerSessions = sqliteTable(
  "partner_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => partnerAccounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [
    uniqueIndex("partner_sessions_token_hash_unique").on(table.tokenHash),
    index("partner_sessions_account_expiry_idx").on(table.accountId, table.expiresAt),
  ],
);

export const partnerEmailTokens = sqliteTable(
  "partner_email_tokens",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => partnerAccounts.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("partner_email_tokens_hash_unique").on(table.tokenHash),
    index("partner_email_tokens_account_purpose_idx").on(table.accountId, table.purpose, table.expiresAt),
  ],
);

export const partnerMemberships = sqliteTable(
  "partner_memberships",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => partnerAccounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    revokedAt: text("revoked_at"),
    revokedBy: text("revoked_by"),
  },
  (table) => [
    uniqueIndex("partner_memberships_account_entity_unique").on(table.accountId, table.entityType, table.entityId),
    index("partner_memberships_entity_idx").on(table.entityType, table.entityId, table.status),
    index("partner_memberships_account_idx").on(table.accountId, table.status),
  ],
);

export const partnerEntityVerifications = sqliteTable(
  "partner_entity_verifications",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status").notNull().default("UNVERIFIED"),
    verifiedAt: text("verified_at"),
    verifiedBy: text("verified_by"),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    uniqueIndex("partner_entity_verifications_entity_unique").on(table.entityType, table.entityId),
    index("partner_entity_verifications_status_idx").on(table.status, table.updatedAt),
  ],
);

export const partnerCommercialInterests = sqliteTable(
  "partner_commercial_interests",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => partnerAccounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    interestType: text("interest_type").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("NEW"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by"),
  },
  (table) => [
    index("partner_commercial_interests_status_created_idx").on(table.status, table.createdAt),
    index("partner_commercial_interests_account_created_idx").on(table.accountId, table.createdAt),
  ],
);

export const partnerAuditLog = sqliteTable(
  "partner_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorType: text("actor_type").notNull(),
    actorRef: text("actor_ref"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("partner_audit_log_target_created_idx").on(table.targetType, table.targetId, table.createdAt),
    index("partner_audit_log_actor_created_idx").on(table.actorType, table.actorRef, table.createdAt),
  ],
);
