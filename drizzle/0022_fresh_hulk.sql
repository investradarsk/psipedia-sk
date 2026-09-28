ALTER TABLE `managed_breeds` ADD `fci_number` integer;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `fci_section_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `official_fci_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `valid_standard_date` text;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `working_trial` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `import_key` text;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `fci_standard_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `editorial_complete` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `managed_breeds_fci_number_unique` ON `managed_breeds` (`fci_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `managed_breeds_import_key_unique` ON `managed_breeds` (`import_key`);--> statement-breakpoint
CREATE INDEX `managed_breeds_origin_idx` ON `managed_breeds` (`status`,`origin`,`name`);