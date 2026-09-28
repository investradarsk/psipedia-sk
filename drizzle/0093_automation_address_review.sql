CREATE TABLE `automation_address_review_cases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL,
  `canonical_entity_id` integer NOT NULL,
  `category_slug` text NOT NULL,
  `external_source_url` text NOT NULL DEFAULT '',
  `external_record_id` text NOT NULL,
  `reason` text NOT NULL,
  `evidence_json` text NOT NULL DEFAULT '{}',
  `candidate_json` text NOT NULL DEFAULT '[]',
  `fingerprint` text NOT NULL,
  `status` text NOT NULL DEFAULT 'OPEN' CHECK (`status` IN ('OPEN','RESOLVED','DISMISSED','STALE')),
  `canonical_before_json` text NOT NULL DEFAULT '{}',
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL,
  `resolved_at` text,
  `resolved_by` text,
  `resolution` text,
  `selected_candidate_hash` text,
  `verified_provider` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_address_review_cases_fingerprint_unique`
ON `automation_address_review_cases` (`fingerprint`);
--> statement-breakpoint
CREATE INDEX `automation_address_review_cases_status_detected_idx`
ON `automation_address_review_cases` (`status`, `last_detected_at`);
--> statement-breakpoint
CREATE INDEX `automation_address_review_cases_category_status_idx`
ON `automation_address_review_cases` (`category_slug`, `status`);
--> statement-breakpoint
CREATE INDEX `automation_address_review_cases_entity_status_idx`
ON `automation_address_review_cases` (`entity_type`, `canonical_entity_id`, `status`);
