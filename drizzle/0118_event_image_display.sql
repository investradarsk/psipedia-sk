-- Smart-card image presentation, without rewriting any original photos.
-- Old rows and imports safely default to the automatic fitting mode.
ALTER TABLE managed_events ADD COLUMN image_display TEXT NOT NULL DEFAULT 'auto'
  CHECK (image_display IN ('auto', 'cover', 'contain'));
