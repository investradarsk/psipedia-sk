CREATE TABLE IF NOT EXISTS organization_fundraising_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES help_organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('MATERIAL_DONATION', 'DONATION_PAGE', 'BANK_TRANSFER', 'TRANSPARENT_ACCOUNT', 'EXTERNAL_FUNDRAISER')),
  label TEXT NOT NULL DEFAULT '',
  url TEXT,
  value TEXT,
  instructions TEXT,
  beneficiary_identity TEXT,
  ownership TEXT NOT NULL CHECK (ownership IN ('ORGANIZATION_OWNED', 'THIRD_PARTY_CAMPAIGN')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'STALE', 'REJECTED')),
  verified_at TEXT,
  verified_by TEXT,
  verification_source_url TEXT,
  verification_expires_at TEXT,
  valid_until TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS organization_fundraising_methods_org_order_idx
  ON organization_fundraising_methods(organization_id, sort_order, id);
