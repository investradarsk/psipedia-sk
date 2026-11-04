-- 0157: Minimal owner-only two-week Facebook planning checklist.
-- Manual planned/unplanned notes only. No Facebook/Notion publication side effects.
-- Production application requires the separately approved D1 migration workflow.
CREATE TABLE IF NOT EXISTS facebook_weekly_plan_marks (
  slot_date TEXT NOT NULL,
  slot_key TEXT NOT NULL CHECK (slot_key IN (
    'news', 'breed', 'video', 'infographic',
    'help', 'article', 'service', 'event'
  )),
  marked_at TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  PRIMARY KEY (slot_date, slot_key)
);
