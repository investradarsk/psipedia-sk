CREATE TABLE `partner_commercial_interests` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `resource_id` text REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `interest_type` text NOT NULL CHECK (`interest_type` IN ('PREMIUM_PROFILE','PROMOTED_PROFILE','AD_CAMPAIGN','OTHER')),
  `status` text NOT NULL DEFAULT 'NEW' CHECK (`status` IN ('NEW','CONTACTED','INTERESTED','NOT_NOW','CLOSED')),
  `message` text,
  `admin_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `status_updated_at` text,
  `status_updated_by` text
);
CREATE UNIQUE INDEX `partner_commercial_new_resource_unique`
  ON `partner_commercial_interests` (`account_id`,`resource_id`,`interest_type`)
  WHERE `status`='NEW' AND `resource_id` IS NOT NULL;
CREATE UNIQUE INDEX `partner_commercial_new_account_unique`
  ON `partner_commercial_interests` (`account_id`,`interest_type`)
  WHERE `status`='NEW' AND `resource_id` IS NULL;
CREATE INDEX `partner_commercial_status_created_idx`
  ON `partner_commercial_interests` (`status`,`created_at`);
CREATE INDEX `partner_commercial_account_created_idx`
  ON `partner_commercial_interests` (`account_id`,`created_at`);
CREATE INDEX `partner_commercial_resource_created_idx`
  ON `partner_commercial_interests` (`resource_id`,`created_at`);

DROP TRIGGER IF EXISTS `partner_audit_events_no_update`;
DROP TRIGGER IF EXISTS `partner_audit_events_no_delete`;

CREATE TABLE `partner_audit_events_next` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_type` text NOT NULL CHECK (`actor_type` IN ('PARTNER','ADMIN','SYSTEM')),
  `actor_ref` text NOT NULL,
  `action` text NOT NULL CHECK (`action` IN (
    'ACCOUNT_CREATED','EMAIL_VERIFIED','ACCOUNT_SUSPENDED','ACCOUNT_REACTIVATED','ACCOUNT_DEACTIVATED','SESSIONS_REVOKED',
    'MEMBERSHIP_CREATED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REVOKED',
    'COMMERCIAL_INTEREST_CREATED','COMMERCIAL_INTEREST_STATUS_CHANGED','COMMERCIAL_INTEREST_NOTE_UPDATED'
  )),
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `metadata_json` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);
INSERT INTO `partner_audit_events_next` (`id`,`actor_type`,`actor_ref`,`action`,`target_type`,`target_id`,`metadata_json`,`created_at`)
SELECT `id`,`actor_type`,`actor_ref`,`action`,`target_type`,`target_id`,`metadata_json`,`created_at`
FROM `partner_audit_events`;
DROP TABLE `partner_audit_events`;
ALTER TABLE `partner_audit_events_next` RENAME TO `partner_audit_events`;
CREATE INDEX `partner_audit_target_created_idx` ON `partner_audit_events` (`target_type`,`target_id`,`created_at`);
CREATE INDEX `partner_audit_actor_created_idx` ON `partner_audit_events` (`actor_type`,`actor_ref`,`created_at`);
CREATE TRIGGER `partner_audit_events_no_update` BEFORE UPDATE ON `partner_audit_events` BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
CREATE TRIGGER `partner_audit_events_no_delete` BEFORE DELETE ON `partner_audit_events` BEGIN SELECT RAISE(ABORT, 'partner_audit_events is append-only'); END;
