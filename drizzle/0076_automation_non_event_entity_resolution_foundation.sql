-- G1 non-event entity-resolution foundation.
-- Additive only: no canonical writes, no source activation, no backfill.

ALTER TABLE `automation_entity_clusters`
  ADD COLUMN `semantic_kind` text DEFAULT 'UNKNOWN' NOT NULL
  CHECK (`semantic_kind` IN (
    'UNKNOWN','EVENT','FACILITY_OR_SERVICE_PROFILE','PERSON','LEGAL_ENTITY',
    'LEGAL_ORGANIZATION','PUBLIC_ORGANIZATION','FACILITY','BRANCH','RESCUE_GROUP'
  ));

CREATE INDEX `automation_entity_clusters_type_semantic_updated_idx`
  ON `automation_entity_clusters` (`entity_type`,`semantic_kind`,`updated_at`);

CREATE TABLE `automation_entity_candidate_keys` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `cluster_id` integer NOT NULL REFERENCES `automation_entity_clusters`(`id`) ON DELETE CASCADE,
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `semantic_kind` text NOT NULL CHECK (`semantic_kind` IN (
    'UNKNOWN','EVENT','FACILITY_OR_SERVICE_PROFILE','PERSON','LEGAL_ENTITY',
    'LEGAL_ORGANIZATION','PUBLIC_ORGANIZATION','FACILITY','BRANCH','RESCUE_GROUP'
  )),
  `key_type` text NOT NULL CHECK (`key_type` IN ('REGISTRY_ID','ICO','NAME','MUNICIPALITY','DOMAIN','PHONE','EMAIL')),
  `key_namespace` text DEFAULT '' NOT NULL,
  `normalized_value` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `automation_entity_candidate_keys_cluster_key_unique`
  ON `automation_entity_candidate_keys`
  (`cluster_id`,`key_type`,`key_namespace`,`normalized_value`);

CREATE INDEX `automation_entity_candidate_keys_lookup_idx`
  ON `automation_entity_candidate_keys`
  (`entity_type`,`semantic_kind`,`key_type`,`key_namespace`,`normalized_value`,`cluster_id`);
