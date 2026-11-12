-- Additive, owner-only Facebook editorial plan: manual content schedule, NEVER Meta publishing.
-- Protected owner-dispatched D1 migration only; do not change 0157 or existing marks.
CREATE TABLE IF NOT EXISTS facebook_weekly_template (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  slots_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facebook_weekly_template_marks (
  slot_date TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  marked_at TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  PRIMARY KEY (slot_date, slot_id)
);
