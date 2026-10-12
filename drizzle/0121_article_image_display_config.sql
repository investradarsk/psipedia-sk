-- IMAGE-EDITOR-1: immutable source images; independent presentation for cards and detail.
-- NULL means automatic/default or a legacy focal-point fallback.
ALTER TABLE managed_articles ADD COLUMN thumbnail_display_json TEXT;
ALTER TABLE managed_articles ADD COLUMN detail_display_json TEXT;
