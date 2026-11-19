-- Additive, FK-safe Partner Help claims/ownership. No rebuild of referenced partner_resources.
-- One APPROVED row represents the single active external manager for a canonical help record.
-- REVOKED retains the full ownership history, while removing editor authorization.
CREATE TABLE `partner_help_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')),
  `adoption_dog_id` integer REFERENCES `adoption_dogs`(`id`) ON DELETE RESTRICT,
  `lost_found_report_id` integer REFERENCES `lost_found_dog_reports`(`id`) ON DELETE RESTRICT,
  `help_case_id` integer REFERENCES `help_cases`(`id`) ON DELETE RESTRICT,
  `status` text NOT NULL CHECK (`status` IN ('PENDING','APPROVED','REJECTED','CANCELLED','REVOKED')),
  `request_message` text,
  `decision_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `reviewed_at` text,
  `reviewed_by` text,
  `cancelled_at` text,
  `revoked_at` text,
  `revoked_by` text,
  CHECK (
    (`entity_type`='ADOPTION_DOG' AND `adoption_dog_id` IS NOT NULL AND `lost_found_report_id` IS NULL AND `help_case_id` IS NULL) OR
    (`entity_type`='LOST_FOUND_DOG' AND `adoption_dog_id` IS NULL AND `lost_found_report_id` IS NOT NULL AND `help_case_id` IS NULL) OR
    (`entity_type`='HELP_CASE' AND `adoption_dog_id` IS NULL AND `lost_found_report_id` IS NULL AND `help_case_id` IS NOT NULL)
  )
);
CREATE INDEX `partner_help_claims_account_history` ON `partner_help_claims` (`account_id`,`created_at` DESC);
CREATE INDEX `partner_help_claims_status_created` ON `partner_help_claims` (`status`,`created_at`);
CREATE UNIQUE INDEX `partner_help_claims_adoption_manager` ON `partner_help_claims` (`adoption_dog_id`) WHERE `status`='APPROVED';
CREATE UNIQUE INDEX `partner_help_claims_report_manager` ON `partner_help_claims` (`lost_found_report_id`) WHERE `status`='APPROVED';
CREATE UNIQUE INDEX `partner_help_claims_case_manager` ON `partner_help_claims` (`help_case_id`) WHERE `status`='APPROVED';
CREATE UNIQUE INDEX `partner_help_claims_adoption_pending` ON `partner_help_claims` (`account_id`,`adoption_dog_id`) WHERE `status`='PENDING';
CREATE UNIQUE INDEX `partner_help_claims_report_pending` ON `partner_help_claims` (`account_id`,`lost_found_report_id`) WHERE `status`='PENDING';
CREATE UNIQUE INDEX `partner_help_claims_case_pending` ON `partner_help_claims` (`account_id`,`help_case_id`) WHERE `status`='PENDING';
