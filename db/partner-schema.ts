import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
