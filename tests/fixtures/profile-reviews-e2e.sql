-- REVIEWS-1B public read fixtures. LOCAL/CI D1 ONLY. Never run against remote production D1.

INSERT OR IGNORE INTO partner_resources (id, entity_type, directory_profile_id, created_at, updated_at)
SELECT 'directory-profile-' || id, 'DIRECTORY_PROFILE', id, '2026-09-23T06:00:00.000Z', '2026-09-23T06:00:00.000Z'
FROM directory_profiles
WHERE slug IN ('health-fixture-vet-rich', 'e2e-services-detail-long', 'e2e-services-detail-minimum');

INSERT OR IGNORE INTO partner_resources (id, entity_type, help_organization_id, created_at, updated_at)
SELECT 'help-organization-' || id, 'HELP_ORGANIZATION', id, '2026-09-23T06:00:00.000Z', '2026-09-23T06:00:00.000Z'
FROM help_organizations
WHERE slug='e2e-organizacia';

INSERT OR REPLACE INTO review_authors (
  id, email_ciphertext, email_hash, display_name, status, email_verified_at, created_at, updated_at
) VALUES
  ('e2e-review-author-1','cipher-e2e-1','hash-e2e-1','Jana Testovacia','ACTIVE','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'),
  ('e2e-review-author-2','cipher-e2e-2','hash-e2e-2',NULL,'ACTIVE','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'),
  ('e2e-review-author-3','cipher-e2e-3','hash-e2e-3','Neverejný E2E','ACTIVE','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z');

INSERT OR REPLACE INTO partner_accounts (
  id, email_ciphertext, email_hash, status, email_verified_at, created_at, updated_at
) VALUES (
  'e2e-review-partner','partner-cipher','partner-hash','ACTIVE','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'
);

INSERT OR REPLACE INTO partner_memberships (
  id, account_id, resource_id, role, created_at, created_by, updated_at
)
SELECT
  'e2e-review-membership',
  'e2e-review-partner',
  r.id,
  'OWNER',
  '2026-09-23T06:00:00.000Z',
  'E2E_LOCAL',
  '2026-09-23T06:00:00.000Z'
FROM partner_resources r
INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich';

INSERT OR REPLACE INTO profile_reviews (
  id, resource_id, author_id, overall_rating, body, service_month, service_type_key,
  rating_schema_version, status, risk_flags_json, created_at, updated_at, published_at
)
SELECT
  'e2e-review-vet-visible-1', r.id, 'e2e-review-author-1', 5,
  'Výborná skúsenosť s profesionálnym prístupom a zrozumiteľnou komunikáciou.',
  '2026-08', NULL, 1, 'VISIBLE', '[]',
  '2026-09-20T08:00:00.000Z','2026-09-20T08:00:00.000Z','2026-09-20T09:00:00.000Z'
FROM partner_resources r INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich'
UNION ALL
SELECT
  'e2e-review-vet-visible-2', r.id, 'e2e-review-author-2', 4,
  'Bezpečný text <script>alert(1)</script> a veľmi dlhý reťazec https://example.invalid/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa zostávajú obyčajným textom.',
  '2026-09', 'raw-unknown-service-key', 1, 'VISIBLE', '[]',
  '2026-09-21T08:00:00.000Z','2026-09-21T08:00:00.000Z','2026-09-21T09:00:00.000Z'
FROM partner_resources r INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich'
UNION ALL
SELECT
  'e2e-review-vet-hidden', r.id, 'e2e-review-author-3', 1,
  'Táto skrytá recenzia sa na verejnom profile nesmie zobraziť.',
  NULL, NULL, 1, 'HIDDEN', '[]',
  '2026-09-22T08:00:00.000Z','2026-09-22T08:00:00.000Z',NULL
FROM partner_resources r INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich'
UNION ALL
SELECT
  'e2e-review-vet-pending', r.id, 'e2e-review-author-3', 1,
  'Táto čakajúca recenzia sa na verejnom profile nesmie zobraziť.',
  NULL, NULL, 1, 'PENDING_REVIEW', '[]',
  '2026-09-22T09:00:00.000Z','2026-09-22T09:00:00.000Z',NULL
FROM partner_resources r INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich'
UNION ALL
SELECT
  'e2e-review-trainer-visible', r.id, 'e2e-review-author-1', 4,
  'Tréning bol zrozumiteľný a prístup ku psovi bol pokojný a praktický.',
  '2026-07', NULL, 1, 'VISIBLE', '[]',
  '2026-09-19T08:00:00.000Z','2026-09-19T08:00:00.000Z','2026-09-19T09:00:00.000Z'
FROM partner_resources r INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='e2e-services-detail-long'
UNION ALL
SELECT
  'e2e-review-org-visible', r.id, 'e2e-review-author-1', 5,
  'Organizácia komunikovala jasne a pomoc bola zorganizovaná veľmi dobre.',
  '2026-06', NULL, 1, 'VISIBLE', '[]',
  '2026-09-18T08:00:00.000Z','2026-09-18T08:00:00.000Z','2026-09-18T09:00:00.000Z'
FROM partner_resources r INNER JOIN help_organizations o ON o.id=r.help_organization_id
WHERE o.slug='e2e-organizacia';

INSERT OR REPLACE INTO profile_review_rating_values (
  id, review_id, dimension_key, value, created_at, updated_at
) VALUES
  ('e2e-dim-v1-a','e2e-review-vet-visible-1','approach',5,'2026-09-20T08:00:00.000Z','2026-09-20T08:00:00.000Z'),
  ('e2e-dim-v1-c','e2e-review-vet-visible-1','communication',5,'2026-09-20T08:00:00.000Z','2026-09-20T08:00:00.000Z'),
  ('e2e-dim-v1-q','e2e-review-vet-visible-1','care_quality',5,'2026-09-20T08:00:00.000Z','2026-09-20T08:00:00.000Z'),
  ('e2e-dim-v2-a','e2e-review-vet-visible-2','approach',4,'2026-09-21T08:00:00.000Z','2026-09-21T08:00:00.000Z'),
  ('e2e-dim-v2-c','e2e-review-vet-visible-2','communication',4,'2026-09-21T08:00:00.000Z','2026-09-21T08:00:00.000Z'),
  ('e2e-dim-v2-q','e2e-review-vet-visible-2','care_quality',4,'2026-09-21T08:00:00.000Z','2026-09-21T08:00:00.000Z'),
  ('e2e-dim-hidden','e2e-review-vet-hidden','approach',1,'2026-09-22T08:00:00.000Z','2026-09-22T08:00:00.000Z'),
  ('e2e-dim-trainer-a','e2e-review-trainer-visible','approach',4,'2026-09-19T08:00:00.000Z','2026-09-19T08:00:00.000Z'),
  ('e2e-dim-trainer-c','e2e-review-trainer-visible','communication',4,'2026-09-19T08:00:00.000Z','2026-09-19T08:00:00.000Z'),
  ('e2e-dim-trainer-q','e2e-review-trainer-visible','training_quality',5,'2026-09-19T08:00:00.000Z','2026-09-19T08:00:00.000Z'),
  ('e2e-dim-org-c','e2e-review-org-visible','communication',5,'2026-09-18T08:00:00.000Z','2026-09-18T08:00:00.000Z'),
  ('e2e-dim-org-q','e2e-review-org-visible','service_quality',5,'2026-09-18T08:00:00.000Z','2026-09-18T08:00:00.000Z');

INSERT OR REPLACE INTO profile_review_provider_replies (
  id, review_id, partner_account_id, partner_membership_id, body, status, created_at, updated_at
) VALUES
  ('e2e-reply-visible','e2e-review-vet-visible-1','e2e-review-partner','e2e-review-membership',
   'Ďakujeme za spätnú väzbu a dôveru.','VISIBLE','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z'),
  ('e2e-reply-hidden','e2e-review-vet-visible-2','e2e-review-partner','e2e-review-membership',
   'Táto skrytá odpoveď sa nesmie zobraziť.','HIDDEN','2026-09-21T12:00:00.000Z','2026-09-21T12:00:00.000Z');

INSERT OR REPLACE INTO profile_review_helpful_votes (id, review_id, author_id, created_at) VALUES
  ('e2e-helpful-1','e2e-review-vet-visible-1','e2e-review-author-2','2026-09-22T10:00:00.000Z'),
  ('e2e-helpful-2','e2e-review-vet-visible-1','e2e-review-author-3','2026-09-22T11:00:00.000Z');
