CREATE TABLE `automation_search_usage` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `operation_key` text NOT NULL,
  `discovery_run_id` integer REFERENCES `automation_discovery_runs`(`id`) ON DELETE SET NULL,
  `provider_key` text NOT NULL,
  `root_id` integer NOT NULL REFERENCES `automation_discovery_roots`(`id`) ON DELETE RESTRICT,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `query_fingerprint` text NOT NULL,
  `day_bucket` text NOT NULL,
  `request_count` integer DEFAULT 1 NOT NULL CHECK (`request_count` >= 0 AND `request_count` <= 2),
  `result_count` integer DEFAULT 0 NOT NULL CHECK (`result_count` >= 0),
  `new_unique_candidate_count` integer DEFAULT 0 NOT NULL CHECK (`new_unique_candidate_count` >= 0),
  `duplicate_candidate_count` integer DEFAULT 0 NOT NULL CHECK (`duplicate_candidate_count` >= 0),
  `status` text DEFAULT 'RESERVED' NOT NULL CHECK (`status` IN ('RESERVED','SUCCESS','EMPTY','RATE_LIMITED','AUTH_FAILED','CONFIG_MISSING','TIMEOUT','PROVIDER_ERROR','INVALID_RESPONSE')),
  `created_at` text NOT NULL,
  `finalized_at` text
);

CREATE UNIQUE INDEX `automation_search_usage_operation_unique`
  ON `automation_search_usage` (`operation_key`);
CREATE INDEX `automation_search_usage_day_idx`
  ON `automation_search_usage` (`day_bucket`,`created_at`);
CREATE INDEX `automation_search_usage_entity_day_idx`
  ON `automation_search_usage` (`entity_type`,`day_bucket`,`created_at`);
CREATE INDEX `automation_search_usage_root_day_idx`
  ON `automation_search_usage` (`root_id`,`day_bucket`,`created_at`);
CREATE INDEX `automation_search_usage_fingerprint_idx`
  ON `automation_search_usage` (`provider_key`,`query_fingerprint`,`created_at`);
