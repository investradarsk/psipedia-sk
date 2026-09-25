-- AUTOMATION multi-source entity resolution foundation.
-- Append-only: existing automation tables remain untouched.

CREATE TABLE `automation_source_authority` (
  `source_id` integer PRIMARY KEY NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `source_role` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`source_role` IN (
    'UNKNOWN','OFFICIAL_ORGANIZER','OFFICIAL_REGISTRY','OFFICIAL_CLUB_CALENDAR',
    'SECONDARY_DIRECTORY','SEARCH_DISCOVERY','SOCIAL_LISTING','AGGREGATOR'
  )),
  `authority_score` integer DEFAULT 50 NOT NULL CHECK (`authority_score` BETWEEN 0 AND 100),
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `automation_entity_clusters` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer,
  `canonical_entity_key` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `automation_entity_clusters_type_updated_idx`
  ON `automation_entity_clusters` (`entity_type`,`updated_at`);
CREATE UNIQUE INDEX `automation_entity_clusters_canonical_unique`
  ON `automation_entity_clusters` (`entity_type`,`canonical_entity_id`)
  WHERE `canonical_entity_id` IS NOT NULL;

CREATE TABLE `automation_cluster_observations` (
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `observation_id` integer NOT NULL REFERENCES `automation_observations`(`id`) ON DELETE CASCADE,
  `match_quality` text NOT NULL CHECK (`match_quality` IN ('EXACT','STRONG','POSSIBLE','NONE')),
  `match_reason` text NOT NULL,
  `linked_at` text NOT NULL,
  PRIMARY KEY (`cluster_id`,`observation_id`)
);
CREATE UNIQUE INDEX `automation_cluster_observation_unique`
  ON `automation_cluster_observations` (`observation_id`);

CREATE TABLE `automation_cluster_match_candidates` (
  `observation_id` integer NOT NULL REFERENCES `automation_observations`(`id`) ON DELETE CASCADE,
  `candidate_cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `match_quality` text NOT NULL CHECK (`match_quality` IN ('EXACT','STRONG','POSSIBLE')),
  `match_reason` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`observation_id`,`candidate_cluster_id`)
);
CREATE INDEX `automation_cluster_match_candidates_cluster_idx`
  ON `automation_cluster_match_candidates` (`candidate_cluster_id`,`created_at`);

CREATE TABLE `automation_cluster_source_records` (
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `source_record_id` text NOT NULL,
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  PRIMARY KEY (`source_id`,`entity_type`,`source_record_id`)
);
CREATE INDEX `automation_cluster_source_records_cluster_idx`
  ON `automation_cluster_source_records` (`cluster_id`,`last_seen_at`);

CREATE TABLE `automation_field_evidence` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `observation_id` integer NOT NULL REFERENCES `automation_observations`(`id`) ON DELETE CASCADE,
  `source_id` integer NOT NULL REFERENCES `automation_sources`(`id`) ON DELETE CASCADE,
  `source_record_id` text NOT NULL,
  `field_name` text NOT NULL,
  `raw_value_json` text NOT NULL,
  `normalized_value` text NOT NULL,
  `value_hash` text NOT NULL,
  `source_role` text DEFAULT 'UNKNOWN' NOT NULL,
  `authority_score` integer DEFAULT 50 NOT NULL CHECK (`authority_score` BETWEEN 0 AND 100),
  `confidence` integer DEFAULT 75 NOT NULL CHECK (`confidence` BETWEEN 0 AND 100),
  `is_current` integer DEFAULT 1 NOT NULL CHECK (`is_current` IN (0,1)),
  `is_preferred` integer DEFAULT 0 NOT NULL CHECK (`is_preferred` IN (0,1)),
  `first_seen_at` text NOT NULL,
  `last_seen_at` text NOT NULL
);
CREATE UNIQUE INDEX `automation_field_evidence_observation_field_unique`
  ON `automation_field_evidence` (`cluster_id`,`observation_id`,`field_name`);
CREATE INDEX `automation_field_evidence_current_idx`
  ON `automation_field_evidence` (`cluster_id`,`field_name`,`is_current`,`is_preferred`);
CREATE INDEX `automation_field_evidence_source_record_idx`
  ON `automation_field_evidence` (`source_id`,`source_record_id`,`field_name`,`is_current`);

CREATE TABLE `automation_field_conflicts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `field_name` text NOT NULL,
  `impact` text DEFAULT 'NORMAL' NOT NULL CHECK (`impact` IN ('NORMAL','HIGH')),
  `status` text DEFAULT 'OPEN' NOT NULL CHECK (`status` IN ('OPEN','RESOLVED')),
  `selected_evidence_id` integer REFERENCES `automation_field_evidence`(`id`) ON DELETE SET NULL,
  `values_fingerprint` text NOT NULL,
  `detected_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `resolved_at` text
);
CREATE UNIQUE INDEX `automation_field_conflicts_open_unique`
  ON `automation_field_conflicts` (`cluster_id`,`field_name`)
  WHERE `status` = 'OPEN';
CREATE INDEX `automation_field_conflicts_status_idx`
  ON `automation_field_conflicts` (`status`,`impact`,`updated_at`);

CREATE TABLE `automation_cluster_findings` (
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `finding_id` integer NOT NULL REFERENCES `automation_findings`(`id`) ON DELETE CASCADE,
  `linked_at` text NOT NULL,
  PRIMARY KEY (`cluster_id`,`finding_id`)
);
CREATE UNIQUE INDEX `automation_cluster_findings_finding_unique`
  ON `automation_cluster_findings` (`finding_id`);

-- Hard apply-time guard: at most one NEW_ENTITY draft creation may claim a cluster.
CREATE TABLE `automation_cluster_canonical_claims` (
  `cluster_id` integer PRIMARY KEY NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `finding_id` integer NOT NULL UNIQUE REFERENCES `automation_findings`(`id`) ON DELETE CASCADE,
  `canonical_entity_id` integer,
  `claimed_at` text NOT NULL
);
