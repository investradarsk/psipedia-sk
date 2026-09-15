CREATE TABLE help_organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  legal_name TEXT NOT NULL DEFAULT '',
  registration_number TEXT,
  type TEXT NOT NULL DEFAULT 'OTHER' CHECK (type IN ('SHELTER', 'CIVIC_ASSOCIATION', 'RESCUE_ORGANIZATION', 'MUNICIPAL_ORGANIZATION', 'NONPROFIT', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  public_email TEXT,
  public_phone TEXT,
  website_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'SK',
  image_url TEXT,
  image_key TEXT,
  directory_profile_id INTEGER REFERENCES directory_profiles(id) ON DELETE SET NULL,
  import_key TEXT,
  source_url TEXT,
  source_data_json TEXT NOT NULL DEFAULT '{}',
  seo_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  last_verified_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX help_organizations_slug_unique ON help_organizations(slug);
CREATE UNIQUE INDEX help_organizations_import_key_unique ON help_organizations(import_key);
CREATE UNIQUE INDEX help_organizations_directory_profile_unique ON help_organizations(directory_profile_id);
CREATE INDEX help_organizations_public_idx ON help_organizations(status, region, city, name);
CREATE INDEX help_organizations_type_status_idx ON help_organizations(type, status);
CREATE INDEX help_organizations_registration_idx ON help_organizations(registration_number);
CREATE INDEX help_organizations_updated_idx ON help_organizations(updated_at, id);
