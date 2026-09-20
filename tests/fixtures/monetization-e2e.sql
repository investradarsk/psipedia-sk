INSERT INTO monetization_campaigns (
  id, name, advertiser_name, status, start_at, end_at,
  creative_image_url, creative_alt, headline, body_copy, destination_url,
  priority, is_affiliate, admin_note, created_at, updated_at, created_by, updated_by
) VALUES (
  'e2e-monetization-global-bottom',
  'CI monetization fixture',
  'CI fixture only',
  'active',
  NULL,
  NULL,
  '/images/hero-labrador.webp',
  'Ilustračný E2E reklamný creative',
  'Test reklamného placementu',
  'Tento creative existuje iba v izolovanom E2E prostredí.',
  'https://example.invalid/psipedia-monetization-test',
  10,
  0,
  'E2E only',
  '2026-09-20T16:00:00.000Z',
  '2026-09-20T16:00:00.000Z',
  'e2e',
  'e2e'
);

INSERT INTO monetization_campaign_placements (campaign_id, placement_id, created_at)
VALUES ('e2e-monetization-global-bottom', 'global_bottom', '2026-09-20T16:00:00.000Z');
