-- Owner-only exact manual cleanup after SQL-only deployment and integrity audit.
-- Do NOT run generic migrations apply.
ALTER TABLE managed_breeds DROP COLUMN fci_standard_json;
--> statement-breakpoint
ALTER TABLE managed_breeds DROP COLUMN editorial_json;
--> statement-breakpoint
ALTER TABLE managed_breeds DROP COLUMN related_breeds_json;
--> statement-breakpoint
ALTER TABLE managed_breeds DROP COLUMN seo_json;
