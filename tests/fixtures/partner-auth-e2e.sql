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
  ('partner-e2e-token-desktop','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','PO_TqBmRyzO6HYzsigG-fUVahsjFyEHrj1duQglOVR4','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-mobile','PARTNER_ACCOUNT','partner-e2e-mobile','PARTNER_AUTH','TikQlSdjb4HFmzIXhI9scXWRRtVrr2Jz0cmpQm_OP4A','2099-01-01T00:00:00.000Z',NULL,NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-used','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','YSiA2RJTvaU23xIzDDkTlI3A73ZJt2CGHBhgRLdD4q8','2099-01-01T00:00:00.000Z','2026-09-21T20:10:00.000Z',NULL,'2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-revoked','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','udQ3riTdtQ7DDA9M-cunnEueLKP9_QUXUrvARD7EDbg','2099-01-01T00:00:00.000Z',NULL,'2026-09-21T20:10:00.000Z','2026-09-21T20:00:00.000Z'),
  ('partner-e2e-token-expired','PARTNER_ACCOUNT','partner-e2e-desktop','PARTNER_AUTH','Qt3KKtDYeCtTBCIyd-Ranyq3dM0WhlTJoo1MbYEng-c','2020-01-01T00:00:00.000Z',NULL,NULL,'2019-12-31T20:00:00.000Z');

INSERT INTO resource_management_sessions (
  id,resource_type,subject_id,session_hash,permissions_json,expires_at,revoked_at,created_at,last_used_at
) VALUES
  ('partner-e2e-session-suspended','PARTNER_ACCOUNT','partner-e2e-suspended','qTrnGnzBcp8jveMU192OB0xbE1jjAu_9dxRMFv0OPxo','[]','2099-01-01T00:00:00.000Z',NULL,'2026-09-21T20:00:00.000Z',NULL),
  ('partner-e2e-session-deactivated','PARTNER_ACCOUNT','partner-e2e-deactivated','fzA7Y4LA98VfIw5dfKZchcQKrarwwHmkMZ65-MBSvoU','[]','2099-01-01T00:00:00.000Z',NULL,'2026-09-21T20:00:00.000Z',NULL);
