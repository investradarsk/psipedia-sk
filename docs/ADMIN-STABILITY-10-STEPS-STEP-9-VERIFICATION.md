# Psipedia.sk – Admin stabilita, krok 9/10: regresie a merania

**PR:** #1318, jedna vetva `fix/admin-stability-10-steps-20261111`.  
**Dátová bezpečnosť:** tento krok nevykonáva produkčné D1, Notion, publikovanie ani migrácie. PR zostáva draft.

## Audit testov a nájdené regresie

1. GitHub na začiatku kontroly nehlásil workflow runs ani výsledné commit statuses pre commit `821e97f360c857d9691a081b274334c59a5a1f44`. **Nie je dôkaz, že predchádzajúce testy/CI reálne bežali.**
2. `tests/help-organization-publication.test.mjs` vyžadoval staré `onDocumentClick` a `onNativeNavigate` listenery priamo v `AdminOrganizationEditor`. Krok 3 ich presunul do shared `useAdminEditorNavigationGuard`, takže historický test bol neaktuálny. Upravené tak, aby kontroloval centralizovaného vlastníka a vylučoval duplicitu.
3. `tests/directory-admin-query.test.mjs` ešte čakal `manualSorting: Boolean(serverSorting)`; krok 6 správne zapol manual sorting aj pri `serverSorted`. Aktualizovaný source kontrakt.
4. Syntetická SQLite vzorka odhalila, že prvý kombinovaný organization facet SELECT (`CROSS JOIN` + `CASE`) mal zbytočné náklady CPU. Nahradil som ho **jedným SQL dotazom s tromi pôvodnými `DISTINCT UNION` vetvami**, spojenými `UNION ALL`. Zachováva výsledky, case/trim sémantiku, poradie a počet D1 roundtripov, ale neevaluuje `CASE` 3-krát na každý zdrojový riadok. Test zakazuje návrat `CROSS JOIN`.

## Lokálne meranie syntetickej SQLite – vykonané

Jedno nezávislé meranie v tomto prostredí (Python sqlite3, 60 opakovaní po rozohriatí, striedané poradie behov):
- **Vstup:** 1 000 organizácií, 3 000 lokalít, 3 000 adopcií.
- **Lokality:** tri pôvodné SELECTy **medián 3,042 ms, p95 3,428 ms**; nový jeden SELECT **medián 3,084 ms, p95 3,671 ms**.
- **Adopcie:** pôvodný `GROUP BY status` + `stale COUNT` **medián 0,629 ms, p95 0,846 ms**; nový grouped summary **medián 0,711 ms, p95 0,975 ms**.
- **Parita:** 14 krajov, 70 okresov, 220 miest zhodných s pôvodnou implementáciou. Počet stale adopcií **600** v oboch verziách.
- **Záver:** Lokálny SQL CPU čas je porovnateľný, nie preukázateľne rýchlejší. Počet databázových požiadaviek je nižší (lokality 3→1, agregácia adopcií 2→1). Čistý výkon Cloudflare D1 závisí aj od sieťových roundtripov, indexov a produkčnej distribúcie dát. Tieto lokálne p95 hodnoty **nie sú produkčné p95** ani browser metriky.

Do repozitára som zároveň pridal **`scripts/benchmark-admin-step9.mjs`**, ktorý importuje *aktuálne* SQL konštanty, beží výhradne v pamäti Node SQLite, pri každom spustení kontroluje úplnú paritu výsledkov a vypíše lokálne p50/p95 časy v JSON. Je to reprodukovateľný benchmark pre celý tím; **tento konkrétny npm skript zatiaľ v plnom repo prostredí nebežal**.

## Nová testovacia matica

| Rozsah | Test / kontrola | Stav |
|---|---|---|
| TS/TSX syntax úprav z krokov 1–9 | `tests/admin-stability-verification-step9.test.mjs`, TypeScript parser | Pridané, nie spustené |
| Existujúce D1 count/list & SQL parity | `test:admin-d1-step5` | Aktualizované, nie spustené |
| React / TanStack / globálne vyhľadávanie | `test:admin-react-step6` | Existujúce, nie spustené |
| iOS PWA, Service Worker notification click | `test:admin-mobile-step7` | Existujúce, nie spustené |
| Biele stránky, detail #128, 404 vs D1 | `test:admin-error-step8` | Existujúce, nie spustené |
| Historický editor organizácií a adresár | `tests/help-organization-publication.test.mjs`, `tests/directory-admin-query.test.mjs` | Opravené regresné očakávania |
| Celá zjednotená Admin Node sada | `npm run test:admin-stability-step9` | Vytvorený vstupný bod, nie spustený |
| Navigácia, Back/Forward, iPhone drawer, dirty editor | `npm run e2e:admin-stability-step9` | Playwright read-only scenáre, nie spustené |
| Projektové typy | `npx tsc --noEmit --pretty false` | Pridané do CI, nie spustené |
| Syntetický benchmark SQL | `npm run benchmark:admin-step9` | Pridaný a pripravený, nie spustený |

## Testovacia automatizácia bez produkčných povolení

Pridaný `.github/workflows/admin-stability-regressions.yml`:
- `pull_request` iba pre relevantné zmeny, tiež manuálny `workflow_dispatch`;
- Node.js 22.16.0, `npm ci`, regresná sada, typová kontrola, lokálny read-only SQLite benchmark, diagnostický artifact;
- `permissions: contents: read`, bez Cloudflare/Notion secrets, bez DB migrácií, bez publikovania/deploy.

**Dôležité:** vytvorenie GitHub Actions workflow ešte neznamená, že už prebehol. Overovať skutočný run a jeho logy pri finálnej kontrole. Playwright sa zámerne nespúšťa bez autentifikovaného testovacieho prostredia; inak by testoval prihlásenie alebo mohol neúmyselne navštíviť produkciu.

## Pripravená read-only Playwright diagnostika

`tests/e2e/admin-performance-step9.spec.ts`:
- Desktop: štyri po sebe idúce soft-route prechody cez sidebar `Plemená ↔ Články ↔ Recenzie`, Back + Forward, kontrola zobrazenia `AdminShell`.
- Mobile emulácia: menu cez dve sekcie, znovu klikateľné dotykové ovládanie, `body.style.overflow` mimo `hidden`.
- Attachments obsahujú individuálne latencie `performance.now()` a `PerformanceObserver` long tasks, ak ich browser podporuje.
- Nevykonáva žiadny `POST/PUT/PATCH/DELETE`, neukladá ani nepublikuje profil; neobsahuje tvrdé číselné SLA bez reálnej referencie.
- Ostatné existujúce scenáre z krokov 2/3/7/8 sú zahrnuté do jedného spustiteľného príkazu.

## Riziká pred finálnym krokom 10

- **Najvyššie:** kód nie je zlúčený s najnovším `main`; pri začatí kroku 9 bola vetva približne 73 commitov pozadu. Bez integrácie sa nedá garantovať kompatibilita s medzičasom zlúčenými zmenami.
- **Neoverené:** produkčný profil `/admin/organizacie/128`; chýba produkčný stack/digest a read-only D1 `EXPLAIN QUERY PLAN`.
- **Neoverené:** skutočný iPhone Safari / PWA a p95 po nasadení. Playwright Chromium s iPhone userAgent nie je fyzický WebKit.
- **Neoverené:** komplet Node testy, TypeScript typecheck, Next build a autentifikované E2E; GitHub workflow nemusí bežať, pokiaľ GitHub Actions nie je dostupný/povolený alebo neprišla vhodná udalosť.

**Krok 10:** najprv zosúladenie `main` a riešenie konfliktov, potom typecheck/build/CI, oprava červených testov, rozhodnutie o pripravenosti PR na merge. Nemeniť produkčnú D1 ani Notion a nemanipulovať s publikovaním.
