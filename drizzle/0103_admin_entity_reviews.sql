CREATE TABLE IF NOT EXISTS admin_entity_reviews (
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reviewed_at TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id),
  CHECK (entity_id > 0)
);

CREATE INDEX IF NOT EXISTS admin_entity_reviews_reviewed_at_idx
  ON admin_entity_reviews(reviewed_at);
