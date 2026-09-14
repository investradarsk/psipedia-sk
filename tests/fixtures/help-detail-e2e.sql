-- Public presentation fixtures in local D1 only; never run against remote D1.
INSERT INTO help_cases (
  id, slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
  city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
  goal_amount, raised_amount, verified, urgent, resolved, created_at, updated_at, published_at, created_by, updated_by
) VALUES
  (920001, 'e2e-organizacia', 'E2E pomocná organizácia', 'utulky', 'published', 'Overenie profilu organizácie.',
   'Popis: Pomáhame psom. Dobrovoľníctvo: venčenie Materiálna pomoc: deky Typ organizácie: Občianske združenie',
   'E2E pomocná organizácia', '', '', '', 'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Zistiť viac', NULL,
   'Telefón: +421 900 123 456 E-mail: help-e2e@example.invalid Web: https://example.org', NULL, NULL, 1, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920002, 'e2e-adopcia', 'E2E adopcia psa', 'adopcia', 'published', 'Hľadá domov.',
   'Pokojný pes hľadá domov.\n\nRád chodí na prechádzky.', 'E2E pomocná organizácia', 'Beny', 'Labrador', '',
   'Nitra', 'Nitriansky kraj', '', '2026-09-14', NULL, 'Zistiť viac', NULL, 'Neuvedené', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920003, 'e2e-docasna-opatera', 'E2E dočasná opatera', 'docasna-opatera', 'published', 'Potrebujeme opateru.',
   'Dočasná opatera pre psa.', 'E2E pomocná organizácia', 'Max', '', 'Nezistené',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Zistiť viac', NULL, '', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920004, 'e2e-zbierka', 'E2E finančná výzva', 'zbierky', 'published', 'Pomoc s nákladmi.',
   'Prispejte na starostlivosť.', 'E2E pomocná organizácia', '', '', '',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Podporiť', 'https://example.org/darovat', '', 10000, 3500, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL'),
  (920005, 'e2e-dobrovolnictvo', 'E2E dobrovoľnícka výzva', 'dobrovolnictvo', 'published', 'Zapojte sa.',
   'Popis: Pomôžte venčením. Dobrovoľníctvo: prechádzky', 'E2E pomocná organizácia', '', '', '',
   'Nitra', 'Nitriansky kraj', '', NULL, NULL, 'Zistiť viac', NULL, '', NULL, NULL, 0, 0, 0,
   '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', '2026-09-14T10:00:00Z', 'E2E_LOCAL', 'E2E_LOCAL');
