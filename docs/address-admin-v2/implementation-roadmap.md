# ADDRESS ADMIN V2 — fázy 2–11 a závislosti

Fáza 1 je [audit](audit.md); [kontrakt](data-contract.md) je návrh na schválenie
implementačným zadaním. Každá fáza: samostatná vetva/PR z aktuálneho main,
bez auto-merge; používateľ merguje a zadáva pokračovanie. Implementačné fázy
sa nezačínajú automaticky. Verejná Psipedia, filtre, mapa a SEO zostávajú mimo scope.

## 1. Ďalších desať úloh

| Fáza / odporúčaný prompt | Konkrétny výsledok | Merge závislosti | Akceptácia |
|---|---|---|---|
| 2 `ADDRESS-ADMIN-CONTRACT-2` | spoločná interná validácia a adaptéry existujúcich modelov; locality/absent/clear/review/ownership kontrakt | 1 | bez nového číselníka; Online oddelene; legacy public read rovnaký |
| 3 `ADDRESS-ADMIN-D1-3` | additive migrácie structured fields event/location + schema guard a rehearsal; bez produkčného backfill | 2 | prázdne legacy dáta nezmenené, ID/FK/primary zachované, rollback plán |
| 4 `ADDRESS-ADMIN-NOTION-SCHEMA-4` | read-only live schema inventár ak dostupný, presný diff + existujúce extension adaptéry | 2 | žiadne domyslené property typy, explicitná autorizácia pred live schema write |
| 5 `ADDRESS-ADMIN-GOOGLE-5` | reuse confirmation, jednotný preview diff/normalizácia/guard; event address write a location components | 3 | manual/private lock, guarded recovery, incomplete candidate bez straty údajov |
| 6 `ADDRESS-ADMIN-DIRECTORY-6` | interný directory editor: ručné street/PSČ/number + shared selector/Google preview | 5 | publicAddress kompatibilný, numberless a municipality-number zachované |
| 7 `ADDRESS-ADMIN-EVENTS-7` | interný event editor: locality + structured fields, safe Online mode | 5 | fyzické/online prechody, current Google address a venue bez nesúladu |
| 8 `ADDRESS-ADMIN-ORGANIZATIONS-8` | interný organization editor: locality a structured fields po jednotlivých lokalitách | 5 | SITE/LEGAL_SEAT/SERVICE_AREA, multi-location a primary neporušené |
| 9 `ADDRESS-ADMIN-SYNC-9` | jednotný Google/manual lock, missing-only pull, confirmed fields push, baseline/retry/no-op | 4, 5 | 2 opakované sync kolá bez cyklu; organizations ownership explicitne vyriešený |
| 10 `ADDRESS-ADMIN-AUTOMATION-10` | research missing-in-both gate, zdroj do Notion, review + sync; návrh náhrad Geoapify | 9 | confirmed address immutable pre automatizáciu, duplicate proposals no-op; nič automaticky nezapnúť |
| 11 `ADDRESS-ADMIN-MAPS-ACCEPTANCE-11` | iba interné vizuálne zjednodušenie Mapy + integrácia/acceptance celej roadmapy | 6, 7, 8, 9, 10 | zachovať inbox, tri sekcie, search/categories, bulk/manual/not-required, pagination a editor odkazy |

## 2. Paralelná práca a merge brány

| Vetvy práce | Môžu bežať paralelne | Musia počkať |
|---|---|---|
| D1 3 a Notion schema 4 | po merge 2, s dohodnutým názvoslovím; nezávislé schema inventáre | 5 na merge 3; live Notion mutation na explicitné zadanie |
| Editory 6, 7, 8 a sync 9 | po merge 5 (sync aj po 4); oddelené entity komponenty, spoločný kontrakt stabilný | integračné výsledky sync na schema/Google API; pri zmene shared modulu rebase a koordinácia |
| Automatizácia 10 | research/spec možno pripraviť počas editorov | implementačný missing-only write tok až po 9 |
| Mapy vizuálny návrh 11 | screenshoty a návrh možno pripraviť po 1 bez zmien runtime | finálny PR/acceptance po merge 6–10 |

Paralelnosť je odporúčanie pre budúce explicitne zadané úlohy, nie spustenie
agentov alebo ďalších fáz týmto PR. Nevykonávať paralelné produkčné migrácie,
Notion schema write ani automatizačné apply.

## 3. Testovací plán podľa rizika

Toto je plán implementačných fáz; v docs-only audite sa test suite nespúšťa.
Reuse existujúce testy a doplniť iba behavior coverage potrebné pre zmenu:

- Kontrakt: 8/79/2927 snapshot, nesprávna väzba okres/kraj a obec/okres,
  homonymá, Bratislava/Košice časti, diakritika, neznámy raw Google locality,
  PSČ s nulou, číslo `12/A`, numberless, municipality-number, prázdny návrh.
  Reuse [directory-service-address](../../tests/directory-service-address.test.mjs)
  a [directory-address-policy](../../tests/directory-address-policy.test.mjs).
- Google/write guard: event text update aj GEO, incomplete výsledok, nesúlad
  starej a novej locality, server rediscovery, stale revision, súbeh admin/Notion,
  failure medzi source/GEO, private branch, manual override; žiadne kontakty/SEO
  v write set. Reuse [profile-google-unified](../../tests/profile-google-unified.test.mjs),
  [directory-google-first](../../tests/directory-google-first.test.mjs),
  [google-place-bulk](../../tests/google-place-bulk.test.mjs).
- Organizácie: primárna SITE, viac pobočiek, legal seat neverejná, konfliktné
  vytvorenie lokality, adresný Notion pull na správny locationId. Reuse
  [location admin](../../tests/organization-location-admin.test.mjs).
- Sync: missing-only, explicit clear, confirmed/stale Google lock, manual/privacy,
  Notion-only/canonical-only/obojstranná zmena, identické hodnoty, schema expansion,
  baseline po normalizácii, failure + retry, dve kolá bez ďalšieho zápisu.
  Reuse [directory sync](../../tests/notion-directory-sync.test.mjs),
  [events/help sync](../../tests/notion-events-help-bidirectional.test.mjs),
  [geo mirror](../../tests/notion-geo-mirror.test.mjs).
- Automation: mock provider/Notion, adresa chýba v oboch vs iba v jednom,
  proposal so zdrojom, missing-only, duplicate/retry, potvrdená adresa nezmenená.
  Reuse [address review](../../tests/data-automation-address-review.test.mjs),
  [Gemini bridge](../../tests/gemini-automation-notion-bridge.test.mjs).
- Mapy: fixture screenshoty desktop/mobile, keyboard/focus; zhodné výsledky,
  počty, URL parametre, pageSize 25/50/100, bulk cursor, category/search a actions.
  Reuse [operator](../../tests/geo-admin-operator.test.mjs),
  [perf Google](../../tests/map-admin-perf-google-1.test.mjs).
- Ochrana public správania: immutable legacy fixture porovnanie textových adries,
  filtrov a map payloadov pred/po interných zmenách. Reuse
  [public location contract](../../tests/public-location-map-contract.test.mjs).
  Verejné súbory neupravovať; ak kontrakt vyžaduje public zmenu, zastaviť tú časť
  a pripraviť osobitné zadanie mimo tejto roadmapy.

Lokálne spúšťať len príslušné testy fázy; širší existujúci build/check len ak ho
runtime zmena vyžaduje. CI workflowy/required checks nemeníme a na GitHub Actions
nečakáme. Platené volania, produkčné canary, deploy a backfill nepatria do lokálnej
mock validácie a nespúšťajú sa ako vedľajší efekt testov.

## 4. Odporúčaný ďalší prompt

> ADDRESS-ADMIN-CONTRACT-2 — po mojom merge auditu načítaj nový main. Implementuj
> spoločný interný adresný validačný kontrakt a adaptéry podľa docs/address-admin-v2.
> Použi existujúci slovenský číselník, evaluator a GEO lifecycle. Oddel completeness,
> Google confirmation, manual override a privacy; definuj missing/omitted/clear.
> Bez verejných zmien, produkčných dát, migrácií, Notion schema writes, provider
> volaní alebo zapnutia automatizácií. Jeden PR, cielené lokálne kontroly,
> bez auto-merge a bez čakania na CI. Fázu 3 nezačínaj.
