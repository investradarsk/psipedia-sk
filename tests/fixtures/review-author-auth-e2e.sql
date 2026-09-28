-- REVIEWS-2A disposable local E2E fixture only. Never run against remote production D1.

INSERT OR IGNORE INTO partner_resources (id,entity_type,directory_profile_id,created_at,updated_at)
SELECT
  'directory-profile-' || id,
  'DIRECTORY_PROFILE',
  id,
  '2026-09-23T06:00:00.000Z',
  '2026-09-23T06:00:00.000Z'
FROM directory_profiles
WHERE slug='e2e-services-detail-minimum';


INSERT INTO review_authors (
  id,email_ciphertext,email_hash,display_name,status,email_verified_at,deactivated_at,created_at,updated_at
) VALUES
  ('review-e2e-desktop','fixture-cipher-desktop','fixture-review-desktop',NULL,'PENDING_VERIFICATION',NULL,NULL,'2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'),
  ('review-e2e-mobile','fixture-cipher-mobile','fixture-review-mobile',NULL,'PENDING_VERIFICATION',NULL,NULL,'2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'),
  ('review-e2e-used','fixture-cipher-used','fixture-review-used','Used reviewer','ACTIVE','2026-09-22T06:00:00.000Z',NULL,'2026-09-22T06:00:00.000Z','2026-09-22T06:00:00.000Z'),
  ('review-e2e-expired','fixture-cipher-expired','fixture-review-expired','Expired reviewer','ACTIVE','2026-09-22T06:00:00.000Z',NULL,'2026-09-22T06:00:00.000Z','2026-09-22T06:00:00.000Z'),
  ('review-e2e-suspended','fixture-cipher-suspended','fixture-review-suspended','Suspended reviewer','SUSPENDED','2026-09-22T06:00:00.000Z',NULL,'2026-09-22T06:00:00.000Z','2026-09-22T06:00:00.000Z'),
  ('review-e2e-openredirect','fixture-cipher-open','fixture-review-open',NULL,'PENDING_VERIFICATION',NULL,NULL,'2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z'),
  ('review-e2e-logout','fixture-cipher-logout','fixture-review-logout',NULL,'PENDING_VERIFICATION',NULL,NULL,'2026-09-23T06:00:00.000Z','2026-09-23T06:00:00.000Z');

INSERT INTO resource_access_tokens (
  id,resource_type,subject_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at
) VALUES
  ('review-e2e-token-desktop','REVIEW_AUTHOR','review-e2e-desktop','REVIEW_AUTHOR_AUTH','T6Hs2JKS0Wa2gufQ9ngkbUwIxRw8SnFyMe0PaTUzkEI','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-23T06:00:00.000Z'),
  ('review-e2e-token-mobile','REVIEW_AUTHOR','review-e2e-mobile','REVIEW_AUTHOR_AUTH','iu6wB0w6d2ZLC0ezJZz17jtECqRa7cO0Jk7aSBpzpW8','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-23T06:00:00.000Z'),
  ('review-e2e-token-used','REVIEW_AUTHOR','review-e2e-used','REVIEW_AUTHOR_AUTH','I4BQpHtC7bbVErysJ1XOhe4-EwsSVQTdMdEyfVQyodI','2099-01-01T00:00:00.000Z','2026-09-23T06:10:00.000Z',NULL,'2026-09-23T06:00:00.000Z'),
  ('review-e2e-token-expired','REVIEW_AUTHOR','review-e2e-expired','REVIEW_AUTHOR_AUTH','7bdssOfIIUxMHIkstXVlJ4vDgV5xsm4drgNVd1LvXt4','2020-01-01T00:00:00.000Z',NULL,NULL,'2019-12-31T20:00:00.000Z'),
  ('review-e2e-token-suspended','REVIEW_AUTHOR','review-e2e-suspended','REVIEW_AUTHOR_AUTH','YWOpXfWOJxGY2FoUORx03Dk9-cUj1dzSXuiJ0538ziE','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-23T06:00:00.000Z'),
  ('review-e2e-token-openredirect','REVIEW_AUTHOR','review-e2e-openredirect','REVIEW_AUTHOR_AUTH','gMePSZIsTfIQv76W_R1uvPo9WfOn8IFQnPuIdv_WbkE','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-23T06:00:00.000Z'),
  ('review-e2e-token-logout','REVIEW_AUTHOR','review-e2e-logout','REVIEW_AUTHOR_AUTH','swYgtWmlrGSPtw-IDh67dRuID8HiS4nCHfzfOIyneAY','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-23T06:00:00.000Z');
