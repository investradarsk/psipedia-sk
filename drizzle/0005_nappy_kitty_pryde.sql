CREATE TABLE IF NOT EXISTS `help_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`excerpt` text NOT NULL,
	`description` text NOT NULL,
	`organization` text NOT NULL,
	`dog_name` text DEFAULT '' NOT NULL,
	`breed` text DEFAULT '' NOT NULL,
	`age_note` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`location_note` text DEFAULT '' NOT NULL,
	`reported_date` text,
	`deadline_date` text,
	`action_label` text NOT NULL,
	`action_url` text,
	`contact_note` text DEFAULT '' NOT NULL,
	`goal_amount` integer,
	`raised_amount` integer,
	`image_url` text,
	`image_key` text,
	`verified` integer DEFAULT 0 NOT NULL,
	`urgent` integer DEFAULT 0 NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `help_cases_category_slug_unique` ON `help_cases` (`category`,`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `help_cases_public_idx` ON `help_cases` (`status`,`category`,`resolved`,`urgent`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `help_cases_region_idx` ON `help_cases` (`region`,`category`,`status`);
