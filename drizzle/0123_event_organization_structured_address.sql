-- ADDRESS-ADMIN-D1-3: additive only; no backfill, GEO writes or mode column.
ALTER TABLE managed_events ADD COLUMN district TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE managed_events ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE managed_events ADD COLUMN street TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE managed_events ADD COLUMN house_number TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE managed_events ADD COLUMN address_format TEXT NOT NULL DEFAULT ''
  CONSTRAINT managed_events_address_format_check CHECK (address_format IN ('', 'STREET', 'MUNICIPALITY_NUMBER'));--> statement-breakpoint
ALTER TABLE organization_locations ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE organization_locations ADD COLUMN street TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE organization_locations ADD COLUMN house_number TEXT NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE organization_locations ADD COLUMN address_format TEXT NOT NULL DEFAULT ''
  CONSTRAINT organization_locations_address_format_check CHECK (address_format IN ('', 'STREET', 'MUNICIPALITY_NUMBER'));
