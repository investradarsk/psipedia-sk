CREATE TABLE IF NOT EXISTS `news_tips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`source_url` text,
	`location` text DEFAULT '' NOT NULL,
	`event_date` text,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text,
	`status` text DEFAULT 'new' NOT NULL,
	`internal_note` text DEFAULT '' NOT NULL,
	`consent` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `news_tips_status_created_idx` ON `news_tips` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `news_tips_contact_created_idx` ON `news_tips` (`contact_email`,`created_at`);
