-- Isolated E2E seed; timestamps stay in the future even as CI calendar dates advance.
DELETE FROM managed_articles WHERE id IN (974101, 974102, 974103);

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
) VALUES
(
  974101, 'editorial-calendar-e2e-scheduled-a', 'CALENDAR E2E scheduled A',
  'Izolovaný článok pre test bezpečného preplánovania cez redakčný kalendár.',
  'Život so psom', 'clanky', 'scheduled', 'forest', 'Redakcia Psipedia',
  'Tento článok testuje zmenu termínu publikovania v kalendári bez zásahu do zvyšku obsahu.', '',
  '[{"heading":"Kalendár","paragraphs":["Tento text zostáva rovnaký aj po zmene dátumu v kalendári."],"bullets":[]}]',
  '[]', '[]', 4,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days'),
  'ci:editorial-calendar', 'ci:editorial-calendar'
),
(
  974102, 'editorial-calendar-e2e-scheduled-b', 'CALENDAR E2E scheduled B',
  'Izolovaný druhý článok pre overenie viacerých naplánovaných položiek v jednom dni.',
  'Život so psom', 'clanky', 'scheduled', 'forest', 'Redakcia Psipedia',
  'Tento článok pomáha overiť otvorenie konkrétnej položky cez detail spoločného dňa.', '',
  '[{"heading":"Viac článkov","paragraphs":["Druhý článok sa nezmení pri preplánovaní prvého."],"bullets":[]}]',
  '[]', '[]', 4,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days','+15 minutes'),
  'ci:editorial-calendar', 'ci:editorial-calendar'
),
(
  974103, 'editorial-calendar-e2e-published', 'CALENDAR E2E published',
  'Izolovaný publikovaný článok pre test ochrany dátumu publikovania pred preplánovaním.',
  'Život so psom', 'clanky', 'published', 'forest', 'Redakcia Psipedia',
  'Publikovaný článok má v kalendári zostať iba na čítanie a neponúknuť preplánovanie.', '',
  '[{"heading":"Publikované","paragraphs":["Zmena termínu publikovaných článkov je mimo tohto workflowu."],"bullets":[]}]',
  '[]', '[]', 4,
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  'ci:editorial-calendar', 'ci:editorial-calendar'
);
