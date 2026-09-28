DELETE FROM news_tips WHERE topic = 'ADMIN_ATTENTION_E2E';

WITH RECURSIVE seq(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM seq WHERE value < 61
)
INSERT INTO news_tips (
  topic, title, summary, source_url, location, event_date,
  contact_name, contact_email, status, internal_note, consent, created_at, updated_at
)
SELECT
  'ADMIN_ATTENTION_E2E',
  printf('ATTENTION E2E %03d', value),
  'Izolovaná položka pre cursor pagination test.',
  NULL,
  '',
  NULL,
  '',
  NULL,
  'new',
  '',
  1,
  printf('2026-08-%02dT12:%02d:00.000Z', 1 + ((value - 1) % 28), (value - 1) % 60),
  printf('2026-08-%02dT12:%02d:00.000Z', 1 + ((value - 1) % 28), (value - 1) % 60)
FROM seq;

-- Simulate one unavailable canonical Attention source in isolated CI only.
DROP TABLE directory_profile_change_requests;
