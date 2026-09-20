ALTER TABLE `automation_sources` ADD COLUMN `review_status` text DEFAULT 'PENDING' NOT NULL CHECK (`review_status` IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE `automation_sources` ADD COLUMN `reviewed_at` text;
ALTER TABLE `automation_sources` ADD COLUMN `reviewed_by` text;
ALTER TABLE `automation_sources` ADD COLUMN `review_notes` text;

CREATE TABLE `automation_source_candidates` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `discovery_type` text NOT NULL CHECK (`discovery_type` IN ('SITEMAP','RSS','STRUCTURED_DIRECTORY','SEARCH_PROVIDER')),
  `source_url` text NOT NULL,
  `canonical_url` text NOT NULL,
  `label` text NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `suggested_connector_type` text NOT NULL CHECK (`suggested_connector_type` IN ('STRUCTURED_JSON','CONTROLLED_HTML','MANUAL_IMPORT')),
  `discovered_from_source_id` integer REFERENCES `automation_sources`(`id`) ON DELETE SET NULL,
  `reason` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `duplicate_source_id` integer REFERENCES `automation_sources`(`id`) ON DELETE SET NULL,
  `review_status` text DEFAULT 'NEW' NOT NULL CHECK (`review_status` IN ('NEW','APPROVED','REJECTED','SUPPRESSED')),
  `reviewer_notes` text,
  `reviewed_by` text,
  `reviewed_at` text,
  `suppressed_until` text,
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_source_candidates_canonical_url_unique` ON `automation_source_candidates` (`canonical_url`);
CREATE INDEX `automation_source_candidates_review_idx` ON `automation_source_candidates` (`review_status`,`last_detected_at`);

INSERT OR IGNORE INTO `automation_sources` (
  source_key,label,entity_type,connector_type,source_url,config_json,enabled,
  cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
  next_check_at,created_at,updated_at,review_status,reviewed_at,reviewed_by,review_notes
) VALUES (
  'skj-exhibition-calendar',
  'SKJ – výstavný kalendár',
  'EVENT',
  'CONTROLLED_HTML',
  'https://skj.sk/sk/vystavy/kalendar/',
  '{"htmlAdapterKey":"skj-exhibition-calendar"}',
  0,360,1500,8000,2,1000,100,NULL,
  '2026-09-20T18:15:00.000Z','2026-09-20T18:15:00.000Z',
  'PENDING',NULL,NULL,
  'Technicky overený verejný kalendár; ponechaný disabled, kým nie sú explicitne potvrdené podmienky opakovaného automatizovaného spracovania.'
);

INSERT OR IGNORE INTO `automation_sources` (
  source_key,label,entity_type,connector_type,source_url,config_json,enabled,
  cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,
  next_check_at,created_at,updated_at,review_status,reviewed_at,reviewed_by,review_notes
) VALUES (
  'svps-shelters-register',
  'ŠVPS SR – útulky a karanténne stanice',
  'ORGANIZATION',
  'CONTROLLED_HTML',
  'https://zoznamy.svps.sk/?Cinnost=0&Podsekcia=0&Sekcia=46&Zoznamy=ostatne&cmd=resetall&typ=zoznam-vet-schvalene',
  '{"htmlAdapterKey":"svps-shelters-register"}',
  1,10080,2000,10000,2,1500,200,NULL,
  '2026-09-20T18:15:00.000Z','2026-09-20T18:15:00.000Z',
  'APPROVED','2026-09-20T18:15:00.000Z','AUTOMATION-2 source audit',
  'Verejný oficiálny register ŠVPS SR; weekly read-only monitoring organizácií/zariadení.'
);
