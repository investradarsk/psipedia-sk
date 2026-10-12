-- IMAGE-EDITOR-2: independent, non-destructive display settings per primary image.
-- Nullable overrides preserve all existing image modes and legacy photography.
ALTER TABLE managed_events ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE managed_events ADD COLUMN detail_display_json TEXT;
ALTER TABLE directory_profiles ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE directory_profiles ADD COLUMN detail_display_json TEXT;
ALTER TABLE help_cases ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE help_cases ADD COLUMN detail_display_json TEXT;
ALTER TABLE help_organizations ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE help_organizations ADD COLUMN detail_display_json TEXT;
ALTER TABLE adoption_dogs ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE adoption_dogs ADD COLUMN detail_display_json TEXT;
ALTER TABLE lost_found_dog_reports ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE lost_found_dog_reports ADD COLUMN detail_display_json TEXT;
