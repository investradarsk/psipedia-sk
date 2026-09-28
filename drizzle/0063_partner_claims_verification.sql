CREATE TABLE `partner_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text NOT NULL REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `status` text NOT NULL DEFAULT 'PENDING' CHECK (`status` IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  `request_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `reviewed_at` text,
  `reviewed_by` text,
  `decision_note` text,
  `cancelled_at` text
);
CREATE UNIQUE INDEX `partner_claims_pending_unique`
  ON `partner_claims` (`account_id`,`resource_id`) WHERE `status`='PENDING';
CREATE INDEX `partner_claims_status_created_idx`
  ON `partner_claims` (`status`,`created_at`);
CREATE INDEX `partner_claims_account_created_idx`
  ON `partner_claims` (`account_id`,`created_at`);
CREATE INDEX `partner_claims_resource_status_idx`
  ON `partner_claims` (`resource_id`,`status`,`created_at`);

CREATE TABLE `partner_resource_verifications` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text NOT NULL REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `status` text NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (`status` IN ('PENDING_VERIFICATION','VERIFIED','REJECTED')),
  `request_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `submitted_at` text,
  `reviewed_at` text,
  `reviewed_by` text,
  `review_note` text
);
CREATE UNIQUE INDEX `partner_resource_verifications_account_resource_unique`
  ON `partner_resource_verifications` (`account_id`,`resource_id`);
CREATE INDEX `partner_resource_verifications_status_submitted_idx`
  ON `partner_resource_verifications` (`status`,`submitted_at`);
CREATE INDEX `partner_resource_verifications_resource_status_idx`
  ON `partner_resource_verifications` (`resource_id`,`status`);

CREATE TABLE `partner_notification_outbox_next` (
  `id` text PRIMARY KEY NOT NULL,
  `partner_account_id` text NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN (
    'AUTH_MAGIC_LINK','CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED','VERIFICATION_APPROVED','VERIFICATION_REJECTED'
  )),
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
INSERT INTO `partner_notification_outbox_next`
  (`id`,`partner_account_id`,`notification_type`,`dedupe_key`,`status`,`encrypted_secret`,`expires_at`,
   `attempts`,`last_attempt_at`,`provider_message_id`,`last_error`,`sent_at`,`created_at`,`updated_at`)
SELECT `id`,`partner_account_id`,`notification_type`,`dedupe_key`,`status`,`encrypted_secret`,`expires_at`,
  `attempts`,`last_attempt_at`,`provider_message_id`,`last_error`,`sent_at`,`created_at`,`updated_at`
FROM `partner_notification_outbox`;
DROP TABLE `partner_notification_outbox`;
ALTER TABLE `partner_notification_outbox_next` RENAME TO `partner_notification_outbox`;
CREATE UNIQUE INDEX `partner_notification_outbox_dedupe_unique` ON `partner_notification_outbox` (`dedupe_key`);
CREATE INDEX `partner_notification_outbox_status_expiry_idx` ON `partner_notification_outbox` (`status`,`expires_at`,`updated_at`);
CREATE INDEX `partner_notification_outbox_account_created_idx` ON `partner_notification_outbox` (`partner_account_id`,`created_at`);

DROP TRIGGER IF EXISTS `partner_audit_events_no_update`;
DROP TRIGGER IF EXISTS `partner_audit_events_no_delete`;

CREATE TABLE `partner_audit_events_next` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_type` text NOT NULL CHECK (`actor_type` IN ('PARTNER','ADMIN','SYSTEM')),
  `actor_ref` text NOT NULL,
  `action` text NOT NULL CHECK (`action` IN (
    'ACCOUNT_CREATED','EMAIL_VERIFIED','ACCOUNT_SUSPENDED','ACCOUNT_REACTIVATED','ACCOUNT_DEACTIVATED','SESSIONS_REVOKED',
    'MEMBERSHIP_CREATED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REVOKED',
    'COMMERCIAL_INTEREST_CREATED','COMMERCIAL_INTEREST_STATUS_CHANGED','COMMERCIAL_INTEREST_NOTE_UPDATED',
    'CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_CANCELLED',
    'VERIFICATION_REQUESTED','VERIFICATION_VERIFIED','VERIFICATION_REJECTED'
  )),
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `metadata_json` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
INSERT INTO `partner_audit_events_next`
  (`id`,`actor_type`,`actor_ref`,`action`,`target_type`,`target_id`,`metadata_json`,`created_at`)
SELECT `id`,`actor_type`,`actor_ref`,`action`,`target_type`,`target_id`,`metadata_json`,`created_at`
FROM `partner_audit_events`;
DROP TABLE `partner_audit_events`;
ALTER TABLE `partner_audit_events_next` RENAME TO `partner_audit_events`;
CREATE INDEX `partner_audit_target_created_idx`
  ON `partner_audit_events` (`target_type`,`target_id`,`created_at`);
CREATE INDEX `partner_audit_actor_created_idx`
  ON `partner_audit_events` (`actor_type`,`actor_ref`,`created_at`);
CREATE TRIGGER `partner_audit_events_no_update`
  BEFORE UPDATE ON `partner_audit_events`
  BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
CREATE TRIGGER `partner_audit_events_no_delete`
  BEFORE DELETE ON `partner_audit_events`
  BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
