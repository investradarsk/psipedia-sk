CREATE TABLE `moderation_submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_type` text NOT NULL,
  `subject_id` text,
  `operation` text NOT NULL,
  `status` text DEFAULT 'SUBMITTED' NOT NULL,
  `submitter_type` text NOT NULL,
  `submitter_ref` text,
  `proposed_patch_json` text DEFAULT '{}' NOT NULL,
  `risk_flags_json` text DEFAULT '[]' NOT NULL,
  `duplicate_resource_type` text,
  `duplicate_subject_id` text,
  `reviewed_at` text,
  `reviewed_by` text,
  `rejection_reason_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_submissions_status_created_idx` ON `moderation_submissions` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `moderation_submissions_resource_subject_idx` ON `moderation_submissions` (`resource_type`,`subject_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `moderation_submissions_submitter_idx` ON `moderation_submissions` (`submitter_type`,`submitter_ref`,`created_at`);
--> statement-breakpoint
CREATE TABLE `moderation_events` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text,
  `resource_type` text NOT NULL,
  `subject_id` text,
  `action` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_ref` text,
  `from_status` text,
  `to_status` text,
  `reason_code` text,
  `changed_fields_json` text DEFAULT '[]' NOT NULL,
  `request_id` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_events_subject_created_idx` ON `moderation_events` (`resource_type`,`subject_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `moderation_events_submission_created_idx` ON `moderation_events` (`submission_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `media_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_type` text NOT NULL,
  `owner_id` text NOT NULL,
  `state` text DEFAULT 'QUARANTINE' NOT NULL,
  `private_key` text NOT NULL,
  `safe_key` text,
  `public_key` text,
  `original_mime` text NOT NULL,
  `safe_mime` text,
  `size_bytes` integer NOT NULL,
  `safe_size_bytes` integer,
  `width` integer,
  `height` integer,
  `sha256` text NOT NULL,
  `created_at` text NOT NULL,
  `reviewed_at` text,
  `published_at` text,
  `deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_private_key_unique` ON `media_assets` (`private_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_safe_key_unique` ON `media_assets` (`safe_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_public_key_unique` ON `media_assets` (`public_key`);
--> statement-breakpoint
CREATE INDEX `media_assets_owner_state_idx` ON `media_assets` (`owner_type`,`owner_id`,`state`);
--> statement-breakpoint
CREATE INDEX `media_assets_state_created_idx` ON `media_assets` (`state`,`created_at`);
--> statement-breakpoint
CREATE TABLE `resource_access_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `purpose` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `revoked_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_access_tokens_hash_unique` ON `resource_access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `resource_access_tokens_subject_purpose_idx` ON `resource_access_tokens` (`resource_type`,`subject_id`,`purpose`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `resource_management_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `resource_type` text NOT NULL,
  `subject_id` text NOT NULL,
  `session_hash` text NOT NULL,
  `permissions_json` text DEFAULT '[]' NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_management_sessions_hash_unique` ON `resource_management_sessions` (`session_hash`);
--> statement-breakpoint
CREATE INDEX `resource_management_sessions_subject_idx` ON `resource_management_sessions` (`resource_type`,`subject_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `security_rate_limits` (
  `bucket_key` text PRIMARY KEY NOT NULL,
  `window_started_at` text NOT NULL,
  `count` integer NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `turnstile_token_uses` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `action` text NOT NULL,
  `hostname` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text NOT NULL
);
