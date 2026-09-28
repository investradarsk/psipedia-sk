-- AUTOMATION-UPDATE-REVIEW-1
-- Value-bound field decisions for DIRECT_ENTITY and FEED_SOURCE update suggestions.
-- Additive only; production application is intentionally outside this PR.

CREATE TABLE `automation_update_field_reviews` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `origin_type` text NOT NULL CHECK (`origin_type` IN ('DIRECT_ENTITY','FEED_SOURCE')),
  `suggestion_id` integer NOT NULL CHECK (`suggestion_id` > 0),
  `entity_type` text NOT NULL CHECK (`entity_type` IN ('EVENT','ORGANIZATION','HELP_ITEM','ADOPTION','FOSTER','LOST_FOUND','DIRECTORY')),
  `canonical_entity_id` integer NOT NULL CHECK (`canonical_entity_id` > 0),
  `field_key` text NOT NULL,
  `proposed_value_hash` text NOT NULL,
  `decision` text NOT NULL CHECK (`decision` IN ('ACCEPTED','REJECTED')),
  `resolution_reason` text,
  `reviewed_by` text,
  `reviewed_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `automation_update_field_reviews_value_unique`
  ON `automation_update_field_reviews` (`origin_type`,`suggestion_id`,`field_key`,`proposed_value_hash`);

CREATE INDEX `automation_update_field_reviews_canonical_idx`
  ON `automation_update_field_reviews` (`entity_type`,`canonical_entity_id`,`decision`);

CREATE INDEX `automation_update_field_reviews_suggestion_idx`
  ON `automation_update_field_reviews` (`origin_type`,`suggestion_id`);

CREATE INDEX `automation_update_suggestions_canonical_review_idx`
  ON `automation_update_suggestions` (`entity_type`,`canonical_entity_id`,`status`,`last_detected_at`);
