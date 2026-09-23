-- PARTNER-1B disposable local E2E fixture only.
INSERT INTO partner_accounts (
  id,email_ciphertext,email_hash,status,email_verified_at,suspended_at,deactivated_at,created_at,updated_at
) VALUES
  ('partner-e2e-desktop','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-desktop-hash','PENDING_VERIFICATION',NULL,NULL,NULL,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-mobile','v1.AgMEBQYHCAkKCwwN.Ra-B23fOA1ZK3kMrW4VznNIMD5It5v3KVcvNMCAmnocPv2wxHUMYn5wBVIcm','fixture-mobile-hash','PENDING_VERIFICATION',NULL,NULL,NULL,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-suspended','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-suspended-hash','SUSPENDED','2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z',NULL,'2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-deactivated','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-deactivated-hash','DEACTIVATED','2026-09-20T20:00:00.000Z',NULL,'2026-09-21T20:00:00.000Z','2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z');

INSERT INTO resource_access_tokens (
  id,resource_type,subject_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at
) VALUES
  ('partner-e2e-token-desktop','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','EHY3YmUiE3TnWzvZ2sUSTVVudNgn37mSPa-nALXYbX8','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-desktop-retry','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','LlqYRGHsgqetWNY4jQoW3zSOiqdpEQIrkmuot6lph_Q','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-mobile','PARTNER_ACCOUNT','partner-e2e-mobile','PARTNER_AUTH','5NKdSYAZiQii_H-CIbOzFB8HaU198ItIvsbVyEKePAI','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-mobile-retry','PARTNER_ACCOUNT','partner-e2e-mobile','PARTNER_AUTH','iKbMEcjjdH3SualQ9qnALNohwnrNXV9zBRL7d9q9gUI','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-used','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','AuogV_WPn7EJbE8N1eLnOD8i9h1hBExdTYce4scsg5M','2099-01-01T00:00:00.000Z','2026-09-21T20:10:00.000Z',NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-revoked','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','IzTFUhO-VNa9iYCLZ2ht6W4ewuYHXk2lCRqWLHllH2k','2099-01-01T00:00:00.000Z',NULL,'2026-09-21T20:10:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-expired','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','TH6HfZSR2JtOfduwgUHd9RiIjJy5G7q5YARm84XUGWc','2020-01-01T00:00:00.000Z',NULL,NULL,'2019-12-31T20:00:00.000Z'),
  ('partner-e2e-token-suspended','PARTNER_ACCOUNT','partner-e2e-suspended','PARTNER_AUTH','hhZJPUR7cAZnsF5MY-p0PFMlmOmfLmVcPvTQqODVOTo','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-deactivated','PARTNER_ACCOUNT','partner-e2e-deactivated','PARTNER_AUTH','jQcYRAsddkIFmto5q0oL9Pg_lwEQplImwRcE1grckuQ','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z');

INSERT INTO directory_profiles (id,slug,name,category,status,excerpt,description,city,region,created_at,updated_at,published_at,created_by,updated_by)
VALUES (990001,'partner-e2e-veterina','Partner E2E Veterina','veterinari','published','Testovací Partner profil.','Izolovaný lokálny fixture.','Nitra','Nitriansky kraj','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','ci:partner','ci:partner');
INSERT INTO partner_resources (id,entity_type,directory_profile_id,created_at,updated_at)
VALUES ('partner-resource-e2e-directory','DIRECTORY_PROFILE',990001,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z');
INSERT INTO partner_memberships (id,account_id,resource_id,role,created_at,created_by,updated_at)
VALUES ('partner-membership-e2e-owner','partner-e2e-desktop','partner-resource-e2e-directory','OWNER','2026-09-21T20:00:00.000Z','ci:partner','2026-09-21T20:00:00.000Z');


-- PARTNER-3A Help Organization fixture: EDITOR membership, deliberately without VERIFIED trust badge.
INSERT INTO help_organizations (
  id,name,slug,legal_name,type,status,short_description,description,public_email,public_phone,
  website_url,address,city,district,region,country_code,published_at,created_at,updated_at,created_by,updated_by
) VALUES (
  990002,'Partner E2E Organizácia','partner-e2e-organizacia','Partner E2E Organizácia o.z.','CIVIC_ASSOCIATION','PUBLISHED',
  'Testovacia organizácia pre Partner E2E.','Izolovaný lokálny fixture pre moderované úpravy Partner profilu.',
  'organizacia@example.sk','+421900111222','https://example.sk','Testovacia 2','Trnava','Trnava','Trnavský kraj','SK',
  '2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','ci:partner','ci:partner'
);
INSERT INTO partner_resources (id,entity_type,help_organization_id,created_at,updated_at)
VALUES ('partner-resource-e2e-organization','HELP_ORGANIZATION',990002,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z');
INSERT INTO partner_memberships (id,account_id,resource_id,role,created_at,created_by,updated_at)
VALUES ('partner-membership-e2e-editor','partner-e2e-mobile','partner-resource-e2e-organization','EDITOR','2026-09-21T20:00:00.000Z','ci:partner','2026-09-21T20:00:00.000Z');
