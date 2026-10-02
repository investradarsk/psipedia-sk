CREATE TABLE IF NOT EXISTS portal_section_settings (
  slug TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  eyebrow TEXT NOT NULL,
  description TEXT NOT NULL,
  intro TEXT NOT NULL,
  subpages_json TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

ALTER TABLE portal_section_settings
ADD COLUMN hero_config_json TEXT NOT NULL DEFAULT '{}';
