CREATE TABLE IF NOT EXISTS organization_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES help_organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'UNSPECIFIED' CHECK (role IN ('UNSPECIFIED', 'SITE', 'LEGAL_SEAT', 'SERVICE_AREA')),
  label TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'SK',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS organization_locations_org_order_idx
  ON organization_locations(organization_id, sort_order, id);

CREATE UNIQUE INDEX IF NOT EXISTS organization_locations_one_primary_idx
  ON organization_locations(organization_id)
  WHERE is_primary = 1;

INSERT INTO organization_locations (
  organization_id,
  role,
  label,
  address,
  city,
  district,
  region,
  country_code,
  is_primary,
  sort_order
)
SELECT
  o.id,
  'UNSPECIFIED',
  '',
  o.address,
  o.city,
  o.district,
  o.region,
  o.country_code,
  1,
  0
FROM help_organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_locations l
  WHERE l.organization_id = o.id
);
