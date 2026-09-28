-- AUTOMATION-PRODUCT-MODEL-2
-- Canonical-owned external provenance, read-only update suggestions and bounded
-- direct-entity refresh state. No automation source owns a canonical entity.

CREATE TABLE `canonical_external_provenance` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer NOT NULL CHECK (`canonical_entity_id` > 0),
  `external_source_url` text DEFAULT '' NOT NULL,
  `external_record_id` text NOT NULL,
  `provenance_type` text NOT NULL CHECK (`provenance_type` IN ('AUTOMATION_SOURCE_RECORD','DIRECT_ENTITY_DISCOVERY','DIRECT_ENTITY_REFRESH')),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `canonical_external_provenance_identity_unique`
  ON `canonical_external_provenance` (`entity_type`,`external_source_url`,`external_record_id`);
CREATE INDEX `canonical_external_provenance_canonical_idx`
  ON `canonical_external_provenance` (`entity_type`,`canonical_entity_id`);

CREATE TABLE `automation_update_suggestions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer NOT NULL CHECK (`canonical_entity_id` > 0),
  `category_slug` text NOT NULL CHECK (`category_slug` IN ('veterinari','psie-sluzby','utulky-organizacie')),
  `external_source_url` text DEFAULT '' NOT NULL,
  `external_record_id` text NOT NULL,
  `suggestion_type` text DEFAULT 'POSSIBLE_UPDATE' NOT NULL
    CHECK (`suggestion_type` IN ('POSSIBLE_UPDATE','POSSIBLE_INACTIVE','POSSIBLE_CANCELLED')),
  `before_json` text DEFAULT '{}' NOT NULL,
  `proposed_json` text DEFAULT '{}' NOT NULL,
  `diff_json` text DEFAULT '{}' NOT NULL,
  `fingerprint` text NOT NULL,
  `status` text DEFAULT 'OPEN' NOT NULL CHECK (`status` IN ('OPEN','DISMISSED','RESOLVED')),
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_update_suggestions_fingerprint_unique`
  ON `automation_update_suggestions` (`fingerprint`);
CREATE INDEX `automation_update_suggestions_category_idx`
  ON `automation_update_suggestions` (`category_slug`,`status`,`last_detected_at`);

CREATE TABLE `automation_direct_refresh_settings` (
  `category_slug` text PRIMARY KEY NOT NULL
    CHECK (`category_slug` IN ('veterinari','psie-sluzby','utulky-organizacie')),
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('DIRECTORY','ORGANIZATION')),
  `enabled` integer DEFAULT 0 NOT NULL CHECK (`enabled` IN (0,1)),
  `cadence_minutes` integer NOT NULL CHECK (`cadence_minutes` BETWEEN 60 AND 43200),
  `cursor_entity_id` integer DEFAULT 0 NOT NULL CHECK (`cursor_entity_id` >= 0),
  `next_check_at` text,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error_at` text,
  `last_error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

INSERT OR IGNORE INTO `automation_direct_refresh_settings`
  (`category_slug`,`entity_type`,`enabled`,`cadence_minutes`,`cursor_entity_id`,`next_check_at`,`created_at`,`updated_at`)
VALUES
  ('veterinari','DIRECTORY',0,20160,0,NULL,'2026-09-28T13:30:00.000Z','2026-09-28T13:30:00.000Z'),
  ('psie-sluzby','DIRECTORY',0,20160,0,NULL,'2026-09-28T13:30:00.000Z','2026-09-28T13:30:00.000Z'),
  ('utulky-organizacie','ORGANIZATION',0,43200,0,NULL,'2026-09-28T13:30:00.000Z','2026-09-28T13:30:00.000Z');
