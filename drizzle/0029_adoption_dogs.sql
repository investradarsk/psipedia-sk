CREATE TABLE `adoption_dogs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `status` text DEFAULT 'DRAFT' NOT NULL CHECK (`status` IN ('DRAFT','ACTIVE','RESERVED','ADOPTED','ARCHIVED')),
  `sex` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`sex` IN ('MALE','FEMALE','UNKNOWN')),
  `birth_date` text,
  `approximate_age_months` integer,
  `size` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`size` IN ('SMALL','MEDIUM','LARGE','XL','UNKNOWN')),
  `weight_kg` integer,
  `breed_id` integer,
  `breed_name` text DEFAULT '' NOT NULL,
  `breed_slug` text DEFAULT '' NOT NULL,
  `breed_mix` integer DEFAULT 0 NOT NULL,
  `color` text DEFAULT '' NOT NULL,
  `region` text NOT NULL,
  `district` text DEFAULT '' NOT NULL,
  `city` text NOT NULL,
  `organization_id` integer,
  `organization_name` text DEFAULT '' NOT NULL,
  `organization_url` text,
  `main_image` text,
  `gallery_json` text DEFAULT '[]' NOT NULL,
  `short_description` text NOT NULL,
  `description` text NOT NULL,
  `temperament` text DEFAULT '' NOT NULL,
  `activity_level` text DEFAULT 'UNKNOWN' NOT NULL,
  `suitable_for_children` text DEFAULT 'UNKNOWN' NOT NULL,
  `suitable_for_dogs` text DEFAULT 'UNKNOWN' NOT NULL,
  `suitable_for_cats` text DEFAULT 'UNKNOWN' NOT NULL,
  `suitable_for_other_animals` text DEFAULT 'UNKNOWN' NOT NULL,
  `apartment_suitable` text DEFAULT 'UNKNOWN' NOT NULL,
  `beginner_suitable` text DEFAULT 'UNKNOWN' NOT NULL,
  `needs_experienced_owner` text DEFAULT 'UNKNOWN' NOT NULL,
  `vaccination_status` text DEFAULT 'UNKNOWN' NOT NULL,
  `chipped` text DEFAULT 'UNKNOWN' NOT NULL,
  `neutered` text DEFAULT 'UNKNOWN' NOT NULL,
  `health_notes` text DEFAULT '' NOT NULL,
  `special_needs` text DEFAULT '' NOT NULL,
  `adoption_requirements` text DEFAULT '' NOT NULL,
  `external_source_url` text,
  `contact_name` text DEFAULT '' NOT NULL,
  `contact_email` text,
  `contact_phone` text DEFAULT '' NOT NULL,
  `published_at` text,
  `last_verified_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  FOREIGN KEY (`breed_id`) REFERENCES `managed_breeds`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adoption_dogs_slug_unique` ON `adoption_dogs` (`slug`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_public_idx` ON `adoption_dogs` (`status`,`published_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_location_idx` ON `adoption_dogs` (`status`,`region`,`district`,`city`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_filters_idx` ON `adoption_dogs` (`status`,`sex`,`size`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_verification_idx` ON `adoption_dogs` (`status`,`last_verified_at`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_breed_idx` ON `adoption_dogs` (`breed_id`,`status`);
--> statement-breakpoint
CREATE INDEX `adoption_dogs_org_idx` ON `adoption_dogs` (`organization_id`,`status`);
