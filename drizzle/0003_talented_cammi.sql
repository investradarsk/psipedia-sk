CREATE TABLE IF NOT EXISTS `directory_inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer,
	`profile_name` text NOT NULL,
	`profile_slug` text NOT NULL,
	`profile_category` text NOT NULL,
	`recipient_email` text,
	`sender_name` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_phone` text DEFAULT '' NOT NULL,
	`dog_info` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`consent` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `directory_inquiries_status_created_idx` ON `directory_inquiries` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `directory_inquiries_profile_idx` ON `directory_inquiries` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `directory_inquiries_email_idx` ON `directory_inquiries` (`sender_email`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `directory_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`excerpt` text NOT NULL,
	`description` text NOT NULL,
	`services_json` text DEFAULT '[]' NOT NULL,
	`qualifications_json` text DEFAULT '[]' NOT NULL,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`online` integer DEFAULT 0 NOT NULL,
	`price_note` text DEFAULT '' NOT NULL,
	`website_url` text,
	`internal_email` text,
	`image_url` text,
	`image_key` text,
	`verified` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `directory_profiles_category_slug_unique` ON `directory_profiles` (`category`,`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `directory_profiles_public_idx` ON `directory_profiles` (`status`,`category`,`region`,`featured`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `directory_profiles_updated_idx` ON `directory_profiles` (`updated_at`);
