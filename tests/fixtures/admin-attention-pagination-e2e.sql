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


-- Keep one deterministic AUTOMATION_ACTION row available. This catches production-style
-- failures where the whole automation Attention source becomes unavailable.
DELETE FROM automation_source_candidates
WHERE canonical_url = 'https://attention-e2e.example/events';

INSERT INTO automation_source_candidates (
  discovery_type, source_url, canonical_url, label, entity_type, suggested_connector_type,
  discovered_from_source_id, reason, metadata_json, duplicate_source_id, review_status,
  reviewer_notes, reviewed_by, reviewed_at, suppressed_until, first_detected_at, last_detected_at
) VALUES (
  'SEARCH_PROVIDER',
  'https://attention-e2e.example/events',
  'https://attention-e2e.example/events',
  'Attention E2E event source',
  'EVENT',
  'CONTROLLED_HTML',
  NULL,
  'Isolated fixture for AUTOMATION_ACTION availability.',
  '{}',
  NULL,
  'NEW',
  NULL,
  NULL,
  NULL,
  NULL,
  '2026-09-15T09:00:00.000Z',
  '2026-09-15T09:00:00.000Z'
);
