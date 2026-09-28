CREATE TABLE `automation_ingestion_receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `source_record_id` text NOT NULL,
  `source_url` text,
  `payload_hash` text,
  `result` text NOT NULL CHECK (`result` IN ('DRAFT_CREATED','SKIPPED_DUPLICATE')),
  `first_processed_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_ingestion_receipts_identity_unique`
  ON `automation_ingestion_receipts` (`source_id`,`entity_type`,`source_record_id`);
CREATE INDEX `automation_ingestion_receipts_source_idx`
  ON `automation_ingestion_receipts` (`source_id`,`first_processed_at`);

CREATE TABLE `canonical_draft_flags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer NOT NULL,
  `flag_type` text NOT NULL CHECK (`flag_type` IN ('POSSIBLE_DUPLICATE')),
  `details_json` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `canonical_draft_flags_entity_unique`
  ON `canonical_draft_flags` (`entity_type`,`canonical_entity_id`,`flag_type`);
