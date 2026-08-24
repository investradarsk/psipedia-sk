CREATE TABLE `article_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_path` text NOT NULL,
	`article_title` text NOT NULL,
	`helpful` integer NOT NULL,
	`missing_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `article_feedback_path_created_idx` ON `article_feedback` (`article_path`,`created_at`);--> statement-breakpoint
CREATE INDEX `article_feedback_helpful_created_idx` ON `article_feedback` (`helpful`,`created_at`);