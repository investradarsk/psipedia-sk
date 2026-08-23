CREATE TABLE `managed_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`start_date` text NOT NULL,
	`start_time` text DEFAULT '' NOT NULL,
	`end_date` text,
	`end_time` text,
	`venue` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`region` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`organizer` text NOT NULL,
	`description` text NOT NULL,
	`practical_info` text DEFAULT '' NOT NULL,
	`website_url` text,
	`registration_url` text,
	`image_url` text,
	`image_key` text,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_events_slug_unique` ON `managed_events` (`slug`);--> statement-breakpoint
CREATE INDEX `managed_events_public_date_idx` ON `managed_events` (`status`,`start_date`,`start_time`);--> statement-breakpoint
CREATE INDEX `managed_events_type_region_idx` ON `managed_events` (`event_type`,`region`,`start_date`);