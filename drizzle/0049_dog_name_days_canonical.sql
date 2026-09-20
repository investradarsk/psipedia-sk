CREATE TABLE dog_name_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  day INTEGER NOT NULL CHECK (
    (month IN (1, 3, 5, 7, 8, 10, 12) AND day BETWEEN 1 AND 31)
    OR (month IN (4, 6, 9, 11) AND day BETWEEN 1 AND 30)
    OR (month = 2 AND day BETWEEN 1 AND 29)
  ),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  source TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX dog_name_days_month_day_name_unique
  ON dog_name_days(month, day, normalized_name);

CREATE INDEX dog_name_days_public_lookup_idx
  ON dog_name_days(status, month, day, normalized_name);

CREATE INDEX dog_name_days_name_search_idx
  ON dog_name_days(normalized_name);
