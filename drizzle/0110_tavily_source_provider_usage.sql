-- TAVILY-SOURCE-SCOPED-1
-- Additive provider usage accounting for bounded source-scoped Crawl/Extract requests.

CREATE TABLE `automation_source_provider_usage` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `operation_key` text NOT NULL,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `run_id` integer REFERENCES `automation_runs`(`id`) ON DELETE SET NULL,
  `provider_key` text NOT NULL,
  `operation` text NOT NULL CHECK (`operation` IN ('CRAWL','EXTRACT')),
  `day_bucket` text NOT NULL,
  `request_count` integer DEFAULT 1 NOT NULL CHECK (`request_count` >= 0 AND `request_count` <= 1),
  `result_count` integer DEFAULT 0 NOT NULL CHECK (`result_count` >= 0),
  `accepted_count` integer DEFAULT 0 NOT NULL CHECK (`accepted_count` >= 0),
  `scope_rejected_count` integer DEFAULT 0 NOT NULL CHECK (`scope_rejected_count` >= 0),
  `status` text DEFAULT 'RESERVED' NOT NULL CHECK (`status` IN (
    'RESERVED','SUCCESS','EMPTY','RATE_LIMITED','AUTH_FAILED','CONFIG_MISSING',
    'TIMEOUT','PROVIDER_ERROR','INVALID_RESPONSE','SCOPE_VIOLATION','BUDGET_EXHAUSTED'
  )),
  `created_at` text NOT NULL,
  `finalized_at` text
);

CREATE UNIQUE INDEX `automation_source_provider_usage_operation_unique`
  ON `automation_source_provider_usage` (`operation_key`);

CREATE INDEX `automation_source_provider_usage_source_day_idx`
  ON `automation_source_provider_usage` (`source_id`,`day_bucket`,`created_at`);

CREATE INDEX `automation_source_provider_usage_run_idx`
  ON `automation_source_provider_usage` (`run_id`,`created_at`);

CREATE INDEX `automation_source_provider_usage_operation_day_idx`
  ON `automation_source_provider_usage` (`operation`,`day_bucket`,`created_at`);

CREATE INDEX `automation_source_provider_usage_provider_status_idx`
  ON `automation_source_provider_usage` (`provider_key`,`status`,`created_at`);
