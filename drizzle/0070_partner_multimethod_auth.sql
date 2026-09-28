CREATE TABLE `partner_password_credentials` (
  `account_id` text PRIMARY KEY NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `password_hash` text NOT NULL,
  `hash_version` integer NOT NULL DEFAULT 1 CHECK (`hash_version` = 1),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `partner_auth_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `provider` text NOT NULL CHECK (`provider` IN ('GOOGLE')),
  `provider_subject` text NOT NULL,
  `linked_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `partner_auth_identities_provider_subject_unique`
  ON `partner_auth_identities`(`provider`, `provider_subject`);
CREATE UNIQUE INDEX `partner_auth_identities_account_provider_unique`
  ON `partner_auth_identities`(`account_id`, `provider`);

CREATE TABLE `partner_notification_outbox_next` (
  `id` text PRIMARY KEY NOT NULL,
  `partner_account_id` text NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN (
    'AUTH_MAGIC_LINK','PASSWORD_RESET',
    'CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED',
    'VERIFICATION_APPROVED','VERIFICATION_REJECTED',
    'PROFILE_CHANGE_SUBMITTED','PROFILE_CHANGE_APPROVED','PROFILE_CHANGE_REJECTED',
    'NEW_PROFILE_SUBMITTED','NEW_PROFILE_CREATED','NEW_PROFILE_LINKED_EXISTING','NEW_PROFILE_REJECTED',
    'EVENT_SUBMITTED','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED',
    'COMMERCIAL_OFFER_CREATED','COMMERCIAL_AGREEMENT_UPDATED','PAYMENT_MARKED_PAID',
    'ENTITLEMENT_ACTIVATED','ENTITLEMENT_EXPIRING','ENTITLEMENT_EXPIRED'
  )),
  `dedupe_key` text NOT NULL,
  `status` text NOT NULL DEFAULT 'PENDING' CHECK (`status` IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  `encrypted_secret` text,
  `expires_at` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
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
CREATE UNIQUE INDEX `partner_notification_outbox_dedupe_unique` ON `partner_notification_outbox`(`dedupe_key`);
CREATE INDEX `partner_notification_outbox_status_expiry_idx`
  ON `partner_notification_outbox`(`status`,`expires_at`,`updated_at`);
CREATE INDEX `partner_notification_outbox_account_created_idx`
  ON `partner_notification_outbox`(`partner_account_id`,`created_at`);

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
    'COMMERCIAL_AGREEMENT_CREATED','COMMERCIAL_AGREEMENT_UPDATED','COMMERCIAL_PAYMENT_MARKED_PAID',
    'ENTITLEMENT_ACTIVATED','ENTITLEMENT_PAUSED','ENTITLEMENT_CANCELLED','ENTITLEMENT_EXPIRED',
    'COMMERCIAL_PROMOTION_LINKED','COMMERCIAL_CAMPAIGN_LINKED',
    'CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED','CLAIM_CANCELLED',
    'VERIFICATION_REQUESTED','VERIFICATION_VERIFIED','VERIFICATION_REJECTED',
    'PROFILE_CHANGE_SUBMITTED','PROFILE_CHANGE_WITHDRAWN','PROFILE_CHANGE_APPROVED','PROFILE_CHANGE_REJECTED',
    'NEW_PROFILE_SUBMITTED','NEW_PROFILE_WITHDRAWN','NEW_PROFILE_CREATED','NEW_PROFILE_LINKED_EXISTING','NEW_PROFILE_REJECTED',
    'EVENT_SUBMITTED','EVENT_CHANGE_SUBMITTED','EVENT_WITHDRAWN','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED',
    'CONTACT_PROFILE_COMPLETED','CONTACT_PROFILE_UPDATED',
    'PASSWORD_SET','PASSWORD_CHANGED','PASSWORD_RESET_COMPLETED','GOOGLE_IDENTITY_LINKED'
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
CREATE INDEX `partner_audit_target_created_idx` ON `partner_audit_events`(`target_type`,`target_id`,`created_at`);
CREATE INDEX `partner_audit_actor_created_idx` ON `partner_audit_events`(`actor_type`,`actor_ref`,`created_at`);
CREATE TRIGGER `partner_audit_events_no_update` BEFORE UPDATE ON `partner_audit_events`
  BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
CREATE TRIGGER `partner_audit_events_no_delete` BEFORE DELETE ON `partner_audit_events`
  BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
