-- CANONICAL-DRAFT-DELETE-1
-- Exact external-record suppression retained after an admin permanently deletes
-- a canonical DRAFT. This is intentionally not a canonical ownership link.

CREATE TABLE `automation_record_suppressions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL
    CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `external_source_url` text DEFAULT '' NOT NULL,
  `external_record_id` text NOT NULL,
  `suppression_reason` text NOT NULL
    CHECK (`suppression_reason` IN ('ADMIN_DRAFT_DELETE')),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX `automation_record_suppressions_identity_unique`
  ON `automation_record_suppressions` (`entity_type`,`external_source_url`,`external_record_id`);

CREATE INDEX `automation_record_suppressions_created_idx`
  ON `automation_record_suppressions` (`created_at`,`id`);
