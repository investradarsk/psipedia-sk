ALTER TABLE `directory_profiles` ADD `postal_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `directory_profiles` ADD `street` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `directory_profiles` ADD `house_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `directory_profiles` ADD `address_format` text DEFAULT '' NOT NULL
  CHECK (`address_format` IN ('', 'STREET', 'MUNICIPALITY_NUMBER'));--> statement-breakpoint
ALTER TABLE `directory_profiles` ADD `service_address_confirmation` text DEFAULT 'LEGACY_UNCONFIRMED' NOT NULL
  CHECK (`service_address_confirmation` IN ('CONFIRMED_SERVICE_LOCATION', 'LEGACY_UNCONFIRMED'));
