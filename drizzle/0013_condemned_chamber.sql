ALTER TABLE `managed_breeds` ADD `gallery_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `height` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `children` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `other_dogs` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `apartment` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `grooming` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `shedding` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `prey_drive` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `history` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `exercise` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `training` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `health` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `health_risks_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `managed_breeds` ADD `sources_json` text DEFAULT '[]' NOT NULL;