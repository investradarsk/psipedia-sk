-- EDITOR: Event photo accessibility and private admin-only notes.
-- internal_notes is deliberately excluded from DogEvent, public queries, sitemaps and SEO.
ALTER TABLE managed_events ADD COLUMN image_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE managed_events ADD COLUMN internal_notes TEXT NOT NULL DEFAULT '';
