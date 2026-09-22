-- REVIEWS-1A — shared canonical resource anchors and profile review database foundation.
-- No public review submission or review UI is enabled by this migration.

ALTER TABLE `directory_profiles` ADD COLUMN `archived_at` text;
CREATE INDEX `directory_profiles_archive_idx` ON `directory_profiles` (`status`,`archived_at`,`updated_at`);

-- REVIEWABLE_RESOURCE_BACKFILL_BEGIN
INSERT OR IGNORE INTO `partner_resources`
  (`id`,`entity_type`,`directory_profile_id`,`created_at`,`updated_at`)
SELECT
  'directory-profile-' || d.id,
  'DIRECTORY_PROFILE',
  d.id,
  d.created_at,
  d.updated_at
FROM `directory_profiles` d
WHERE NOT EXISTS (
  SELECT 1 FROM `partner_resources` r WHERE r.directory_profile_id=d.id
);

INSERT OR IGNORE INTO `partner_resources`
  (`id`,`entity_type`,`help_organization_id`,`created_at`,`updated_at`)
SELECT
  'help-organization-' || o.id,
  'HELP_ORGANIZATION',
  o.id,
  o.created_at,
  o.updated_at
FROM `help_organizations` o
WHERE NOT EXISTS (
  SELECT 1 FROM `partner_resources` r WHERE r.help_organization_id=o.id
);
-- REVIEWABLE_RESOURCE_BACKFILL_END

CREATE TABLE `review_authors` (
  `id` text PRIMARY KEY NOT NULL,
  `email_ciphertext` text NOT NULL,
  `email_hash` text NOT NULL,
  `display_name` text,
  `status` text NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (`status` IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DEACTIVATED')),
  `email_verified_at` text,
  `deactivated_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `review_authors_email_hash_unique` ON `review_authors` (`email_hash`);
CREATE INDEX `review_authors_status_updated_idx` ON `review_authors` (`status`,`updated_at`);

CREATE TABLE `review_auth_notification_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `review_author_id` text NOT NULL REFERENCES `review_authors`(`id`) ON DELETE RESTRICT,
  `notification_type` text NOT NULL CHECK (`notification_type` IN ('AUTH_MAGIC_LINK')),
  `dedupe_key` text NOT NULL,
  `status` text NOT NULL DEFAULT 'PENDING'
    CHECK (`status` IN ('PENDING','SENDING','SENT','FAILED','EXPIRED')),
  `encrypted_secret` text,
  `expires_at` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `last_attempt_at` text,
  `provider_message_id` text,
  `last_error` text,
  `sent_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `review_auth_notification_dedupe_unique` ON `review_auth_notification_outbox` (`dedupe_key`);
CREATE INDEX `review_auth_notification_status_expiry_idx` ON `review_auth_notification_outbox` (`status`,`expires_at`,`updated_at`);
CREATE INDEX `review_auth_notification_author_created_idx` ON `review_auth_notification_outbox` (`review_author_id`,`created_at`);

CREATE TABLE `profile_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_id` text NOT NULL REFERENCES `partner_resources`(`id`) ON DELETE RESTRICT,
  `author_id` text NOT NULL REFERENCES `review_authors`(`id`) ON DELETE RESTRICT,
  `overall_rating` integer NOT NULL CHECK (`overall_rating` BETWEEN 1 AND 5),
  `body` text NOT NULL CHECK (length(`body`) BETWEEN 20 AND 5000),
  `service_month` text,
  `service_type_key` text,
  `rating_schema_version` integer NOT NULL DEFAULT 1 CHECK (`rating_schema_version` >= 1),
  `status` text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (`status` IN ('PENDING_REVIEW','VISIBLE','HIDDEN','REJECTED','AUTHOR_DELETED','REMOVED')),
  `risk_flags_json` text NOT NULL DEFAULT '[]',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text,
  `deleted_at` text
);
CREATE UNIQUE INDEX `profile_reviews_resource_author_unique` ON `profile_reviews` (`resource_id`,`author_id`);
CREATE INDEX `profile_reviews_resource_status_created_idx` ON `profile_reviews` (`resource_id`,`status`,`created_at`);
CREATE INDEX `profile_reviews_resource_status_rating_idx` ON `profile_reviews` (`resource_id`,`status`,`overall_rating`);
CREATE INDEX `profile_reviews_author_created_idx` ON `profile_reviews` (`author_id`,`created_at`);
CREATE INDEX `profile_reviews_status_created_idx` ON `profile_reviews` (`status`,`created_at`);

CREATE TRIGGER `profile_reviews_reviewable_resource_insert`
BEFORE INSERT ON `profile_reviews`
WHEN NOT EXISTS (
  SELECT 1 FROM `partner_resources` r
  WHERE r.id=NEW.resource_id
    AND r.entity_type IN ('DIRECTORY_PROFILE','HELP_ORGANIZATION')
)
BEGIN
  SELECT RAISE(ABORT, 'profile review resource is not reviewable');
END;

CREATE TRIGGER `profile_reviews_resource_immutable`
BEFORE UPDATE OF `resource_id` ON `profile_reviews`
WHEN NEW.resource_id <> OLD.resource_id
BEGIN
  SELECT RAISE(ABORT, 'profile review resource is immutable');
END;

CREATE TABLE `profile_review_rating_values` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `profile_reviews`(`id`) ON DELETE RESTRICT,
  `dimension_key` text NOT NULL,
  `value` integer NOT NULL CHECK (`value` BETWEEN 1 AND 5),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `profile_review_rating_values_review_dimension_unique`
  ON `profile_review_rating_values` (`review_id`,`dimension_key`);
CREATE INDEX `profile_review_rating_values_review_idx` ON `profile_review_rating_values` (`review_id`);
CREATE INDEX `profile_review_rating_values_dimension_idx` ON `profile_review_rating_values` (`dimension_key`,`review_id`);

CREATE TABLE `profile_review_provider_replies` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `profile_reviews`(`id`) ON DELETE RESTRICT,
  `partner_account_id` text NOT NULL REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `partner_membership_id` text NOT NULL REFERENCES `partner_memberships`(`id`) ON DELETE RESTRICT,
  `body` text NOT NULL CHECK (length(`body`) BETWEEN 1 AND 5000),
  `status` text NOT NULL DEFAULT 'VISIBLE' CHECK (`status` IN ('VISIBLE','HIDDEN','REMOVED')),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `removed_at` text
);
CREATE UNIQUE INDEX `profile_review_provider_replies_review_unique` ON `profile_review_provider_replies` (`review_id`);
CREATE INDEX `profile_review_provider_replies_account_created_idx`
  ON `profile_review_provider_replies` (`partner_account_id`,`created_at`);

CREATE TABLE `profile_review_helpful_votes` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `profile_reviews`(`id`) ON DELETE RESTRICT,
  `author_id` text NOT NULL REFERENCES `review_authors`(`id`) ON DELETE RESTRICT,
  `created_at` text NOT NULL
);
CREATE UNIQUE INDEX `profile_review_helpful_votes_review_author_unique`
  ON `profile_review_helpful_votes` (`review_id`,`author_id`);
CREATE INDEX `profile_review_helpful_votes_review_created_idx`
  ON `profile_review_helpful_votes` (`review_id`,`created_at`);
CREATE INDEX `profile_review_helpful_votes_author_created_idx`
  ON `profile_review_helpful_votes` (`author_id`,`created_at`);

CREATE TABLE `profile_review_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `profile_reviews`(`id`) ON DELETE RESTRICT,
  `provider_reply_id` text REFERENCES `profile_review_provider_replies`(`id`) ON DELETE RESTRICT,
  `target_type` text NOT NULL,
  `reporter_type` text NOT NULL,
  `review_author_id` text REFERENCES `review_authors`(`id`) ON DELETE RESTRICT,
  `partner_account_id` text REFERENCES `partner_accounts`(`id`) ON DELETE RESTRICT,
  `reason_code` text NOT NULL,
  `detail` text,
  `status` text NOT NULL DEFAULT 'OPEN' CHECK (`status` IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  `resolved_by` text,
  `resolved_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CHECK (
    (`target_type`='REVIEW' AND `provider_reply_id` IS NULL) OR
    (`target_type`='PROVIDER_REPLY' AND `provider_reply_id` IS NOT NULL)
  ),
  CHECK (
    (`reporter_type`='REVIEW_AUTHOR' AND `review_author_id` IS NOT NULL AND `partner_account_id` IS NULL) OR
    (`reporter_type`='PARTNER' AND `review_author_id` IS NULL AND `partner_account_id` IS NOT NULL)
  )
);
CREATE UNIQUE INDEX `profile_review_reports_review_author_unique`
  ON `profile_review_reports` (`review_id`,`review_author_id`)
  WHERE `target_type`='REVIEW' AND `reporter_type`='REVIEW_AUTHOR';
CREATE UNIQUE INDEX `profile_review_reports_review_partner_unique`
  ON `profile_review_reports` (`review_id`,`partner_account_id`)
  WHERE `target_type`='REVIEW' AND `reporter_type`='PARTNER';
CREATE UNIQUE INDEX `profile_review_reports_reply_author_unique`
  ON `profile_review_reports` (`provider_reply_id`,`review_author_id`)
  WHERE `target_type`='PROVIDER_REPLY' AND `reporter_type`='REVIEW_AUTHOR';
CREATE UNIQUE INDEX `profile_review_reports_reply_partner_unique`
  ON `profile_review_reports` (`provider_reply_id`,`partner_account_id`)
  WHERE `target_type`='PROVIDER_REPLY' AND `reporter_type`='PARTNER';
CREATE INDEX `profile_review_reports_status_created_idx` ON `profile_review_reports` (`status`,`created_at`);
CREATE INDEX `profile_review_reports_review_status_idx` ON `profile_review_reports` (`review_id`,`status`,`created_at`);

CREATE TRIGGER IF NOT EXISTS `moderation_events_no_update`
BEFORE UPDATE ON `moderation_events`
BEGIN
  SELECT RAISE(ABORT, 'moderation_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS `moderation_events_no_delete`
BEFORE DELETE ON `moderation_events`
BEGIN
  SELECT RAISE(ABORT, 'moderation_events is append-only');
END;
