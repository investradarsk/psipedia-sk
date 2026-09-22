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
  ('partner-e2e-token-mobile','PARTNER_ACCOUNT','partner-e2e-mobile','PARTNER_AUTH','5NKdSYAZiQii_H-CIbOzFB8HaU198ItIvsbVyEKePAI','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-used','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','AuogV_WPn7EJbE8N1eLnOD8i9h1hBExdTYce4scsg5M','2099-01-01T00:00:00.000Z','2026-09-21T20:10:00.000Z',NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-revoked','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','IzTFUhO-VNa9iYCLZ2ht6W4ewuYHXk2lCRqWLHllH2k','2099-01-01T00:00:00.000Z',NULL,'2026-09-21T20:10:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-expired','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','TH6HfZSR2JtOfduwgUHd9RiIjJy5G7q5YARm84XUGWc','2020-01-01T00:00:00.000Z',NULL,NULL,'2019-12-31T20:00:00.000Z'),
  ('partner-e2e-token-suspended','PARTNER_ACCOUNT','partner-e2e-suspended','PARTNER_AUTH','hhZJPUR7cAZnsF5MY-p0PFMlmOmfLmVcPvTQqODVOTo','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-deactivated','PARTNER_ACCOUNT','partner-e2e-deactivated','PARTNER_AUTH','jQcYRAsddkIFmto5q0oL9Pg_lwEQplImwRcE1grckuQ','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z');
