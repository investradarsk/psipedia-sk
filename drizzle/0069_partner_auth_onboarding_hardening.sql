CREATE TABLE `partner_account_profiles` (
  `account_id` text PRIMARY KEY NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `contact_name_ciphertext` text NOT NULL,
  `phone_ciphertext` text,
  `relationship_ciphertext` text,
  `completed_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `partner_account_profiles_updated_idx`
  ON `partner_account_profiles`(`updated_at`);

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
    'CONTACT_PROFILE_COMPLETED','CONTACT_PROFILE_UPDATED'
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
