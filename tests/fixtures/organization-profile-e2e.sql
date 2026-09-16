INSERT INTO help_organizations (
  id,
  name,
  slug,
  legal_name,
  registration_number,
  type,
  status,
  short_description,
  description,
  public_email,
  public_phone,
  website_url,
  facebook_url,
  instagram_url,
  address,
  city,
  district,
  region,
  country_code,
  image_url,
  directory_profile_id,
  import_key,
  source_url,
  source_data_json,
  seo_json,
  published_at,
  last_verified_at,
  archived_at,
  created_at,
  updated_at,
  created_by,
  updated_by
) VALUES (
  990001,
  'E2E Kanonická organizácia',
  'org-3b-e2e-kanonicka-organizacia',
  'E2E Kanonická organizácia, o.z.',
  'E2E-ORG-990001',
  'CIVIC_ASSOCIATION',
  'PUBLISHED',
  'Izolovaný lokálny CI profil pre ORG-3B.',
  'Pomáhame psom v núdzi a hľadáme im bezpečné domovy.' || char(10) || char(10) || 'Tento text existuje iba v izolovanom lokálnom CI fixture.',
  'org3b-e2e@example.invalid',
  '+421 900 987 654',
  'https://example.org/organization',
  'https://www.facebook.com/example',
  'https://www.instagram.com/example',
  'Testovacia 1',
  'Nitra',
  'Nitra',
  'Nitriansky kraj',
  'SK',
  NULL,
  NULL,
  'e2e:organization-profile:990001',
  'https://provenance.example.invalid/internal-only',
  '{}',
  '{}',
  '2026-09-16T10:00:00.000Z',
  '2026-09-16T10:00:00.000Z',
  NULL,
  '2026-09-16T10:00:00.000Z',
  '2026-09-16T10:00:00.000Z',
  'org3b-e2e-local-fixture',
  'org3b-e2e-local-fixture'
);

INSERT INTO adoption_dogs (
  id,
  name,
  slug,
  status,
  sex,
  size,
  breed_name,
  region,
  district,
  city,
  organization_id,
  organization_name,
  organization_slug,
  short_description,
  description,
  search_text,
  published_at,
  last_verified_at,
  created_at,
  updated_at,
  created_by,
  updated_by
) VALUES (
  990001,
  'E2E Neo na adopciu',
  'org-3b-e2e-neo-na-adopciu',
  'ACTIVE',
  'MALE',
  'LARGE',
  'Labradorský retriever',
  'Nitriansky kraj',
  'Nitra',
  'Nitra',
  990001,
  'E2E Kanonická organizácia',
  'org-3b-e2e-kanonicka-organizacia',
  'Izolovaný canonical adoption fixture.',
  'Lokálny CI záznam pre ORG-3B.',
  'e2e neo adopcia nitra',
  '2026-09-16T10:05:00.000Z',
  '2026-09-16T10:05:00.000Z',
  '2026-09-16T10:05:00.000Z',
  '2026-09-16T10:05:00.000Z',
  'org3b-e2e-local-fixture',
  'org3b-e2e-local-fixture'
);

INSERT INTO adoption_dogs (
  id, name, slug, status, sex, size, breed_name, region, district, city,
  organization_id, organization_name, organization_slug, short_description, description, search_text,
  published_at, last_verified_at, created_at, updated_at, created_by, updated_by
) VALUES
  (
    990004, 'E2E Luna rezervovaná', 'org-3c-e2e-luna-rezervovana', 'RESERVED',
    'FEMALE', 'MEDIUM', '', 'Nitriansky kraj', '', '',
    990001, 'Historický snapshot názvu', 'historicky-snapshot-slug',
    '', 'Rezervovaný lokálny CI záznam bez voliteľnej lokality a obrázka.', 'e2e luna rezervovana',
    '2026-09-16T10:06:00.000Z', '2026-09-16T10:06:00.000Z',
    '2026-09-16T10:06:00.000Z', '2026-09-16T10:06:00.000Z',
    'org3c-e2e-local-fixture', 'org3c-e2e-local-fixture'
  ),
  (
    990005, 'E2E Skrytý draft', 'org-3c-e2e-skryty-draft', 'DRAFT',
    'MALE', 'SMALL', '', 'Nitriansky kraj', 'Nitra', 'Nitra',
    990001, 'E2E Kanonická organizácia', 'org-3b-e2e-kanonicka-organizacia',
    'Tento profil nesmie byť verejný.', 'Draft lokálny CI záznam.', 'e2e skryty draft',
    NULL, '2026-09-16T10:07:00.000Z',
    '2026-09-16T10:07:00.000Z', '2026-09-16T10:07:00.000Z',
    'org3c-e2e-local-fixture', 'org3c-e2e-local-fixture'
  );

INSERT INTO help_organizations (
  id, name, slug, status, published_at, archived_at,
  created_at, updated_at, created_by, updated_by
) VALUES
  (
    990002, 'E2E Draft organizácia', 'org-3b-e2e-draft-organizacia', 'DRAFT', NULL, NULL,
    '2026-09-16T10:00:00.000Z', '2026-09-16T10:00:00.000Z',
    'org3b-e2e-local-fixture', 'org3b-e2e-local-fixture'
  ),
  (
    990003, 'E2E Archivovaná organizácia', 'org-3b-e2e-archivovana-organizacia', 'ARCHIVED',
    '2026-09-16T10:00:00.000Z', '2026-09-16T11:00:00.000Z',
    '2026-09-16T10:00:00.000Z', '2026-09-16T11:00:00.000Z',
    'org3b-e2e-local-fixture', 'org3b-e2e-local-fixture'
  );

INSERT INTO adoption_dogs (
  id, name, slug, status, sex, size, breed_name, region, district, city,
  organization_id, organization_name, organization_slug, short_description, description, search_text,
  published_at, last_verified_at, created_at, updated_at, created_by, updated_by
) VALUES (
  990006, 'E2E Pes draft organizácie', 'org-3c-e2e-pes-draft-organizacie', 'ACTIVE',
  'MALE', 'MEDIUM', '', 'Nitriansky kraj', 'Nitra', 'Nitra',
  990002, 'E2E Draft organizácia', 'org-3b-e2e-draft-organizacia',
  'Verejný adopčný stav nesmie odomknúť draft organizáciu.', 'Lokálny CI bezpečnostný záznam.',
  'e2e draft organizacia pes',
  '2026-09-16T10:08:00.000Z', '2026-09-16T10:08:00.000Z',
  '2026-09-16T10:08:00.000Z', '2026-09-16T10:08:00.000Z',
  'org3c-e2e-local-fixture', 'org3c-e2e-local-fixture'
);
