INSERT INTO outreach_campaigns (
  id,name,purpose,status,selection_json,subject_template,body_template,provider_key,
  selected_entity_count,unique_recipient_count,deduplicated_count,suppressed_count,invalid_email_count,
  previewed_at,prepared_at,created_at,updated_at,created_by,updated_by
) VALUES (
  'e2e-campaign','E2E verification','PROFILE_VERIFICATION','READY','{}',
  'Prosba o kontrolu profilu na Psipedia.sk','Test body','','1','1','0','0','0',
  '2026-09-20T18:00:00.000Z','2026-09-20T18:01:00.000Z','2026-09-20T18:00:00.000Z',
  '2026-09-20T18:01:00.000Z','e2e@psipedia.local','e2e@psipedia.local'
);

INSERT INTO outreach_recipients (
  id,campaign_id,recipient_email,normalized_email,send_state,attempts,created_at,updated_at
) VALUES (
  'e2e-recipient','e2e-campaign','owner@example.sk','owner@example.sk','QUEUED',0,
  '2026-09-20T18:01:00.000Z','2026-09-20T18:01:00.000Z'
);

INSERT INTO outreach_recipient_entities (
  recipient_id,entity_type,entity_id,entity_name,profile_url,region,public_snapshot_json
) VALUES (
  'e2e-recipient','HELP_ORGANIZATION','101','Ukážková organizácia',
  'https://psipedia.sk/organizacie/ukazkova-organizacia','Nitriansky kraj',
  '{"name":"Ukážková organizácia","city":"Nitra","region":"Nitriansky kraj","publicEmail":"owner@example.sk"}'
);

INSERT INTO outreach_claim_tokens (
  id,recipient_id,purpose,token_hash,expires_at,created_at
) VALUES (
  'e2e-verify-token','e2e-recipient','VERIFY',
  'j3Z0Idlgd22SkWu7mk_UJP2nvSePZkfYTft8piPYBJM','2099-01-01T00:00:00.000Z','2026-09-20T18:01:00.000Z'
);
INSERT INTO outreach_claim_tokens (
  id,recipient_id,purpose,token_hash,expires_at,created_at
) VALUES (
  'e2e-unsubscribe-token','e2e-recipient','UNSUBSCRIBE',
  'DAcF4fSWiZ11JjhvrB_l2jlZyWWxpj9z21e8A9tjRnQ','2099-01-01T00:00:00.000Z','2026-09-20T18:01:00.000Z'
);
