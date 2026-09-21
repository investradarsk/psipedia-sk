DROP INDEX IF EXISTS `automation_source_candidates_canonical_url_unique`;
CREATE UNIQUE INDEX `automation_source_candidates_url_entity_unique`
  ON `automation_source_candidates` (`canonical_url`,`entity_type`);

CREATE TABLE `automation_discovery_roots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `root_key` text NOT NULL,
  `label` text NOT NULL,
  `discovery_type` text NOT NULL CHECK (`discovery_type` IN ('SITEMAP','RSS','STRUCTURED_DIRECTORY','SEARCH_PROVIDER')),
  `source_url` text,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `suggested_connector_type` text NOT NULL CHECK (`suggested_connector_type` IN ('STRUCTURED_JSON','CONTROLLED_HTML','MANUAL_IMPORT')),
  `config_json` text DEFAULT '{}' NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL CHECK (`enabled` IN (0,1)),
  `review_status` text DEFAULT 'PENDING' NOT NULL CHECK (`review_status` IN ('PENDING','APPROVED','REJECTED')),
  `cadence_minutes` integer DEFAULT 10080 NOT NULL CHECK (`cadence_minutes` BETWEEN 60 AND 43200),
  `next_check_at` text,
  `last_checked_at` text,
  `last_success_at` text,
  `last_error_at` text,
  `last_error_code` text,
  `reviewed_at` text,
  `reviewed_by` text,
  `review_notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_discovery_roots_key_unique` ON `automation_discovery_roots` (`root_key`);
CREATE INDEX `automation_discovery_roots_due_idx` ON `automation_discovery_roots` (`enabled`,`review_status`,`next_check_at`);

CREATE TABLE `automation_discovery_runs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `root_id` integer NOT NULL REFERENCES `automation_discovery_roots`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL CHECK (`status` IN ('SUCCESS','PARTIAL','FAILED')),
  `started_at` text NOT NULL,
  `completed_at` text,
  `candidate_count` integer DEFAULT 0 NOT NULL,
  `reviewable_candidate_count` integer DEFAULT 0 NOT NULL,
  `duplicate_candidate_count` integer DEFAULT 0 NOT NULL,
  `error_count` integer DEFAULT 0 NOT NULL,
  `duration_ms` integer,
  `error_summary` text
);
CREATE INDEX `automation_discovery_runs_root_idx` ON `automation_discovery_runs` (`root_id`,`started_at`);

INSERT OR IGNORE INTO `automation_discovery_roots` (
  root_key,label,discovery_type,source_url,entity_type,suggested_connector_type,config_json,
  enabled,review_status,cadence_minutes,next_check_at,created_at,updated_at,reviewed_at,reviewed_by,review_notes
) VALUES (
  'skj-club-web-directory',
  'SKJ – klubové web stránky',
  'STRUCTURED_DIRECTORY',
  'https://skj.sk/sk/skj-sekretariat/klubove-web-stranky/',
  'DIRECTORY',
  'CONTROLLED_HTML',
  '{"adapter":"HTML_LINK_DIRECTORY","externalOnly":true,"excludeHosts":["skj.sk","fci.be"],"maxCandidates":150}',
  1,'APPROVED',10080,'2026-09-21T06:30:00.000Z',
  '2026-09-21T06:30:00.000Z','2026-09-21T06:30:00.000Z',
  '2026-09-21T06:30:00.000Z','AUTOMATION-4 source audit',
  'Oficiálny verejný zoznam klubových webov SKJ. Discovery iba vytvára source candidates; nič neaktivuje ani nepublikuje.'
);
