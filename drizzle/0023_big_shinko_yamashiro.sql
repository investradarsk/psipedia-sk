CREATE TABLE `breed_article_relations` (
	`breed_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `breed_article_relations_unique` ON `breed_article_relations` (`breed_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `breed_article_relations_article_idx` ON `breed_article_relations` (`article_id`,`breed_id`);--> statement-breakpoint
CREATE TABLE `breed_directory_relations` (
	`breed_id` integer NOT NULL,
	`profile_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `breed_directory_relations_unique` ON `breed_directory_relations` (`breed_id`,`profile_id`);--> statement-breakpoint
CREATE INDEX `breed_directory_relations_profile_idx` ON `breed_directory_relations` (`profile_id`,`breed_id`);--> statement-breakpoint
CREATE INDEX `breed_directory_relations_public_idx` ON `breed_directory_relations` (`breed_id`,`relation_type`,`profile_id`);--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `editorial_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `sports_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `related_breeds_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `breed_directory_relations` (`breed_id`,`profile_id`,`relation_type`,`source`,`created_at`,`created_by`)
SELECT b.id, d.id,
  CASE WHEN d.category = 'chovatelske-stanice' THEN 'breeding-station' ELSE 'breed-club' END,
  'source-data-exact', CURRENT_TIMESTAMP, 'migration:0023'
FROM directory_profiles d
JOIN managed_breeds b ON lower(trim(CASE WHEN json_valid(d.source_data_json) THEN COALESCE(
  NULLIF(json_extract(d.source_data_json, '$."Plemeno"'), ''),
  NULLIF(json_extract(d.source_data_json, '$."Plemená"'), ''), ''
) ELSE '' END)) IN (lower(trim(b.name)), lower(trim(b.official_fci_name)))
WHERE d.category IN ('chovatelske-stanice', 'chovatelske-kluby');
