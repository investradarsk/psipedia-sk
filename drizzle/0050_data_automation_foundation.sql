CREATE TABLE `automation_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_key` text NOT NULL,
  `label` text NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `connector_type` text NOT NULL CHECK (`connector_type` IN ('STRUCTURED_JSON','CONTROLLED_HTML','MANUAL_IMPORT')),
  `source_url` text,
  `config_json` text DEFAULT '{}' NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL CHECK (`enabled` IN (0,1)),
  `cadence_minutes` integer DEFAULT 1440 NOT NULL CHECK (`cadence_minutes` BETWEEN 60 AND 43200),
  `throttle_ms` integer DEFAULT 1000 NOT NULL CHECK (`throttle_ms` BETWEEN 0 AND 60000),
  `timeout_ms` integer DEFAULT 8000 NOT NULL CHECK (`timeout_ms` BETWEEN 1000 AND 30000),
  `retry_max_attempts` integer DEFAULT 2 NOT NULL CHECK (`retry_max_attempts` BETWEEN 0 AND 4),
  `retry_backoff_ms` integer DEFAULT 1000 NOT NULL CHECK (`retry_backoff_ms` BETWEEN 100 AND 30000),
  `max_records_per_run` integer DEFAULT 100 NOT NULL CHECK (`max_records_per_run` BETWEEN 1 AND 500),
  `next_check_at` text,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error_at` text,
  `last_error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_sources_source_key_unique` ON `automation_sources` (`source_key`);
CREATE INDEX `automation_sources_due_idx` ON `automation_sources` (`enabled`,`next_check_at`,`entity_type`);

CREATE TABLE `automation_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'RUNNING' NOT NULL CHECK (`status` IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  `started_at` text NOT NULL,
  `completed_at` text,
  `checked_count` integer DEFAULT 0 NOT NULL,
  `new_finding_count` integer DEFAULT 0 NOT NULL,
  `updated_finding_count` integer DEFAULT 0 NOT NULL,
  `error_count` integer DEFAULT 0 NOT NULL,
  `duration_ms` integer,
  `error_summary` text,
  `created_at` text NOT NULL
);
CREATE INDEX `automation_runs_source_started_idx` ON `automation_runs` (`source_id`,`started_at`);
CREATE INDEX `automation_runs_status_started_idx` ON `automation_runs` (`status`,`started_at`);

CREATE TABLE `automation_observations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE SET NULL,
  `source_record_id` text NOT NULL,
  `source_url` text,
  `source_timestamp` text,
  `payload_hash` text NOT NULL,
  `raw_payload_json` text NOT NULL,
  `normalized_payload_json` text NOT NULL,
  `detected_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_observations_identity_unique`
  ON `automation_observations` (`source_id`,`source_record_id`,`payload_hash`);
CREATE INDEX `automation_observations_source_detected_idx`
  ON `automation_observations` (`source_id`,`detected_at`);

CREATE TABLE `automation_findings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `observation_id` integer REFERENCES `automation_observations`(`id`) ON DELETE SET NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `finding_type` text NOT NULL CHECK (`finding_type` IN ('NEW_ENTITY','POSSIBLE_UPDATE','POSSIBLE_INACTIVE','POSSIBLE_CANCELLED','DUPLICATE_CANDIDATE','SOURCE_ERROR')),
  `canonical_entity_id` integer,
  `canonical_entity_key` text,
  `match_quality` text NOT NULL CHECK (`match_quality` IN ('EXACT_SOURCE_ID','EXACT_CANONICAL_KEY','STRONG_IDENTITY','UNCERTAIN','NONE')),
  `source_url` text,
  `source_timestamp` text,
  `reason` text NOT NULL,
  `before_json` text NOT NULL DEFAULT '{}',
  `proposed_json` text NOT NULL DEFAULT '{}',
  `diff_json` text NOT NULL DEFAULT '{}',
  `payload_hash` text NOT NULL,
  `fingerprint` text NOT NULL,
  `priority` text DEFAULT 'MEDIUM' NOT NULL CHECK (`priority` IN ('HIGH','MEDIUM','LOW')),
  `review_status` text DEFAULT 'NEW' NOT NULL CHECK (`review_status` IN ('NEW','IN_REVIEW','APPROVED','REJECTED','IGNORED','SUPPRESSED','RESOLVED')),
  `reviewer_decision` text,
  `reviewer_notes` text,
  `reviewed_by` text,
  `reviewed_at` text,
  `suppressed_until` text,
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_findings_fingerprint_unique` ON `automation_findings` (`fingerprint`);
CREATE INDEX `automation_findings_review_priority_idx`
  ON `automation_findings` (`review_status`,`priority`,`first_detected_at`);
CREATE INDEX `automation_findings_source_seen_idx`
  ON `automation_findings` (`source_id`,`last_detected_at`);
CREATE INDEX `automation_findings_canonical_idx`
  ON `automation_findings` (`entity_type`,`canonical_entity_id`,`review_status`);

ALTER TABLE `editorial_notifications` RENAME TO `editorial_notifications_legacy`;

CREATE TABLE `editorial_notifications` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `resource_type` text NOT NULL CHECK (`resource_type` IN ('directory_profile_change_request','news_tip','article_feedback','automation_finding')),
  `resource_id` integer NOT NULL,
  `notification_type` text NOT NULL CHECK (`notification_type` IN ('new')),
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','sent','failed')),
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_attempt_at` text,
  `sent_at` text,
  `last_error` text,
  `provider_message_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

INSERT INTO `editorial_notifications` (
  id, resource_type, resource_id, notification_type, status, attempts,
  last_attempt_at, sent_at, last_error, provider_message_id, created_at, updated_at
)
SELECT
  id, resource_type, resource_id, notification_type, status, attempts,
  last_attempt_at, sent_at, last_error, provider_message_id, created_at, updated_at
FROM `editorial_notifications_legacy`;

DROP TABLE `editorial_notifications_legacy`;

CREATE UNIQUE INDEX `editorial_notifications_resource_type_unique`
  ON `editorial_notifications` (`resource_type`,`resource_id`,`notification_type`);
CREATE INDEX `editorial_notifications_status_updated_idx`
  ON `editorial_notifications` (`status`,`updated_at`);
