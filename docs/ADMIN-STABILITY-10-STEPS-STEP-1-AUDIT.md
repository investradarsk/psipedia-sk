# Psipedia Admin – audit stability a výkonu, krok 1/10

**Repozitár:** `investradarsk/psipedia-sk`  
**Východisková vetva:** `main`, commit `262aa6f49cf336578b5e7e3b6e37d93b64b2b416` (11. 11. 2026 pri vytvorení pracovnej vetvy)  
**Pracovná vetva:** `fix/admin-stability-10-steps-20261111`  
**Rozsah:** statická kontrola aktuálneho kódu; žiadne zápisy do D1/Notion, produkčné dáta ani zmeny verejného obsahu.

Toto je **krok 1 z 10** v jednom spoločnom PR. PR #1311 je zlúčený do `main` a nemení sa. V ďalších krokoch sa budú do tejto vetvy pridávať opravy. Označenie **POTVRDENÉ V KÓDE** znamená overený tok/defekt podľa zdrojového kódu; **HYPOTÉZA** znamená neoverenú príčinnú súvislosť s používateľom pozorovaným zamrznutím. Nevykonali sa browser performance trace, produkčné logy ani D1 `EXPLAIN QUERY PLAN`; časy, počet skutočných požiadaviek a koreňová príčina konkrétneho pádu preto zatiaľ nie sú potvrdené.

## A. Zistenia podľa priority

### P0 – navigácia, zablokované prechody

**A1. POTVRDENÉ V KÓDE – kolízia globálnej klávesovej skratky Ctrl/Cmd+K.** `app/layout.tsx:95-101` vykresľuje verejný `SiteHeader` aj na admin trasách. `components/site-header.tsx:47-57` registruje globálny `window.keydown` handler na Ctrl/Cmd+K a otvára verejné vyhľadávanie. Súčasne `components/admin-quick-navigation.tsx:19-28` registruje pre tú istú skratku ďalší globálny handler na Admin vyhľadávanie; `components/admin-shell.tsx:127` ho používa. Jedna akcia teda môže otvoriť dva nezávislé dialógy a vrstvy focus trap. Toto je dokázateľná funkčná kolízia, nie dôkaz všetkých zamŕzaní. **Náprava:** verejné skratky, public overlay a ich efekty na /admin deaktivovať; ponechať jediného vlastníka Ctrl+K.

**A2. POTVRDENÉ V KÓDE – rôzne navigačné mechanizmy bez jednotnej záruky.** `components/admin-navigation.tsx:25-41,80-91` má Next Link + explicitné `router.prefetch` na hover/focus; `components/admin-mobile-document-navigation.tsx:15-40` zachytáva niektoré iOS kliknutia na úrovni dokumentu a vykonáva `location.assign`; `components/admin-home-brand-link.tsx:20-43` robí tvrdý document navigation vždy; `components/admin-quick-navigation-dialog.tsx:130-145` prepína medzi `router.push` a tvrdým presmerovaním. Viac ciest zvyšuje riziko rozdielneho správania history/Back/Forward, najmä po nasadení. **HYPOTÉZA:** preteky RSC navigácie, starý router tree alebo dvojité zachytenie kliknutí sú príčinou „prvý prechod ide, ďalší zamrzne“. **Náprava:** v krokoch 2–3 presne otestovať a centralizovať navigáciu; neskrývať chyby povinným reloadom.

**A3. POTVRDENÉ V KÓDE – ochrana neuložených zmien má rôzne implementácie a pokrytie.** `components/admin-organization-editor.tsx:115-179` a `components/admin-event-editor.tsx:104-160` pri `dirty` registrujú zachytávanie všetkých dokumentových kliknutí a voliteľný `Navigation API navigate`, vykonávajú `preventDefault` / `stopPropagation` a replay cez `router.push` alebo `traverseTo`. `components/admin-editor-workspace.tsx:179-187` samostatne pridáva `beforeunload`. `components/admin-unsaved-form-links.tsx:30-53` chráni iba odkazy vo formulári, pri potvrdení používa `anchor.click()`. `components/admin-directory-editor.tsx:1202-1244` rieši najmä tlačidlo späť na zoznam. **HYPOTÉZA:** nejednotná ochrana môže zachytiť soft-nav alebo naopak nechať neochránený Cmd+K/sidebar/back. **Náprava:** jednotný per-editor dirty guard s explicitnou podporou Link, programovej navigácie a browser history, bez blokovania `dirty=false`; samostatne regresne otestovať zachovanie draftu.

**A4. POTVRDENÉ V KÓDE – timeout indikátora ≠ obnova navigácie.** `lib/navigation-progress.ts:25-65` po 12 sekundách skryje indikátor; `instrumentation-client.ts:1-45` sleduje začiatok/commit a chyby. Tento timeout však nepreruší zaseknutý RSC prechod, neposkytne retry a nezaručí klikateľnosť. **Náprava:** merateľný watchdog + bezpečné opakovanie navigácie bez automatického zahodenia neuložených dát (kroky 2, 8 a 9).

### P0 – editor padá pri nepodstatnej chybe

**A5. POTVRDENÉ V KÓDE – detail organizácie čaká na šesť čítaní a jedno zlyhanie zhodí render.** `app/admin/organizacie/[id]/page.tsx:24-33` používa `await Promise.all` pre:
1. samotnú organizáciu,
2. lokality,
3. fundraising metódy,
4. varovanie o duplicite (`catch(() => null)`, izolované),
5. návrhy automatizácie (**neizolované**),
6. stav redakčného overenia (**neizolované**).

Všetky musia úspešne skončiť ešte pred `<AdminShell>`; samotný editor nie je od nepodstatných dát oddelený. Aj výpadok návrhov aktualizácie alebo „review“ môže vyradiť celý detail. `lib/data-automation-update-review.ts:753-761` navyše vykonáva niekoľko nadväzných D1 čítaní pre doplnkové návrhy. Toto je preukázaná chyba izolácie zlyhaní. **HYPOTÉZA:** pozorovaný pád na `/admin/organizacie/128` vznikol práve tu; konkrétny zlyhaný promise nie je bez server logu známy. **Náprava:** iba kľúčové čítania pred renderom, sekundárne panely `Suspense` a lokalizované fallbacky, zachovať lokality a fundraising editor.

**A6. POTVRDENÉ V KÓDE – `app/admin/error.tsx:24-40` ponúka ako hlavné riešenie `window.location.reload()`; môže zahodiť rozpracované zmeny.** Error boundary závisí od normálneho admin CSS; pri chybnom načítaní stylesheetu nemusí vyzerať použiteľne. `reset()` už existuje, ale nie je mechanizmus znovupokusu zaseknutej (bez výnimky) navigácie. **Náprava:** bezpečne štylizovaný fallback s `reset` a informáciou o draftoch, oddeliť návrat od tvrdého reloadu, otestovať chyby a retry.

### P1 – opakovaná serverová práca a D1

**A7. POTVRDENÉ V KÓDE – Admin dedí závislosti verejného koreňového layoutu.** `app/layout.tsx:76-103` pred vykreslením Adminu čaká na `getNavigationItems` a eventuálnu partner session. `lib/navigation-store.ts:100-109` vykoná D1 SELECT verejnej navigácie a pre chybné SQL spojenie nemá lokálny fallback. Root ďalej vždy vykresľuje `SiteHeader`, `SiteFooter`, `CookieConsent`, `ProgrammaticAdLoader`, `BackToTop`. `components/site-header.tsx:195-240` na Admin stránkach naďalej načítava `/api/name-days/today` a drží 60-sekundový interval. `components/programmatic-ad-loader.tsx:17-54` explicitne vylučuje partner/review-auth, ale nie `/admin`; reklamnú knižnicu môže pri platnom súhlase zaviesť aj na Admin. **Náprava:** odfiltrovať public-only efekty a reklamy na Admin okamžite; prípadnú úplnú reorganizáciu root layoutu riešiť až po meraní/bez regresie verejného webu.

**A8. POTVRDENÉ V KÓDE – časti zoznamových stránok čakajú na doplnkové údaje pred shellom.** `app/admin/organizacie/page.tsx:15-30` sériovo načítava `getOrganizationAdminPage` → `listReviewedAdminEntityIds`; `app/admin/adopcie/page.tsx:38-41` podobne; `app/admin/stratene-najdene/page.tsx:12` čaká na zoznam, počty a následne review; `app/admin/pomoc-psom/page.tsx:87-100` pred návratom JSX čaká na tabuľku. Tým sa oneskoruje samotná navigácia a pri výnimke často padne celý modul. **Náprava:** streamovať UI shell, zobraziť primárny zoznam pred sekundárnymi panelmi, chrániť nepodstatné čítania.

**A9. POTVRDENÉ V KÓDE – ďalšie sekundárne dependency v zoznamoch.** `app/admin/clanky/page.tsx:49-67` číta články a číselník tém v jednej `Promise.all` hranici; zlyhanie tém zabráni zobrazeniu článkov. `app/admin/podujatia/page.tsx:15-18` sériovo číta review po stránke eventov, ale `Suspense` aspoň chráni shell. `app/admin/podujatia/[id]/page.tsx:34-42` má naopak dobre oddelené review/duplicate čítania. `app/admin/recenzie/page.tsx:15-30` používa `Promise.allSettled` ako pozitívny vzor degradácie. **Náprava:** výpadok číselníka/review nemá odobrať primárny obsah.

**A10. POTVRDENÉ V KÓDE – administrátorský hlavičkový zvonček opakuje drahšie súhrnné čítanie.** `components/admin-shell.tsx:37-50,130-132` spúšťa `loadExactAdminAttentionSummary`, pokiaľ route neodovzdala súhrn. `tests/admin-attention-header-performance.test.mjs:66-110` popisuje 3 D1 dotazy pre 15 zdrojov v bežnom stave a väčší počet pri čiastočnom zlyhaní. Čítanie je na správnom mieste v `Suspense`, ale jeho súbežnosť s inými requestmi treba profilovať. **Náprava:** deduplikovať/recyklovať iba bezpečne krátko žijúci čitateľský summary; výpadok zvončeka nesmie zradiť editor.

**A11. POTVRDENÉ V KÓDE – SQL pre organizácie obsahuje viacero potenciálne nákladných operácií.** `lib/help-organization-admin-store.ts:78-87` má korelované poddotazy na lokalitu/fundraising a `lib/help-organization-admin-store.ts:208-245` samostatné počty, stránku a 3 číselníky. Nie je dokázané, že chýba index alebo že tento SELECT je dnes pomalý. **Náprava kroku 5:** získať `EXPLAIN QUERY PLAN`, reálne latencie/počet dotazov, skontrolovať indexy a odstrániť len potvrdené náklady. Žiadna migrácia bez dôvodu.

### P1/P2 – klient, PWA, testy

**A12. POTVRDENÉ V KÓDE – spoločná tabuľka má vždy rozbalený model viditeľnej stránky.** `components/admin-record-table.tsx:143-250` renderuje celé `table.getRowModel().rows`, bez virtualizácie. Pre serverom stránkované malé stránky je to korektné; pri dlhších lokálnych zoznamoch treba zmerať render a pamäť skôr, než sa zavádza virtualizácia. `@tanstack/react-virtual` už je v `package.json:131-133`. PR #1311 zostáva funkčne nezmenený.

**A13. POTVRDENÉ V KÓDE – súčasný SW nie je bežný fetch cache proxy.** `public/sw.js:15-75` má install/activate/push/notificationclick bez handleru `fetch`; `components/admin-pwa-registration.tsx:9-42` registruje admin-scope worker a vykonáva jednorazovú migráciu starej root registrácie. Nie sú podklady pripísať bežné zamŕzanie SW cache. **Náprava:** testovať aktualizáciu PWA, iOS BFCache a RSC po deployi; SW meniť iba s konkrétnym dôkazom.

**A14. POTVRDENÉ V KÓDE – chýba regresný test skutočných opakovaných soft navigácií.** `tests/e2e/admin-runtime-1.spec.ts:11-31` kontroluje primárne trasy cez `page.goto()` (nový dokument), nie reťazec SPA kliknutí. `tests/e2e/admin-mobile-blank-route-recovery.spec.ts:3-35` preveruje len mobilný Chromium reťazec operations → články → dashboard. `playwright.config.ts:28-31` používa desktop Chromium a Pixel 7, nie WebKit iOS. `tests/e2e/admin-organization-unsaved.spec.ts:3-31` pokrýva tvorbu novej organizácie a dialóg, nie dlhé soft transitions, Safari history a konkrétny ID 128. **Náprava:** v kroku 9 vytvoriť soft-nav reťazec, Back/Forward, nenarušené/zmenené formuláre, odmietnuté/dlhé RSC/API odpovede a WebKit projekt.

## B. Čo funguje a nemá sa bezdôvodne meniť

- `components/admin-query-provider.tsx:10-23`: TanStack Query používa krátkodobú **pamäťovú** cache, žiadne perzistentné súkromné odpovede.
- `components/admin-event-dashboard.tsx:60-82`: stránkovaná query používa `AbortSignal` a `keepPreviousData`.
- `components/admin-quick-navigation.tsx:5-13`: veľký Fuse/Radix dialóg sa načítava dynamicky.
- `app/admin/page.tsx:48-67`, `app/admin/plemena/page.tsx:21-57`, `app/admin/adresar/page.tsx:30-50`: primárny shell sa už streamuje nezávisle od hlavného obsahu.
- `app/admin/recenzie/page.tsx:15-30` a `app/admin/podujatia/[id]/page.tsx:24-42`: čiastočná degradácia alebo `Suspense` existujú a môžu slúžiť ako vzor.
- `public/sw.js`: žiadne offline uchovávanie súkromných zmien ani fetch intercept; nepridávať cache pre zápisy.

## C. Overenie hypotéz / meranie pre pokračovanie

Zaznamenať zvlášť desktop Chromium, Android Chromium a iOS WebKit/standalone PWA:
- kliknutie z `/admin` → plemená → články → podujatia → adresár → organizácie → detail → späť → iná sekcia, aspoň 3 iterácie;
- presné trvanie prechodov (klik → route commit / hlavný obsah), počet RSC/API/D1 requestov, statusy HTTP, konzolové výnimky, long tasks/INP, pamäť na opakovaných editáciách;
- preteky pri rýchlom dvojkliku/Back/Forward; spomalený 5–15 s RSC, HTTP 500, neodpovedajúci doplnkový panel; retry a zachovanie dirty form;
- `/admin/organizacie/128`: server trace + identifikácia konkrétneho odmietnutého promise; overenie, že nepodstatná chyba nezrúti editor;
- `EXPLAIN QUERY PLAN`, počty a čas D1 dotazov, indexy, zvlášť organizácie a notification summary;
- reštart/zmena verzie v iOS PWA; overiť, či nespôsobuje zvláštne stale RSC alebo chybný stylesheet, nediagnostikovať bez dôkazu.

## D. Plán v rámci tohto istého PR (bez otvárania ďalších PR)

1. **Hotovo:** statický audit, inventúra, konkrétne riziká a reprodukčné hypotézy.
2. Stabilizácia Link/router/RSC a navigačného retry.
3. Zjednotenie guardov a history, ochrana draftov.
4. Oddelenie blokujúcich/sekundárnych serverových dát po admin agendách.
5. Profilovanie a optimalizácia D1/API bez straty synchronizácie.
6. React, ľahšie client bundle, memory/listy.
7. PWA/iOS/Android regresie a verzie po deployi.
8. Error boundaries, stuck transition a užívateľská obnova.
9. Playwright a reálne regresné merania.
10. Finálne testy, rebase na aktuálny main, merania pred/po a správa.

**Stav testov v kroku 1:** žiadne testy neboli spustené; bez produkčnej telemetrie sa nepokúšame uvádzať vymyslené čísla. **Zmeny aplikačného runtime v kroku 1:** žiadne. Dokument je statická auditná báza pre všetky ďalšie commity v jednom PR.
