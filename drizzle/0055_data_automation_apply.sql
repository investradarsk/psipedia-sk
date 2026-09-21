CREATE TABLE `automation_applications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `finding_id` integer NOT NULL REFERENCES `automation_findings`(`id`) ON DELETE RESTRICT,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer NOT NULL,
  `application_type` text NOT NULL CHECK (`application_type` IN ('CREATE_DRAFT','UPDATE_EXISTING')),
  `applied_fields_json` text DEFAULT '[]' NOT NULL,
  `before_json` text DEFAULT '{}' NOT NULL,
  `after_json` text DEFAULT '{}' NOT NULL,
  `applied_by` text NOT NULL,
  `applied_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_applications_finding_unique` ON `automation_applications` (`finding_id`);
CREATE INDEX `automation_applications_entity_idx` ON `automation_applications` (`entity_type`,`canonical_entity_id`,`applied_at`);
