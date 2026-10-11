-- Existing article images remain unchanged. NULL focal values select automatic top-biased fitting.
ALTER TABLE managed_articles ADD COLUMN image_display TEXT NOT NULL DEFAULT 'auto'
  CHECK (image_display IN ('auto', 'cover', 'contain'));
ALTER TABLE managed_articles ADD COLUMN image_focus_x INTEGER
  CHECK (image_focus_x IS NULL OR image_focus_x BETWEEN 0 AND 100);
ALTER TABLE managed_articles ADD COLUMN image_focus_y INTEGER
  CHECK (image_focus_y IS NULL OR image_focus_y BETWEEN 0 AND 100);
