CREATE TABLE `partner_commercial_agreements` (
  `id` text PRIMARY KEY NOT NULL,
  `interest_id` text REFERENCES `partner_commercial_interests`(`id`) ON DELETE RESTRICT,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `agreement_type` text NOT NULL CHECK (`agreement_type` IN ('PREMIUM_PROFILE','PROMOTED_PROFILE','AD_CAMPAIGN')),
  `status` text NOT NULL DEFAULT 'DRAFT' CHECK (`status` IN ('DRAFT','OFFERED','AGREED','ACTIVE','EXPIRED','CANCELLED')),
  `payment_method` text NOT NULL CHECK (`payment_method` IN ('BANK_TRANSFER','BY_AGREEMENT')),
  `payment_status` text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (`payment_status` IN ('NOT_REQUIRED','AWAITING_PAYMENT','PAID','WAIVED')),
  `price_cents` integer NOT NULL CHECK (`price_cents` >= 0 AND `price_cents` <= 2147483647),
  `currency` text NOT NULL DEFAULT 'EUR' CHECK (`currency`='EUR'),
  `start_at` text NOT NULL,
  `end_at` text NOT NULL,
  `partner_note` text,
  `payment_instruction` text,
  `admin_note` text,
  `paid_at` text,
  `paid_by` text,
  `campaign_id` text REFERENCES `monetization_campaigns`(`id`) ON DELETE RESTRICT,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  CHECK (`end_at` > `start_at`),
  CHECK ((`agreement_type` IN ('PREMIUM_PROFILE','PROMOTED_PROFILE') AND `resource_id` IS NOT NULL) OR `agreement_type`='AD_CAMPAIGN')
);
CREATE UNIQUE INDEX `partner_commercial_agreement_interest_active_unique`
  ON `partner_commercial_agreements`(`interest_id`)
  WHERE `interest_id` IS NOT NULL AND `status`<>'CANCELLED';
CREATE INDEX `partner_commercial_agreement_account_created_idx`
  ON `partner_commercial_agreements`(`account_id`,`created_at`);
CREATE INDEX `partner_commercial_agreement_resource_status_idx`
  ON `partner_commercial_agreements`(`resource_id`,`status`,`end_at`);
CREATE INDEX `partner_commercial_agreement_payment_status_idx`
  ON `partner_commercial_agreements`(`payment_status`,`status`,`updated_at`);

CREATE UNIQUE INDEX `partner_commercial_promotion_provenance_unique`
  ON `monetization_promotions`(`provenance`)
  WHERE substr(`provenance`,1,18)='partner-agreement:';

CREATE TABLE `partner_entitlements` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text NOT NULL REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `agreement_id` text NOT NULL REFERENCES `partner_commercial_agreements`(`id`) ON DELETE RESTRICT,
  `entitlement_type` text NOT NULL CHECK (`entitlement_type` IN ('PREMIUM_PROFILE','PROMOTED_PROFILE')),
  `status` text NOT NULL DEFAULT 'SCHEDULED' CHECK (`status` IN ('SCHEDULED','ACTIVE','PAUSED','EXPIRED','CANCELLED')),
  `start_at` text NOT NULL,
  `end_at` text NOT NULL,
  `promotion_id` text REFERENCES `monetization_promotions`(`id`) ON DELETE RESTRICT,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `activated_at` text,
  `activated_by` text,
  `cancelled_at` text,
  `cancelled_by` text,
  CHECK (`end_at` > `start_at`),
  CHECK ((`entitlement_type`='PROMOTED_PROFILE' AND `promotion_id` IS NOT NULL) OR (`entitlement_type`='PREMIUM_PROFILE' AND `promotion_id` IS NULL))
);
CREATE UNIQUE INDEX `partner_entitlement_agreement_type_unique`
  ON `partner_entitlements`(`agreement_id`,`entitlement_type`);
CREATE UNIQUE INDEX `partner_entitlement_current_resource_type_unique`
  ON `partner_entitlements`(`resource_id`,`entitlement_type`)
  WHERE `status` IN ('SCHEDULED','ACTIVE','PAUSED');
CREATE INDEX `partner_entitlement_public_window_idx`
  ON `partner_entitlements`(`resource_id`,`entitlement_type`,`status`,`start_at`,`end_at`);
CREATE INDEX `partner_entitlement_end_status_idx`
  ON `partner_entitlements`(`end_at`,`status`);

CREATE TABLE `partner_notification_outbox_next` (
  `id` text PRIMARY KEY NOT NULL,
  `partner_account_id` text NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN (
    'AUTH_MAGIC_LINK','CLAIM_SUBMITTED','CLAIM_APPROVED','CLAIM_REJECTED',
    'VERIFICATION_APPROVED','VERIFICATION_REJECTED',
    'PROFILE_CHANGE_SUBMITTED','PROFILE_CHANGE_APPROVED','PROFILE_CHANGE_REJECTED',
    'NEW_PROFILE_SUBMITTED','NEW_PROFILE_CREATED','NEW_PROFILE_LINKED_EXISTING','NEW_PROFILE_REJECTED',
    'EVENT_SUBMITTED','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED',
    'COMMERCIAL_OFFER_CREATED','COMMERCIAL_AGREEMENT_UPDATED','PAYMENT_MARKED_PAID',
    'ENTITLEMENT_ACTIVATED','ENTITLEMENT_EXPIRING','ENTITLEMENT_EXPIRED'
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
CREATE UNIQUE INDEX `partner_notification_outbox_dedupe_unique` ON `partner_notification_outbox`(`dedupe_key`);
CREATE INDEX `partner_notification_outbox_status_expiry_idx` ON `partner_notification_outbox`(`status`,`expires_at`,`updated_at`);
CREATE INDEX `partner_notification_outbox_account_created_idx` ON `partner_notification_outbox`(`partner_account_id`,`created_at`);

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
    'EVENT_SUBMITTED','EVENT_CHANGE_SUBMITTED','EVENT_WITHDRAWN','EVENT_CREATED','EVENT_LINKED_EXISTING','EVENT_CHANGE_APPROVED','EVENT_REJECTED'
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
