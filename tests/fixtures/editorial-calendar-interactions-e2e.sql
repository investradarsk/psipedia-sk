-- Isolated E2E seed; timestamps stay in the future even as CI calendar dates advance.
DELETE FROM managed_articles WHERE id IN (974101, 974102, 974103, 974104, 974105, 974106, 974107);

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
  '[]', '[]', '[{"id":"fixture-h2-0","type":"h2","text":"Kalendár"},{"id":"fixture-text-0-0","type":"text","content":"Tento text zostáva rovnaký aj po zmene dátumu v kalendári."}]', 4,
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
  '[]', '[]', '[{"id":"fixture-h2-0","type":"h2","text":"Viac článkov"},{"id":"fixture-text-0-0","type":"text","content":"Druhý článok sa nezmení pri preplánovaní prvého."}]', 4,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days'),
  'ci:editorial-calendar', 'ci:editorial-calendar'
),
(
  974103, 'editorial-calendar-e2e-published', 'CALENDAR E2E published',
  'Izolovaný publikovaný článok pre test ochrany dátumu publikovania pred preplánovaním.',
  'Život so psom', 'clanky', 'published', 'forest', 'Redakcia Psipedia',
  'Publikovaný článok má v kalendári zostať iba na čítanie a neponúknuť preplánovanie.', '',
  '[]', '[]', '[{"id":"fixture-h2-0","type":"h2","text":"Publikované"},{"id":"fixture-text-0-0","type":"text","content":"Zmena termínu publikovaných článkov je mimo tohto workflowu."}]', 4,
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'),
  'ci:editorial-calendar', 'ci:editorial-calendar'
);

-- Two per-project rescheduling targets avoid cross-project mutation interference.
INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
)
SELECT 974104, 'editorial-calendar-e2e-reschedule-desktop', 'CALENDAR E2E reschedule desktop',
  excerpt, category, portal_section, status, accent, author, intro, takeaway,
  sections_json, sources_json, blocks_json, reading_minutes, created_at,
  updated_at, published_at, created_by, updated_by
FROM managed_articles WHERE id = 974101;

INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
)
SELECT 974105, 'editorial-calendar-e2e-reschedule-mobile', 'CALENDAR E2E reschedule mobile',
  excerpt, category, portal_section, status, accent, author, intro, takeaway,
  sections_json, sources_json, blocks_json, reading_minutes, created_at,
  updated_at, published_at, created_by, updated_by
FROM managed_articles WHERE id = 974101;

-- Two independent new drafts, one for each E2E viewport project.
INSERT INTO managed_articles (
  id, slug, title, excerpt, category, portal_section, status, accent, author,
  intro, takeaway, sections_json, sources_json, blocks_json,
  reading_minutes, created_at, updated_at, published_at, created_by, updated_by
) VALUES
(974106, 'editorial-calendar-e2e-draft-desktop', 'CALENDAR E2E draft desktop',
 'Kompletný koncept článku pripravený na kontrolu a naplánovanie z mesačného kalendára.',
 'Život so psom', 'clanky', 'draft', 'forest', 'Redakcia Psipedia',
 'Toto je dostatočne dlhý úvod článku určeného na bezpečné naplánovanie.',
 'Záver článku slúži na kontrolu náhľadu.',
 '[]', '[]', '[{"id":"fixture-h2-0","type":"h2","text":"Kontrola článku"},{"id":"fixture-text-0-0","type":"text","content":"Úplný text článku pre kalendárovú kontrolu a plánovanie."}]', 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'ci:editorial-calendar', 'ci:editorial-calendar'),
(974107, 'editorial-calendar-e2e-draft-mobile', 'CALENDAR E2E draft mobile',
 'Kompletný mobilný koncept článku pripravený na kontrolu a naplánovanie z kalendára.',
 'Život so psom', 'clanky', 'draft', 'forest', 'Redakcia Psipedia',
 'Toto je dostatočne dlhý úvod článku pre kontrolu a naplánovanie cez mobil.',
 'Záver mobilného konceptu je pripravený na kontrolu.',
 '[]', '[]', '[{"id":"fixture-h2-0","type":"h2","text":"Mobilná kontrola"},{"id":"fixture-text-0-0","type":"text","content":"Úplný text článku pre mobilný redakčný kalendár."}]', 4, strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'ci:editorial-calendar', 'ci:editorial-calendar');
