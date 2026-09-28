ALTER TABLE `managed_articles` ADD `content_updated_at` text;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `show_updated_label` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `seo_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `meta_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `canonical_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `noindex` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `focus_keyword` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `og_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `og_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `og_image_url` text;--> statement-breakpoint
ALTER TABLE `managed_articles` ADD `og_image_key` text;--> statement-breakpoint
UPDATE `managed_articles`
SET `content_updated_at` = `updated_at`,
    `show_updated_label` = CASE
      WHEN `published_at` IS NOT NULL AND substr(`updated_at`, 1, 10) <> substr(`published_at`, 1, 10) THEN 1
      ELSE 0
    END;
