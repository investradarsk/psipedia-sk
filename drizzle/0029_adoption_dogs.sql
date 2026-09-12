CREATE TABLE IF NOT EXISTS adoption_dogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RESERVED', 'ADOPTED', 'ARCHIVED')),
  sex TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (sex IN ('MALE', 'FEMALE', 'UNKNOWN')),
  birth_date TEXT,
  approximate_age_months INTEGER,
  size TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (size IN ('SMALL', 'MEDIUM', 'LARGE', 'GIANT', 'UNKNOWN')),
  weight REAL,
  breed_id INTEGER REFERENCES managed_breeds(id) ON DELETE SET NULL,
  breed_name TEXT NOT NULL DEFAULT '',
  breed_mix INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  organization_id INTEGER,
  organization_name TEXT NOT NULL DEFAULT '',
  organization_slug TEXT,
  main_image TEXT,
  gallery_json TEXT NOT NULL DEFAULT '[]',
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  temperament TEXT NOT NULL DEFAULT '',
  activity_level TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (activity_level IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'UNKNOWN')),
  suitable_for_children TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (suitable_for_children IN ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN')),
  suitable_for_dogs TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (suitable_for_dogs IN ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN')),
  suitable_for_cats TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (suitable_for_cats IN ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN')),
  suitable_for_other_animals TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (suitable_for_other_animals IN ('YES', 'NO', 'CONDITIONAL', 'UNKNOWN')),
  apartment_suitable INTEGER,
  beginner_suitable INTEGER,
  needs_experienced_owner INTEGER NOT NULL DEFAULT 0,
  vaccination_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (vaccination_status IN ('UNKNOWN', 'NONE', 'PARTIAL', 'UP_TO_DATE')),
  chipped INTEGER,
  neutered INTEGER,
  health_notes TEXT NOT NULL DEFAULT '',
  special_needs TEXT NOT NULL DEFAULT '',
  adoption_requirements TEXT NOT NULL DEFAULT '',
  external_source_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_url TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS adoption_dogs_slug_unique ON adoption_dogs(slug);
CREATE INDEX IF NOT EXISTS adoption_dogs_public_status_idx ON adoption_dogs(status, published_at, updated_at);
CREATE INDEX IF NOT EXISTS adoption_dogs_region_idx ON adoption_dogs(status, region, sex, size);
CREATE INDEX IF NOT EXISTS adoption_dogs_verified_idx ON adoption_dogs(status, last_verified_at);
CREATE INDEX IF NOT EXISTS adoption_dogs_org_idx ON adoption_dogs(organization_id, status);
CREATE INDEX IF NOT EXISTS adoption_dogs_breed_idx ON adoption_dogs(breed_id, status);
CREATE INDEX IF NOT EXISTS adoption_dogs_admin_updated_idx ON adoption_dogs(updated_at, id);
