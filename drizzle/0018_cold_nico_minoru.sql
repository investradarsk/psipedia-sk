DROP INDEX `directory_profiles_public_idx`;--> statement-breakpoint
ALTER TABLE `directory_profiles` ADD `district` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `directory_profiles_public_district_idx` ON `directory_profiles` (`status`,`category`,`district`,`city`);--> statement-breakpoint
CREATE INDEX `directory_profiles_public_city_idx` ON `directory_profiles` (`status`,`category`,`city`,`name`);--> statement-breakpoint
CREATE INDEX `directory_profiles_public_name_idx` ON `directory_profiles` (`status`,`category`,`name`);--> statement-breakpoint
CREATE INDEX `directory_profiles_public_idx` ON `directory_profiles` (`status`,`category`,`region`,`district`,`city`);