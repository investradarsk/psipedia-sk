CREATE TABLE `partner_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `email_ciphertext` text NOT NULL,
  `email_hash` text NOT NULL,
  `status` text DEFAULT 'PENDING_VERIFICATION' NOT NULL CHECK (`status` IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DEACTIVATED')),
  `email_verified_at` text,
  `suspended_at` text,
  `deactivated_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `partner_accounts_email_hash_unique` ON `partner_accounts` (`email_hash`);
CREATE INDEX `partner_accounts_status_updated_idx` ON `partner_accounts` (`status`,`updated_at`);

CREATE TABLE `partner_notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `partner_account_id` text NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN ('AUTH_MAGIC_LINK')),
  `dedupe_key` text NOT NULL,
  `status` text DEFAULT 'PENDING' NOT NULL CHECK (`status` IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  `encrypted_secret` text,
  `expires_at` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` text,
  `provider_message_id` text,
  `last_error` text,
  `sent_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `partner_notification_outbox_dedupe_unique` ON `partner_notification_outbox` (`dedupe_key`);
CREATE INDEX `partner_notification_outbox_status_expiry_idx` ON `partner_notification_outbox` (`status`,`expires_at`,`updated_at`);
CREATE INDEX `partner_notification_outbox_account_created_idx` ON `partner_notification_outbox` (`partner_account_id`,`created_at`);
