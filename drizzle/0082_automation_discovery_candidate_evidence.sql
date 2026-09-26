CREATE TABLE `automation_source_candidate_evidence` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `candidate_id` integer NOT NULL REFERENCES `automation_source_candidates`(`id`) ON DELETE RESTRICT,
  `root_id` integer NOT NULL REFERENCES `automation_discovery_roots`(`id`) ON DELETE RESTRICT,
  `discovery_run_id` integer REFERENCES `automation_discovery_runs`(`id`) ON DELETE SET NULL,
  `discovery_type` text NOT NULL CHECK (`discovery_type` IN ('SITEMAP','RSS','STRUCTURED_DIRECTORY','SEARCH_PROVIDER')),
  `discovery_context` text,
  `discovery_context_key` text NOT NULL,
  `result_rank` integer,
  `title` text,
  `snippet` text,
  `external_id` text,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `automation_source_candidate_evidence_identity_unique`
  ON `automation_source_candidate_evidence` (`candidate_id`,`root_id`,`discovery_context_key`);
CREATE INDEX `automation_source_candidate_evidence_candidate_idx`
  ON `automation_source_candidate_evidence` (`candidate_id`);
CREATE INDEX `automation_source_candidate_evidence_root_idx`
  ON `automation_source_candidate_evidence` (`root_id`);
CREATE INDEX `automation_source_candidate_evidence_run_idx`
  ON `automation_source_candidate_evidence` (`discovery_run_id`);
CREATE INDEX `automation_source_candidate_evidence_last_seen_idx`
  ON `automation_source_candidate_evidence` (`last_seen_at`);
