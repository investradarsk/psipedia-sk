CREATE TABLE IF NOT EXISTS `managed_articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`category` text NOT NULL,
	`portal_section` text DEFAULT 'clanky' NOT NULL,
	`news_category` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`accent` text DEFAULT 'forest' NOT NULL,
	`author` text DEFAULT 'Redakcia Psipedia' NOT NULL,
	`intro` text NOT NULL,
	`takeaway` text NOT NULL,
	`sections_json` text DEFAULT '[]' NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`image_url` text,
	`image_key` text,
	`reading_minutes` integer DEFAULT 5 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `managed_articles_slug_unique` ON `managed_articles` (`slug`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `managed_articles_status_published_idx` ON `managed_articles` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `managed_articles_portal_status_idx` ON `managed_articles` (`portal_section`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `managed_articles_news_category_idx` ON `managed_articles` (`news_category`,`status`,`published_at`);
