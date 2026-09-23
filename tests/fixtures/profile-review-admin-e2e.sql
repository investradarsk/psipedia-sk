-- REVIEWS-3 disposable local E2E fixture only. Never run against remote production D1.

INSERT OR REPLACE INTO review_authors (
  id, email_ciphertext, email_hash, display_name, status, email_verified_at,
  deactivated_at, created_at, updated_at
) VALUES (
  'e2e-review-admin-risk-author',
  'cipher-review-admin-risk',
  'hash-review-admin-risk',
  'Risk reviewer',
  'ACTIVE',
  '2026-09-23T16:00:00.000Z',
  NULL,
  '2026-09-23T16:00:00.000Z',
  '2026-09-23T16:00:00.000Z'
);

INSERT OR REPLACE INTO profile_reviews (
  id, resource_id, author_id, overall_rating, body, service_month, service_type_key,
  rating_schema_version, status, risk_flags_json, created_at, updated_at, published_at, deleted_at
)
SELECT
  'e2e-review-admin-risk-pending',
  r.id,
  'e2e-review-admin-risk-author',
  2,
  'Táto testovacia recenzia obsahuje viacero odkazov https://one.invalid https://two.invalid https://three.invalid a čaká na zamietnutie.',
  '2026-09',
  NULL,
  1,
  'PENDING_REVIEW',
  '["EXCESSIVE_URLS"]',
  '2026-09-23T16:10:00.000Z',
  '2026-09-23T16:10:00.000Z',
  NULL,
  NULL
FROM partner_resources r
INNER JOIN directory_profiles d ON d.id=r.directory_profile_id
WHERE d.slug='health-fixture-vet-rich';

INSERT OR REPLACE INTO profile_review_rating_values (
  id, review_id, dimension_key, value, created_at, updated_at
) VALUES
  ('e2e-review-admin-risk-dim-a','e2e-review-admin-risk-pending','approach',2,'2026-09-23T16:10:00.000Z','2026-09-23T16:10:00.000Z'),
  ('e2e-review-admin-risk-dim-c','e2e-review-admin-risk-pending','communication',2,'2026-09-23T16:10:00.000Z','2026-09-23T16:10:00.000Z');

INSERT OR REPLACE INTO profile_review_reports (
  id, review_id, provider_reply_id, target_type, reporter_type,
  review_author_id, partner_account_id, reason_code, detail, status,
  resolved_by, resolved_at, created_at, updated_at
) VALUES (
  'e2e-review-admin-report',
  'e2e-review-admin-risk-pending',
  NULL,
  'REVIEW',
  'PARTNER',
  NULL,
  'e2e-review-partner',
  'OTHER',
  'E2E report summary fixture.',
  'OPEN',
  NULL,
  NULL,
  '2026-09-23T16:11:00.000Z',
  '2026-09-23T16:11:00.000Z'
);

INSERT OR REPLACE INTO moderation_events (
  id, submission_id, resource_type, subject_id, action, actor_type, actor_ref,
  from_status, to_status, reason_code, changed_fields_json, request_id, created_at
) VALUES (
  'e2e-review-admin-submit-event',
  NULL,
  'PROFILE_REVIEW',
  'e2e-review-admin-risk-pending',
  'SUBMITTED',
  'REVIEW_AUTHOR',
  'e2e-review-admin-risk-author',
  NULL,
  'PENDING_REVIEW',
  NULL,
  '["overall_rating","body","service_month","rating_dimensions"]',
  'e2e-review-admin-request',
  '2026-09-23T16:10:00.000Z'
);
