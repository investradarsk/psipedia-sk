CREATE TABLE `lost_found_dog_reports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('LOST','FOUND')),
  `status` text DEFAULT 'DRAFT' NOT NULL CHECK (`status` IN ('DRAFT','PENDING','ACTIVE','RESOLVED','EXPIRED','REJECTED','ARCHIVED')),
  `slug` text NOT NULL,
  `dog_name` text,
  `sex` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`sex` IN ('MALE','FEMALE','UNKNOWN')),
  `breed_id` integer REFERENCES `managed_breeds`(`id`) ON DELETE SET NULL,
  `breed` text DEFAULT '' NOT NULL,
  `breed_unknown` integer DEFAULT 0 NOT NULL CHECK (`breed_unknown` IN (0,1)),
  `color` text DEFAULT '' NOT NULL,
  `approximate_age` text DEFAULT '' NOT NULL,
  `size` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`size` IN ('SMALL','MEDIUM','LARGE','UNKNOWN')),
  `description` text DEFAULT '' NOT NULL,
  `distinguishing_marks` text DEFAULT '' NOT NULL,
  `collar_description` text DEFAULT '' NOT NULL,
  `chipped` text DEFAULT 'UNKNOWN' NOT NULL CHECK (`chipped` IN ('YES','NO','UNKNOWN')),
  `main_image` text,
  `main_image_key` text,
  `gallery_json` text DEFAULT '[]' NOT NULL,
  `event_date` text DEFAULT '' NOT NULL,
  `last_seen_date_time` text,
  `region` text DEFAULT '' NOT NULL,
  `district` text DEFAULT '' NOT NULL,
  `city` text DEFAULT '' NOT NULL,
  `location_description` text DEFAULT '' NOT NULL,
  `public_latitude` real,
  `public_longitude` real,
  `public_location_precision` text DEFAULT 'MUNICIPALITY' NOT NULL CHECK (`public_location_precision` IN ('MUNICIPALITY','NEIGHBORHOOD','APPROXIMATE')),
  `public_contact_note` text DEFAULT '' NOT NULL,
  `source` text DEFAULT 'EDITORIAL' NOT NULL,
  `source_url` text,
  `search_text` text DEFAULT '' NOT NULL,
  `duplicate_of_id` integer REFERENCES `lost_found_dog_reports`(`id`) ON DELETE SET NULL,
  `duplicate_reason` text DEFAULT '' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text,
  `expires_at` text,
  `resolved_at` text,
  `archived_at` text
);
CREATE UNIQUE INDEX `lost_found_dog_reports_type_slug_unique` ON `lost_found_dog_reports` (`type`,`slug`);
CREATE INDEX `lost_found_dog_reports_public_idx` ON `lost_found_dog_reports` (`type`,`status`,`event_date`,`published_at`);
CREATE INDEX `lost_found_dog_reports_location_idx` ON `lost_found_dog_reports` (`status`,`type`,`region`,`district`,`city`);
CREATE INDEX `lost_found_dog_reports_expiry_idx` ON `lost_found_dog_reports` (`status`,`expires_at`);
CREATE INDEX `lost_found_dog_reports_breed_idx` ON `lost_found_dog_reports` (`status`,`type`,`breed_id`);
CREATE INDEX `lost_found_dog_reports_admin_updated_idx` ON `lost_found_dog_reports` (`updated_at`,`id`);
CREATE INDEX `lost_found_dog_reports_duplicate_idx` ON `lost_found_dog_reports` (`duplicate_of_id`);

CREATE TABLE `lost_found_dog_private_details` (
  `report_id` integer PRIMARY KEY NOT NULL REFERENCES `lost_found_dog_reports`(`id`) ON DELETE CASCADE,
  `contact_name_encrypted` text,
  `contact_phone_encrypted` text,
  `contact_phone_hash` text,
  `contact_email_encrypted` text,
  `contact_email_hash` text,
  `private_location_description_encrypted` text,
  `private_latitude_encrypted` text,
  `private_longitude_encrypted` text,
  `verification_note_encrypted` text,
  `private_note_encrypted` text,
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `lost_found_dog_private_phone_hash_idx` ON `lost_found_dog_private_details` (`contact_phone_hash`);
CREATE INDEX `lost_found_dog_private_email_hash_idx` ON `lost_found_dog_private_details` (`contact_email_hash`);
