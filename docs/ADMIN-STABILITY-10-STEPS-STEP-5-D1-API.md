# Psipedia.sk – Admin stabilita, krok 5/10: D1 čítania a API

**Jeden PR:** #1318, vetva `fix/admin-stability-10-steps-20261111`  
**Rozsah:** len čítacie dotazy a testy. **Žiadna migrácia, zápis do produkčnej D1, Notion sync ani API mutácia.**

## Zistenia v skutočnom kóde

### Organizácie: opakované čítania a závislosť na filtrovanom počte

Pôvodný `getOrganizationAdminPage()` v `lib/help-organization-admin-store.ts` sekvenčne čítal:
1. globálne počty podľa lifecycle,
2. filtrovaný `COUNT(*)`,
3. obmedzenú stránku `LIMIT/OFFSET`,
4. tri oddelené `DISTINCT` dotazy nad `organization_locations` a `help_organizations` pre kraj, okres, mesto (tie tri sa už vykonávali paralelne).

Pri nevyfiltrovanej stránke pritom filtrovaný počet presne kopíroval globálny total.

**Oprava:**
- Jeden SELECT `ORGANIZATION_ADMIN_LOCATION_FACETS_SQL` pre všetky tri lokality. Pevne určené štítky `region / district / city` namiesto vkladania názvu stĺpca od používateľa.
- Súbežný štart `Promise.all` pre globálne počítadlo, voliteľné filtrované počítadlo, kombinované lokality a požadovanú stránku.
- Ak `membership.where === ""`, vynechá sa redundantný filtrovaný `COUNT(*)`.
- `LIMIT/OFFSET` sa zostavuje iba z existujúceho limitu a validovaného čísla stránky, triedenie je stále whitelistované.
- Len pri požiadavke mimo rozsahu sa vykoná druhé čítanie poslednej stránky. Počty, preflight, údaje profilu, lokality a existujúce filtrovanie sa významovo nemenia.

**Počet D1 SELECT volaní pri platnej stránke:** predtým 6, teraz 3 bez filtra a 4 s filtrom. Celkové SQL náklady môžu závisieť od veľkosti tabuliek; nie je to meranie reálneho času.

**Spresnenie v kroku 9:** Prvé zjednotenie facetov cez `CROSS JOIN` a opakované `CASE` výrazy malo na lokálnej syntetickej SQLite vzorke vyššie CPU náklady. SQL sa preto prepísalo na tri presne ekvivalentné `DISTINCT UNION` vetvy, spojené `UNION ALL` **v jednom D1 volaní**, bez opakovanej per-row `CASE` evaluácie. Počty volaní (3/4) sa nemenia. Pripravené `npm run benchmark:admin-step9` meria obe verzie na syntetických dátach; ide o vývojovú diagnostiku, nie potvrdenie produkčného p95.

### Adopcie: štyri čítania do troch, bez duplicitného full-scan

Pôvodný `listAdoptionAdminDashboard()` v `lib/adoption-admin-store.ts` sekvenčne vykonal `COUNT(*)` filtrovaných záznamov, stránku, `COUNT(*)` neaktuálnych adopcií a `GROUP BY status`.

**Oprava:**
- `ADOPTION_ADMIN_STATUS_SUMMARY_SQL` vypočíta `COUNT(*)` a `staleCount` v jednej agregácii podľa statusu; platí pôvodný `ADOPTION_STALE_DAYS` prah.
- Filtrovaný počet, stránka a nové agregované počty sa spúšťajú naraz cez `Promise.all`.
- Zachované všetky lifecycle stavy, indexability, stale príznaky, page size 40, sort a serverové filtre.
- Udržiavame rovnaké `AdoptionAdminListResult`; žiadna zmena HTTP/API kontraktu.

**Počet D1 SELECT volaní:** zo 4 na 3, spúšťaných súbežne.

### Stratené/Nájdené: znížená sériová latencia, bez predpokladu migrácií

`lib/lost-found-dog-store.ts` teraz v `listAdminDogReports()` súbežne spúšťa filtrovaný count a kompatibilitný `PRAGMA table_info` výber dostupných stĺpcov. Query na zoznam sa následne zostaví s bezpečnými fallback stĺpcami; zostávajú zachované migrácie 0162/0165, privátne PII, decrypt, pagination a klientské typy.

**Nezmenené:** počet vykonaných D1 čítaní. Mení sa iba nezávislosť ich začiatku. Pridávať globálnu cache schémy by pri postupných migráciách mohlo znamenať zastaraný kontrakt – neurobené.

## Čo už bolo optimalizované a zámerne som to nemenil

- `lib/directory-admin-query.ts`: už má paralelné počítadlá/list a jeden kombinovaný SELECT facetov.
- `lib/article-store.ts`: už používa `database.batch` na súvisiace počítadlá a číta stránku paralelne; total reuse.
- `lib/admin-global-search.ts`: už používa batch pripravených SELECTov s fallbackom na izolované zdroje.
- `lib/admin-attention-queue-store.ts`: už má skupinové source probes a kontrolované fallbacky, čím eliminuje zbytočné opakované D1 volania.

Podľa oficiálnej dokumentácie D1 `batch()` vykonáva SQL príkazy **sekvenčne** v jednej transakcii, hoci môže ušetriť sieťové kolá. Preto som ho nezamieňal za paralelný mechanizmus a nenahrádzal fungujúce query kontrakty bez odôvodnenia. Zdroj: https://developers.cloudflare.com/d1/worker-api/d1-database/

## Audit indexov a query plan

Overené z migračných súborov (nie zo živého `PRAGMA index_list` produkcie):
- `adoption_dogs_verified_idx` na `(status, last_verified_at)`,
- `adoption_dogs_admin_updated_idx` na `(updated_at, id)`,
- `organization_locations_org_order_idx` na `(organization_id, sort_order, id)`,
- `organization_fundraising_methods_org_order_idx` na `(organization_id, sort_order, id)`.

**Lokálna SQLite kontrola:** zjednotený region/district/city SELECT vrátil rovnaké hodnoty ako pôvodné tri dotazy na syntetickej vzorke; `EXPLAIN QUERY PLAN` sa vykonal na tejto lokálnej vzorke. Stale aggregate pri adopciách bol nezávisle skontrolovaný v pamäťovej SQLite voči pôvodnému `COUNT(*)`, oba výsledky = 3.

**Produkčné `EXPLAIN QUERY PLAN`, počty rows_read a merania p95:** zatiaľ **nie sú k dispozícii**. Nie je bezpečné pridávať novú migráciu indexov len podľa odhadu. Zostáva preveriť náklady korelovaných location/fundraising subquery v `ORGANIZATION_PUBLICATION_SELECT`, ako aj veľké `LIKE '%q%'` filter skeny na konkrétnych produkčných dátach, bez dotknutia sa existujúcich profilov.

## Regresie

- `tests/admin-d1-reads-step5.test.mjs`: SQLite porovnanie region/district/city výsledkov a grouped adoption count, ukážkový `EXPLAIN QUERY PLAN`, kontrakty indexov, nezávislé spustenie list/count, count reuse, out-of-range clamping, kompatibilita lost-found.
- `tests/adoption-admin-list.test.mjs`: staré canonical fixtures aktualizované na kombinovaný staleCount a zachovaná hodnota 7.
- `package.json`: nový `npm run test:admin-d1-step5` používa existujúci `tests/admin-events-loader.mjs`; pripojený k `test:admin-pwa`. Žiadne nové závislosti.

**Tento krok:** testy sú implementované, ale nebežal celý Node/test/build/Playwright nad vetvou. Otestované sú izolované syntetické SQLite SQL výrazy, nie celý systém na produkcii. Merateľné porovnanie pred/po a všetky soft-navigačné regresie zostávajú do krokov 9–10.

## Ďalej

- **Krok 6/10:** React re-renderovanie, klientský JS, dlhé úlohy na main threade, pamäť a tabuľky.
- **Krok 9/10:** integračné testy vrátane neuložených zmien, reálne D1 latency a reprodukcie `/admin/organizacie/128`.
- **Krok 10/10:** aktualizácia oproti najnovšiemu `main`, finálna CI kontrola a merania, predpoklad bez ďalších migračných zápisov.
