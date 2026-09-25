-- PARTNER-1B disposable local E2E fixture only.
INSERT INTO partner_accounts (
  id,email_ciphertext,email_hash,status,email_verified_at,suspended_at,deactivated_at,created_at,updated_at
) VALUES
  ('partner-e2e-desktop','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-desktop-hash','PENDING_VERIFICATION',NULL,NULL,NULL,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-mobile','v1.AgMEBQYHCAkKCwwN.Ra-B23fOA1ZK3kMrW4VznNIMD5It5v3KVcvNMCAmnocPv2wxHUMYn5wBVIcm','fixture-mobile-hash','PENDING_VERIFICATION',NULL,NULL,NULL,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-suspended','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-suspended-hash','SUSPENDED','2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z',NULL,'2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-deactivated','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','fixture-deactivated-hash','DEACTIVATED','2026-09-20T20:00:00.000Z',NULL,'2026-09-21T20:00:00.000Z','2026-09-20T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-admin-self','v1.AQIDBAUGBwgJCgsM.foljWk6Zj5pn9Emm92WBSuHUZfTa_WFZb0iSJiQFwdd3DzoDgvWpd_ptLvdX6w','WyejHJCyTx3hOPwwfARTlIgm-O6c4Wzf_R7MeOZkSyg','ACTIVE','2026-09-21T20:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z');

INSERT INTO resource_access_tokens (
  id,resource_type,subject_id,purpose,token_hash,expires_at,used_at,revoked_at,created_at
) VALUES
  ('partner-e2e-token-desktop','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','EHY3YmUiE3TnWzvZ2sUSTVVudNgn37mSPa-nALXYbX8','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-mobile','PARTNER_ACCOUNT','partner-e2e-mobile','PARTNER_AUTH','5NKdSYAZiQii_H-CIbOzFB8HaU198ItIvsbVyEKePAI','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
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


-- PARTNER-5 commercial public rendering fixtures.
INSERT INTO partner_commercial_agreements
  (id,interest_id,account_id,resource_id,agreement_type,status,payment_method,payment_status,price_cents,currency,start_at,end_at,partner_note,payment_instruction,admin_note,paid_at,paid_by,created_at,updated_at,created_by,updated_by)
VALUES
  ('partner-e2e-agreement-premium',NULL,'partner-e2e-desktop','partner-resource-e2e-directory','PREMIUM_PROFILE','ACTIVE','BANK_TRANSFER','PAID',9900,'EUR','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z','Premium E2E',NULL,'internal','2026-01-01T00:00:00.000Z','admin:e2e','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin:e2e','admin:e2e'),
  ('partner-e2e-agreement-promoted',NULL,'partner-e2e-desktop','partner-resource-e2e-directory','PROMOTED_PROFILE','ACTIVE','BY_AGREEMENT','WAIVED',14900,'EUR','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z','Promoted E2E',NULL,'internal',NULL,NULL,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin:e2e','admin:e2e');

INSERT INTO monetization_promotions
  (id,entity_type,entity_id,status,start_at,end_at,label,priority,provenance,admin_note,created_at,updated_at,created_by,updated_by)
VALUES
  ('partner-e2e-promotion','directory','990001','active','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z','Sponzorované',0,'partner-agreement:partner-e2e-agreement-promoted','', '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin:e2e','admin:e2e');

INSERT INTO partner_entitlements
  (id,account_id,resource_id,agreement_id,entitlement_type,status,start_at,end_at,promotion_id,created_at,updated_at,activated_at,activated_by)
VALUES
  ('partner-e2e-entitlement-premium','partner-e2e-desktop','partner-resource-e2e-directory','partner-e2e-agreement-premium','PREMIUM_PROFILE','ACTIVE','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',NULL,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin:e2e'),
  ('partner-e2e-entitlement-promoted','partner-e2e-desktop','partner-resource-e2e-directory','partner-e2e-agreement-promoted','PROMOTED_PROFILE','ACTIVE','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z','partner-e2e-promotion','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','admin:e2e');


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

INSERT INTO directory_profiles (
  id,slug,name,category,status,excerpt,description,city,region,created_at,updated_at,published_at,created_by,updated_by
) VALUES (
  990007,'partner-h5-self-approval-profil','Partner H5 Self Approval Profil','veterinari','published',
  'Izolovaný H5 profil pre self-approval guard.',
  'Izolovaný H5 canonical profil určený iba pre overenie self-approval bezpečnostného guardu.',
  'Nitra','Nitriansky kraj',
  '2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','ci:h5','ci:h5'
);
INSERT INTO partner_resources (id,entity_type,directory_profile_id,created_at,updated_at)
VALUES ('partner-resource-e2e-admin-self-target','DIRECTORY_PROFILE',990007,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z');
INSERT INTO partner_memberships (id,account_id,resource_id,role,created_at,created_by,updated_at)
VALUES ('partner-membership-e2e-admin-self','partner-e2e-admin-self','partner-resource-e2e-admin-self-target','OWNER','2026-09-21T20:00:00.000Z','ci:partner','2026-09-21T20:00:00.000Z');

-- PARTNER-H5 moderation-integrity fixtures. The account hash maps preview@psipedia.local
-- to the CI-only PII_HASH_KEY configured by the Partner workflow.
INSERT INTO partner_claims (
  id,account_id,resource_id,status,request_message,created_at,updated_at
) VALUES (
  'partner-e2e-self-claim','partner-e2e-admin-self','partner-resource-e2e-directory','PENDING',
  'E2E self-approval guard claim','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'
);
INSERT INTO partner_resource_verifications (
  id,account_id,resource_id,status,request_note,created_at,updated_at,submitted_at
) VALUES (
  'partner-e2e-self-verification','partner-e2e-admin-self','partner-resource-e2e-admin-self-target','PENDING_VERIFICATION',
  'E2E self-approval guard verification','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'
);


-- PARTNER-4 event fixtures: one published OWNER event and one draft EDITOR event.
INSERT INTO managed_events (
  id,slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,venue,city,region,address,
  organizer,description,practical_info,website_url,registration_url,image_url,image_key,cancelled,seo_json,
  created_at,updated_at,published_at,created_by,updated_by
) VALUES
  (
    990003,'partner-e2e-publikovane-podujatie','Partner E2E Publikované Podujatie',
    'Publikované testovacie podujatie pre Partner E2E.','Seminár','published','2099-11-10','10:00','2099-11-10','16:00',
    'Areál Desktop','Nitra','Nitriansky kraj','Testovacia 3','Psipedia E2E',
    'Izolovaný publikovaný fixture event pre moderované Partner úpravy.','Registrácia vopred.',
    'https://example.sk/event-desktop','https://example.sk/event-desktop/register',NULL,NULL,0,'{}',
    '2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z','ci:partner','ci:partner'
  ),
  (
    990004,'partner-e2e-koncept-podujatie','Partner E2E Koncept Podujatie',
    'Koncept testovacieho podujatia pre Partner E2E.','Tréning','draft','2099-11-11','11:00','2099-11-11','15:00',
    'Areál Mobile','Trnava','Trnavský kraj','Testovacia 4','Psipedia E2E',
    'Izolovaný draft fixture event pre moderované Partner úpravy.','Prineste si vôdzku.',
    'https://example.sk/event-mobile','https://example.sk/event-mobile/register',NULL,NULL,0,'{}',
    '2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z',NULL,'ci:partner','ci:partner'
  );

INSERT INTO partner_resources (id,entity_type,managed_event_id,created_at,updated_at) VALUES
  ('partner-resource-e2e-event-desktop','MANAGED_EVENT',990003,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-resource-e2e-event-mobile','MANAGED_EVENT',990004,'2026-09-21T20:00:00.000Z','2026-09-21T20:00:00.000Z');

INSERT INTO partner_memberships (id,account_id,resource_id,role,created_at,created_by,updated_at) VALUES
  ('partner-membership-e2e-event-owner','partner-e2e-desktop','partner-resource-e2e-event-desktop','OWNER','2026-09-21T20:00:00.000Z','ci:partner','2026-09-21T20:00:00.000Z'),
  ('partner-membership-e2e-event-editor','partner-e2e-mobile','partner-resource-e2e-event-mobile','EDITOR','2026-09-21T20:00:00.000Z','ci:partner','2026-09-21T20:00:00.000Z');

-- PARTNER-H5 isolated stale-approval fixtures. These deliberately use separate canonical
-- resources so stale-rejection tests do not contaminate the normal successful Partner E2E flow.
INSERT INTO directory_profiles (
  id,slug,name,category,status,excerpt,description,city,district,region,created_at,updated_at,published_at,created_by,updated_by
) VALUES (
  990005,'partner-h5-stale-profil','Partner H5 Stale Profil','veterinari','published',
  'Izolovaný H5 profil pre stale approval.',
  'Izolovaný H5 canonical profil určený iba pre stale approval E2E overenie.',
  'Nitra','Nitra','Nitriansky kraj',
  '2026-09-21T19:00:00.000Z','2026-09-21T19:00:00.000Z','2026-09-21T19:00:00.000Z','ci:h5','ci:h5'
);
INSERT INTO partner_resources (id,entity_type,directory_profile_id,created_at,updated_at)
VALUES ('partner-resource-e2e-h5-stale-profile','DIRECTORY_PROFILE',990005,'2026-09-21T19:00:00.000Z','2026-09-21T19:00:00.000Z');

INSERT INTO moderation_submissions (
  id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,
  proposed_patch_json,risk_flags_json,created_at,updated_at
) VALUES (
  'partner-e2e-h5-stale-profile-change','DIRECTORY_PROFILE','990005','UPDATE','PENDING_REVIEW',
  'PARTNER_ACCOUNT','partner-e2e-desktop','{"city":"Trnava","district":"Trnava","region":"Trnavský kraj"}','[]',
  '2026-09-21T19:05:00.000Z','2026-09-21T19:05:00.000Z'
);
INSERT INTO partner_profile_change_metadata (
  submission_id,partner_resource_id,partner_account_id,base_updated_at,base_snapshot_json,
  changed_field_count,dedupe_active,created_at
) VALUES (
  'partner-e2e-h5-stale-profile-change','partner-resource-e2e-h5-stale-profile','partner-e2e-desktop',
  '2026-09-21T19:00:00.000Z',
  '{"name":"Partner H5 Stale Profil","excerpt":"Izolovaný H5 profil pre stale approval.","description":"Izolovaný H5 canonical profil určený iba pre stale approval E2E overenie.","services":[],"qualifications":[],"city":"Nitra","district":"Nitra","region":"Nitriansky kraj","address":"","online":false,"priceNote":"","websiteUrl":"","publicPhone":"","publicEmail":"","facebookUrl":"","instagramUrl":""}',
  3,1,'2026-09-21T19:05:00.000Z'
);

INSERT INTO managed_events (
  id,slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,venue,city,region,address,
  organizer,description,practical_info,website_url,registration_url,image_url,image_key,cancelled,seo_json,
  created_at,updated_at,published_at,created_by,updated_by
) VALUES (
  990006,'partner-h5-stale-podujatie','Partner H5 Stale Podujatie',
  'Izolované H5 podujatie pre stale approval.','Seminár','draft','2099-12-20','10:00','2099-12-20','16:00',
  'Areál H5','Nitra','Nitriansky kraj','Stale 1','Psipedia H5',
  'Izolovaný H5 canonical event určený iba pre stale approval E2E overenie.','Registrácia vopred.',
  NULL,NULL,NULL,NULL,0,'{}',
  '2026-09-21T19:00:00.000Z','2026-09-21T19:00:00.000Z',NULL,'ci:h5','ci:h5'
);
INSERT INTO partner_resources (id,entity_type,managed_event_id,created_at,updated_at)
VALUES ('partner-resource-e2e-h5-stale-event','MANAGED_EVENT',990006,'2026-09-21T19:00:00.000Z','2026-09-21T19:00:00.000Z');

INSERT INTO moderation_submissions (
  id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,
  proposed_patch_json,risk_flags_json,created_at,updated_at
) VALUES (
  'partner-e2e-h5-stale-event-change','MANAGED_EVENT','990006','UPDATE','PENDING_REVIEW',
  'PARTNER_ACCOUNT','partner-e2e-desktop','{"venue":"Areál H5 Navrhovaný"}','[]',
  '2026-09-21T19:05:00.000Z','2026-09-21T19:05:00.000Z'
);
INSERT INTO partner_event_submission_metadata (
  submission_id,partner_account_id,partner_resource_id,operation,display_title,base_updated_at,
  base_snapshot_json,changed_field_count,dedupe_key,dedupe_active,duplicate_confidence,
  duplicate_reasons_json,created_at
) VALUES (
  'partner-e2e-h5-stale-event-change','partner-e2e-desktop','partner-resource-e2e-h5-stale-event','UPDATE',
  'Partner H5 Stale Podujatie','2026-09-21T19:00:00.000Z',
  '{"title":"Partner H5 Stale Podujatie","excerpt":"Izolované H5 podujatie pre stale approval.","eventType":"Seminár","startDate":"2099-12-20","startTime":"10:00","endDate":"2099-12-20","endTime":"16:00","venue":"Areál H5","city":"Nitra","region":"Nitriansky kraj","address":"Stale 1","organizer":"Psipedia H5","description":"Izolovaný H5 canonical event určený iba pre stale approval E2E overenie.","practicalInfo":"Registrácia vopred.","websiteUrl":null,"registrationUrl":null,"cancelled":false}',
  1,'UPDATE:partner-resource-e2e-h5-stale-event',1,'NONE','[]','2026-09-21T19:05:00.000Z'
);
