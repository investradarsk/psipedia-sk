CREATE TABLE `directory_profile_change_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`profile_name` text NOT NULL,
	`profile_slug` text NOT NULL,
	`profile_category` text NOT NULL,
	`requester_name` text NOT NULL,
	`requester_email` text NOT NULL,
	`requester_phone` text DEFAULT '' NOT NULL,
	`requester_role` text DEFAULT '' NOT NULL,
	`proposed_data_json` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`authorized` integer DEFAULT 1 NOT NULL,
	`consent` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text
);
--> statement-breakpoint
CREATE INDEX `directory_profile_change_requests_status_created_idx` ON `directory_profile_change_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `directory_profile_change_requests_profile_created_idx` ON `directory_profile_change_requests` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `directory_profile_change_requests_email_created_idx` ON `directory_profile_change_requests` (`requester_email`,`created_at`);