-- REVIEWS-2B disposable local E2E fixture only. Never run against remote production D1.

INSERT OR IGNORE INTO partner_resources (
  id, entity_type, directory_profile_id, created_at, updated_at
)
SELECT
  'reviews-2b-directory-resource',
  'DIRECTORY_PROFILE',
  id,
  '2026-09-23T12:00:00.000Z',
  '2026-09-23T12:00:00.000Z'
FROM directory_profiles
WHERE slug='e2e-services-detail-minimum';

INSERT INTO help_organizations (
  id, name, slug, status, short_description, description,
  city, district, region, country_code,
  published_at, archived_at, created_at, updated_at, created_by, updated_by
) VALUES (
  991201,
  'REVIEWS-2B E2E organizácia',
  'reviews-2b-e2e-organizacia',
  'PUBLISHED',
  'Izolovaný profil pre review submission E2E.',
  'Tento profil existuje iba v lokálnom CI prostredí REVIEWS-2B.',
  'Nitra', 'Nitra', 'Nitriansky kraj', 'SK',
  '2026-09-23T12:00:00.000Z', NULL,
  '2026-09-23T12:00:00.000Z', '2026-09-23T12:00:00.000Z',
  'reviews-2b-e2e', 'reviews-2b-e2e'
);

INSERT INTO partner_resources (
  id, entity_type, help_organization_id, created_at, updated_at
) VALUES (
  'reviews-2b-org-resource',
  'HELP_ORGANIZATION',
  991201,
  '2026-09-23T12:00:00.000Z',
  '2026-09-23T12:00:00.000Z'
);

INSERT INTO review_authors (
  id, email_ciphertext, email_hash, display_name, status, email_verified_at,
  deactivated_at, created_at, updated_at
) VALUES
  (
    'reviews-2b-author-desktop','cipher-2b-desktop','hash-2b-desktop','Desktop reviewer',
    'ACTIVE','2026-09-23T12:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z','2026-09-23T12:00:00.000Z'
  ),
  (
    'reviews-2b-author-mobile','cipher-2b-mobile','hash-2b-mobile','Mobile reviewer',
    'ACTIVE','2026-09-23T12:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z','2026-09-23T12:00:00.000Z'
  ),
  (
    'reviews-2b-author-org','cipher-2b-org','hash-2b-org','Organization reviewer',
    'ACTIVE','2026-09-23T12:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z','2026-09-23T12:00:00.000Z'
  ),
  (
    'reviews-2b-author-already','cipher-2b-already','hash-2b-already','Already reviewer',
    'ACTIVE','2026-09-23T12:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z','2026-09-23T12:00:00.000Z'
  ),
  (
    'reviews-2b-author-suspended','cipher-2b-suspended','hash-2b-suspended','Suspended reviewer',
    'SUSPENDED','2026-09-23T12:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z','2026-09-23T12:00:00.000Z'
  );

INSERT INTO resource_management_sessions (
  id, resource_type, subject_id, session_hash, permissions_json,
  expires_at, revoked_at, created_at, last_used_at
) VALUES
  (
    'reviews-2b-session-desktop','REVIEW_AUTHOR','reviews-2b-author-desktop',
    'LUNUk-uYLO65K5BBSz7WvWm4-FDgZUPPNoo0Yr8rpDA','[]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  ),
  (
    'reviews-2b-session-mobile','REVIEW_AUTHOR','reviews-2b-author-mobile',
    'hPgwWjEEVyRRS7yGBpyrv9uWkbWMxx0bip14SV_e_98','[]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  ),
  (
    'reviews-2b-session-org','REVIEW_AUTHOR','reviews-2b-author-org',
    'FhwutWPPvPVCAF2dfN9dNa7atNHYJNSNYJOzz00czSQ','[]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  ),
  (
    'reviews-2b-session-already','REVIEW_AUTHOR','reviews-2b-author-already',
    'KTEp6njWdkRQhAPJM2b4azvgj16jKtC6pfYqgUqbLcA','[]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  ),
  (
    'reviews-2b-session-suspended','REVIEW_AUTHOR','reviews-2b-author-suspended',
    'o5R1rNap8NHf7Mksd9oWzrsCZ0EVsj-TuKjXIaNCWgc','[]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  ),
  (
    'reviews-2b-partner-session','PARTNER_ACCOUNT','reviews-2b-partner-account',
    'hi6uumJ1m2eFWbNuq3hCpbrTCCu4--eXpxuopKlRDR4','["PROFILE_EDIT"]',
    '2099-01-01T00:00:00.000Z',NULL,'2026-09-23T12:00:00.000Z',NULL
  );

INSERT INTO profile_reviews (
  id, resource_id, author_id, overall_rating, body, service_month, service_type_key,
  rating_schema_version, status, risk_flags_json, created_at, updated_at, published_at, deleted_at
) VALUES (
  'reviews-2b-existing-pending',
  'reviews-2b-directory-resource',
  'reviews-2b-author-already',
  4,
  'Táto existujúca čakajúca recenzia blokuje vytvorenie druhého canonical riadku.',
  '2026-08',
  NULL,
  1,
  'PENDING_REVIEW',
  '[]',
  '2026-09-23T12:01:00.000Z',
  '2026-09-23T12:01:00.000Z',
  NULL,
  NULL
);
