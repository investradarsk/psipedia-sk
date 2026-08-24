CREATE TABLE `managed_breeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`image_key` text,
	`fci_group` integer NOT NULL,
	`fci_section` text NOT NULL,
	`origin` text NOT NULL,
	`group_name` text NOT NULL,
	`size` text NOT NULL,
	`weight` text NOT NULL,
	`lifespan` text NOT NULL,
	`coat` text NOT NULL,
	`energy` integer DEFAULT 3 NOT NULL,
	`trainability` integer DEFAULT 3 NOT NULL,
	`family` integer DEFAULT 3 NOT NULL,
	`intro` text NOT NULL,
	`character` text NOT NULL,
	`needs` text NOT NULL,
	`good_for_json` text DEFAULT '[]' NOT NULL,
	`consider_json` text DEFAULT '[]' NOT NULL,
	`accent` text DEFAULT 'forest' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_breeds_slug_unique` ON `managed_breeds` (`slug`);--> statement-breakpoint
CREATE INDEX `managed_breeds_public_idx` ON `managed_breeds` (`status`,`fci_group`,`name`);--> statement-breakpoint
CREATE TABLE `portal_section_settings` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`eyebrow` text NOT NULL,
	`description` text NOT NULL,
	`intro` text NOT NULL,
	`subpages_json` text DEFAULT '[]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`visible` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
