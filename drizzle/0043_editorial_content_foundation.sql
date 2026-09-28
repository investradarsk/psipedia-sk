CREATE TABLE editorial_author_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'team' CHECK (kind IN ('individual', 'team', 'external')),
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  short_bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX editorial_author_profiles_slug_unique
  ON editorial_author_profiles(slug);

CREATE INDEX editorial_author_profiles_active_default_idx
  ON editorial_author_profiles(is_active, is_default, display_name);

CREATE UNIQUE INDEX editorial_author_profiles_one_active_default_idx
  ON editorial_author_profiles(is_default)
  WHERE is_default = 1 AND is_active = 1;

INSERT INTO editorial_author_profiles (
  slug,
  kind,
  display_name,
  avatar_url,
  short_bio,
  role,
  is_active,
  is_default,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  'redakcia-psipedia',
  'team',
  'Redakcia Psipedia',
  NULL,
  '',
  'Redakcia',
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'foundation-editorial',
  'foundation-editorial'
WHERE NOT EXISTS (
  SELECT 1 FROM editorial_author_profiles WHERE slug = 'redakcia-psipedia'
);

ALTER TABLE managed_articles
  ADD COLUMN author_profile_id INTEGER REFERENCES editorial_author_profiles(id) ON DELETE SET NULL;

ALTER TABLE managed_articles
  ADD COLUMN intro_rich_text_json TEXT;

ALTER TABLE managed_articles
  ADD COLUMN takeaway_rich_text_json TEXT;

CREATE INDEX managed_articles_author_profile_idx
  ON managed_articles(author_profile_id, status);
