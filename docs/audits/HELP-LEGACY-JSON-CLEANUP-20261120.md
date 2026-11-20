# Pomoc psom — odstránenie historických súborových JSON zdrojov

Dátum: 2026-11-20. Samostatný následný čistiaci PR po #1463.

## Rozsah
- Odstránené jednorazové importy `data/imports/adoptions-ready-2026-09-13.json` a `data/imports/help-organizations-ready-2026-09-10.json`.
- Odstránené zastarané generátory SQL migrácií 0037/0038. **Existujúce historické migrácie 0037/0038/0039 sa nemenia** a naďalej zostávajú aplikovateľné od čistej D1.
- Lokálne testy, CI bootstrap, preflight a Playwright získavajú fixture adopcií z immutable `drizzle/0038_adoption_staging_data.sql` do dočasnej pamäťovej SQLite databázy. Neobsahujú ani nepotrebujú druhú súborovú JSON kópiu.
- Test útulkov porovnáva SQL výsledok a denylist 10 vylúčených slugov bez historického JSON súboru.
- Žiadna úprava produkčnej D1 alebo Notion, žiadne `DELETE` historických SQL riadkov.

## Zachované technické JSON v D1
Stĺpce `source_data_json` (vrátane aktívnych závislostí galérií), `gallery_json`, `seo_json`, `thumbnail_display_json` a `detail_display_json` zostávajú. Nie sú externým súborovým úložiskom ani predmetom tohto čistenia.

## Zostávajúca samostatná úloha
Historické SQL riadky `help_cases.category IN ('adopcia','utulky','stratene-a-najdene')` nie sú JSON súbory. Rozhodnutia o ich fyzickom vymazaní sa budú robiť oddelene až po vyriešení historických permalinkov a zámkov synchronizácie. Desať zámerne odstránených útulkov sa nesmie znovu importovať; 21 ADOPTED adopcií sa nesmie aktivovať.
