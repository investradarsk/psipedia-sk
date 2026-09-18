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


-- ORG-2B canonical multi-location fixtures. Street addresses stay non-public; public reads expose locality/region only.
INSERT INTO organization_locations (
  id, organization_id, role, label, address, city, district, region, country_code, is_primary, sort_order
) VALUES
  (
    990101, 990001, 'SERVICE_AREA', '', 'Neverejná 10',
    'Šaľa', 'Šaľa', 'Nitriansky kraj', 'SK', 1, 10
  ),
  (
    990102, 990001, 'SITE', 'Výdajné miesto', 'Neverejná 20',
    'Nitra', 'Nitra', 'Nitriansky kraj', 'SK', 0, 20
  );

INSERT INTO help_organizations (
  id, name, slug, status, short_description, description,
  city, district, region, country_code,
  published_at, archived_at, created_at, updated_at, created_by, updated_by
) VALUES
  (
    990007, 'E2E Jedna lokalita', 'org-2b-e2e-jedna-lokalita', 'PUBLISHED',
    'Profil s jednou canonical lokalitou.', 'Jedna lokalita má zostať kompaktná v hero.',
    'Legacy mesto', 'Legacy okres', 'Legacy kraj', 'SK',
    '2026-09-18T05:00:00.000Z', NULL,
    '2026-09-18T05:00:00.000Z', '2026-09-18T05:00:00.000Z',
    'org2b-e2e-local-fixture', 'org2b-e2e-local-fixture'
  ),
  (
    990008, 'E2E Bez lokality', 'org-2b-e2e-bez-lokality', 'PUBLISHED',
    'Profil bez zobraziteľnej lokality.', 'Prázdna lokalita nesmie vytvoriť placeholder ani prázdnu sekciu.',
    '', '', '', 'SK',
    '2026-09-18T05:00:00.000Z', NULL,
    '2026-09-18T05:00:00.000Z', '2026-09-18T05:00:00.000Z',
    'org2b-e2e-local-fixture', 'org2b-e2e-local-fixture'
  );

INSERT INTO organization_locations (
  id, organization_id, role, label, address, city, district, region, country_code, is_primary, sort_order
) VALUES (
  990107, 990007, 'SITE', '', 'Neverejná 30',
  'Trnava', 'Trnava', 'Trnavský kraj', 'SK', 1, 0
);


-- ORG-7E synthetic fundraising fixtures. No production fundraising data is used.
INSERT INTO organization_fundraising_methods (
  id, organization_id, type, label, url, value, instructions, beneficiary_identity, ownership, sort_order,
  is_active, verification_status, verified_at, verified_by, verification_source_url, verification_expires_at,
  valid_until, version, archived_at, created_at, updated_at, created_by, updated_by
) VALUES
  (
    990201, 990001, 'DONATION_PAGE', 'Podporte našu starostlivosť', 'https://example.org/support', NULL,
    'Bezpečná syntetická CTA pre lokálny E2E test.',
    'ORG-7E citlivý príjemca – NESMIE BYŤ V HTML', 'ORGANIZATION_OWNED', 0,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    'https://example.org/internal-verification-source', '2030-01-01T00:00:00.000Z',
    '2030-01-01T00:00:00.000Z', 3, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990202, 990001, 'BANK_TRANSFER', 'Bankový účet organizácie', NULL, 'GB82WEST12345698765432',
    'Pri bankovom prevode môžete do poznámky uviesť DAR. Toto je dlhší syntetický text, ktorý overuje zalamovanie obsahu bez horizontálneho overflow na úzkom mobile.',
    'ORG-7E bank beneficiary – NESMIE BYŤ V HTML', 'ORGANIZATION_OWNED', 10,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    'https://example.org/internal-verification-source-bank', '2030-01-01T00:00:00.000Z',
    NULL, 4, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990203, 990001, 'MATERIAL_DONATION',
    'Materiálna pomoc s veľmi dlhým názvom pre bezpečný responsive test fundraising karty',
    NULL, 'Granule, deky a hygienické potreby',
    'Doručenie materiálnej pomoci si dohodnite vopred cez verejné kontakty organizácie.',
    'ORG-7E material beneficiary – NESMIE BYŤ V HTML', 'ORGANIZATION_OWNED', 20,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    NULL, NULL, '2030-01-01T00:00:00.000Z', 2, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990204, 990001, 'DONATION_PAGE', 'ORG-7E skrytá neaktívna metóda', 'https://example.org/inactive', NULL,
    NULL, 'hidden inactive beneficiary', 'ORGANIZATION_OWNED', 30,
    0, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    NULL, '2030-01-01T00:00:00.000Z', NULL, 1, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990205, 990001, 'DONATION_PAGE', 'ORG-7E skrytá rejected metóda', 'https://example.org/rejected', NULL,
    NULL, 'hidden rejected beneficiary', 'ORGANIZATION_OWNED', 31,
    1, 'REJECTED', NULL, NULL, NULL, NULL, NULL, 1, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990206, 990001, 'DONATION_PAGE', 'ORG-7E skrytá expired metóda', 'https://example.org/expired', NULL,
    NULL, 'hidden expired beneficiary', 'ORGANIZATION_OWNED', 32,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    NULL, '2026-09-18T07:59:59.000Z', NULL, 1, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990207, 990007, 'TRANSPARENT_ACCOUNT', 'Transparentný účet', 'https://example.org/transparent',
    'GB82WEST12345698765432', 'Transparentný účet otvoríte cez bezpečný externý odkaz.',
    'ORG-7E single beneficiary – NESMIE BYŤ V HTML', 'ORGANIZATION_OWNED', 0,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    NULL, '2030-01-01T00:00:00.000Z', NULL, 1, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  ),
  (
    990208, 990002, 'DONATION_PAGE', 'Fundraising draft organizácie', 'https://example.org/draft-org', NULL,
    NULL, 'draft org beneficiary', 'ORGANIZATION_OWNED', 0,
    1, 'VERIFIED', '2026-09-18T07:00:00.000Z', 'org7e-verifier@example.invalid',
    NULL, '2030-01-01T00:00:00.000Z', NULL, 1, NULL,
    '2026-09-18T07:00:00.000Z', '2026-09-18T07:00:00.000Z',
    'org7e-e2e-fixture', 'org7e-e2e-fixture'
  );
