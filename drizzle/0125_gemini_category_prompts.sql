-- GEMINI-CATEGORY-PROMPTS-ADMIN-1: additive D1 overrides, no automatic worker changes.
-- Defaults remain derived from the canonical catalog and are never seeded into D1.
CREATE TABLE IF NOT EXISTS gemini_category_prompts (
  stable_key TEXT NOT NULL PRIMARY KEY,
  user_prompt TEXT NOT NULL CHECK (length(trim(user_prompt)) BETWEEN 40 AND 6000),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
