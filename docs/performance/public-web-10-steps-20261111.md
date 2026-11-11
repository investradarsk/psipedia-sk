# Verejný web Psipedia.sk — optimalizácia výkonu (10 krokov, jeden PR)

Dátum začatia: 2026-11-11. Rozsah: **verejný web**, nie Admin, editory, Notion synchronizácia ani produkčné D1 migrácie. PR zostáva otvorený až do dokončenia a kontroly zmien.

## Referenčný stav — overené v kóde pri kroku 1

- Framework: `vinext@0.0.50`, `vite@8.0.13`, `next@16.2.6`, Cloudflare Workers a D1. Nepoužívať nekontrolovane optimalizácie závislé od `next build` alebo experimentálnych funkcií Next.js, ktoré Vinext nemá podporované.
- `app/layout.tsx` rendruje dynamickú verejnú navigáciu; obsah sa serverovo načítava a verejné anonymné HTML sa selektívne ukladá na Worker edge.
- `worker/index.ts` má bezpečnostne obmedzenú edge cache HTML (45 sekúnd) a `/media` má vlastnú edge cache (300 sekúnd); nehýbať s personalizovanými odpoveďami a RSC.
- `components/public-visual-system/unified-section-hero.tsx` už používa `fetchPriority="high"` pre veľký hero obrázok, keď je variant `homepage-style`, aj `srcSet`.
- `lib/navigation-store.ts` už používa 30-sekundovú in-isolate cache s invalidáciou; nepridávať druhú vrstvu bez dôvodu.
- `app/globals.css` má v zdrojovom kóde 339 828 znakov (18 054 riadkov) a obsahuje aj administrátorské selektory. **To nie je veľkosť prenášaného CSS po kompresii.** Zmerať jeho reálnu účasť na verejnom bundle a rozdeliť bezpečne.
- `app/page.tsx` spúšťa 7 dátových operácií paralelne vrátane výberu 120 článkov. Zmerať D1/TTFB pred zmenami query plánov, neskracovať výber článkov naslepo.
- Repo už má `scripts/web-perf-observability.mjs`, `scripts/web-perf-compare.mjs` a automatizované workflows pre Lighthouse. Namiesto duplicitného nástroja ich použiť pre baseline, rozšíriť podľa zistení.

**Zatiaľ neexistuje nová porovnateľná mobilná a desktopová Lighthouse baseline vytvorená v rámci tohto PR.** Zmeny sa preto nemôžu označiť za preukázané zlepšenie skóre.

## Krokový plán

1. [x] **Bezpečné zrýchlenie opakovaných SSR hero renderov.** Cache iba verejných D1 riadkov vizuálov: 15 s TTL, maximálne 128 kľúčov na isolate, deduplikácia súbežných čítaní, invalidácia pri úspešnom uložení/zmazaní. Admin `getStoredSectionVisual` zostáva vždy priamo z D1. Využiť existujúcu testovanú cache implementáciu.
2. [x] **LCP na mobile/desktop.** Identifikovať skutočný LCP element Lighthouse/CrUX; hero priority, formáty, `srcSet`, `sizes`, preloading iba pri merateľnej výhode a bez duplicít.
3. [x] **CSS cost a render-blocking.** Zmerať build CSS, vybrať len nepoužívané/zdieľané pravidlá a presunúť admin CSS mimo verejnej vetvy bez zmeny vzhľadu; regresné vizuálne testy.
4. [x] **JavaScript a hydration.** Analýza route chunkov, minimalizovať client boundary, presunúť nevyhnutnú interaktivitu do izolovaných komponentov; bez zhoršenia navigácie.
5. [x] **Úvodná stránka / D1.** Zmerať náklady paralelných čítaní, odstrániť iba preukázané duplicity, overiť obsah, poradie, publikovanie a SEO.
6. [x] **HTML/RSC/cache.** Preskúmať reálny HIT/MISS, TTFB a invalidáciu; nikdy necacheovať administráciu, partnera, cookies, autentifikované, query alebo RSC požiadavky.
7. [ ] **Fotografie a médiá.** Kompresia/rozmery, správne `srcSet`, lazy loading pod prvým viewportom, stabilné rozmery pre CLS; bez odstránenia originálov.
8. [ ] **Adresár, podujatia, plemená, mapy.** Route-specific profily, zoznamy a filtrovanie, mapové knižnice načítavať až pri potrebe, priebežne kontrolovať UX a funkčnosť.
9. [ ] **Tretie strany a dlhé úlohy.** Skripty analytiky, súhlasov a reklám, event handlery, INP; rešpektovať consent, reklamnú funkcionalitu a interný traffic.
10. [ ] **Záverečný tuning a kontrola regresií.** Opakovať Lighthouse mobil/desktop na rovnakých URL, rovnakom prostredí a intervaloch, porovnať skóre, LCP, CLS, TBT, skutočné INP len ak sú dostupné field dáta; testovať desktop/mobil, skontrolovať odkazy a SEO.

## Meracie ciele a akceptácia

- Cieľ pre dobré Core Web Vitals (75. percentil skutočných návštev): **LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1**.
- Cieľ **Lighthouse Performance 90+ na mobile aj desktope** na hlavných reprezentatívnych šablónach; 100 nie je technická garancia a skóre testov kolíše.
- URL a reprodukovateľný runner: `scripts/web-perf-observability.mjs` (`baseline` je 8 URL × 2 zariadenia × 3 behy), porovnanie `scripts/web-perf-compare.mjs`. Chýbajúci výsledok alebo HTTP 500 nikdy nepočítať ako zlepšenie.
- Pred a po: TTFB, LCP vrátane prvku, JS/CSS/image transfer, TBT, CLS, error status, HIT/MISS; INP iba ak ho poskytujú skutočné field dáta.
- Každá etapa musí zachovať správne funkčné údaje, prístupnosť, zobrazenie, smerovanie, canonical/robots, publikovanie a ochranu personalizovaných odpovedí.
- Pri preukázanom zhoršení alebo zlyhaní zostáva zmena neodovzdaná, pokiaľ nie je opravená alebo odôvodnená.

## Overené zdroje a open source

- Google web.dev: https://web.dev/articles/top-cwv (LCP discoverability/priority, cache, INP/CLS).
- Google Search Central: https://developers.google.com/search/docs/appearance/core-web-vitals (p75 limity metrík).
- Cloudflare Workers static assets: https://developers.cloudflare.com/workers/static-assets/headers/ (immutable cache len pre fingerprinted assets).
- Cloudflare Cache: https://developers.cloudflare.com/cache/get-started/ (HTML nemá implicitnú univerzálnu cache).
- Vinext: https://github.com/cloudflare/vinext (verziová kompatibilita a limity).
- Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci (existujúca OSS metodika pre opakované merania).

## Krok 1 — implementácia a hranice

Zmena cieli výlučne časté opakované vyhľadávanie **verejného hero vizuálu** `section_visuals` podľa `visualKey`. Používa existujúci `createShortLivedAsyncCache` (súbežné dopyty sa zlúčia, zamietnutý dopyt sa necacheuje, invalidácia počas čítania neotrávi novú cache). Zápisy invalidujú aktuálny isolate; ostatné isolate majú maximálne krátke 15-sekundové okno. Administrátorský editor nečíta zo zdieľanej cache. Bez migrácie, nového balíka alebo konfigurácie Cloudflare.

Statické regresné testy sú v `tests/performance-fastpaths.test.mjs`; vykoná `npm run test:perf-fastpaths`. Bez aktuálneho produkčného benchmarku nepripisovať cache číselné zrýchlenie ani bodový nárast Lighthouse.

## Krok 2 — skoršie vykreslenie hlavného hero bloku (LCP)

**Identifikovaná príčina v kóde:** `app/page.tsx` pôvodne čakal na `Promise.all` so siedmimi operáciami D1 (články, podujatia, pomoc, adresár, hero, plemená a bannery), až potom začal vracať HTML úvodnej stránky. To znamenalo, že pomalšia nesúvisiaca sekcia pod hero blokovala vykreslenie LCP kandidáta — veľkej fotografie a titulku.

**Implementované:**
- `getSectionHeroVisual("home.hero")` sa spúšťa samostatne a pred šiestimi operáciami obsahu; všetkých sedem operácií zostáva paralelných.
- Hlavná stránka po získaní hero dát vracia stabilnú hlavičku a `UnifiedSectionHero` ako prvé; ostatné šesť výsledkov vykresľuje serverový `HomeBelowHero` pod `<Suspense fallback={null}>`. Sekcie, odkazy, poradie, dostupnosť publikovaného obsahu, atribúty a počet dotazov sa nemenia.
- Zdieľaný `UnifiedSectionHero` explicitne používa `loading="eager"` a zachováva `fetchPriority="high"` pre variant `homepage-style`, `srcSet` pre schválené R2 kandidáty, `sizes` pre mobil a desktop a pôvodný CSS crop.
- **Bez duplicitného `<link rel="preload">`**: hero obrázok je objaviteľný priamo v HTML a odkaz na hero sa môže meniť v existujúcom Admin nastavení. Samostatný preload pre default obrázok by mohol sťahovať nesprávnu či dvojitú fotografiu.
- Regresné kontraktné testy v `tests/performance-fastpaths.test.mjs` kontrolujú separáciu prísľubov, existenciu a poradie všetkých šiestich načítaní, zachovanie hero priority a neprítomnosť duplicitného preloadu.

**Limity a overenie:** Táto zmena vytvára podmienky pre skoršie streamovanie HTML; bez prevádzkového benchmarku sa netvrdí, že už dosiahla konkrétny počet ms alebo Lighthouse bodov. Prechod na `Suspense` musí prejsť buildom a mobilnými/desktopovými smoke testami pred merge; pri vypnutom streamingu je prínos závislý od Vinext runtime. Neskorší krok 10 overí porovnateľné opakované merania na stránkach a reálne LCP elementy (Lighthouse/LCP waterfall; CrUX len dostupné field dáta).

Technické zdroje:
- https://web.dev/articles/optimize-lcp — LCP obrázky musia byť v HTML objaviteľné a s vysokou prioritou, nie lazy.
- https://web.dev/articles/preload-responsive-images — nepreloadovať už objaviteľné obrázky bez dôkazu o výhode; pri `srcSet` hrozia duplicitné dáta.

## Krok 3 — zmenšenie globálneho CSS a oddelenie Adminu

**Pred:** `app/globals.css` obsahoval 339 828 znakov (18 054 riadkov), vrátane stále prítomných admin-only selektorov. Starší administrátorský balík `app/admin/admin-legacy-scoped.css` bol síce už správne izolovaný, no ďalšie admin pravidlá zostali zbytočne globálne. V `app/layout.tsx` sa navyše importovalo čisto administrátorské `navigation-hotfix.css`.

**Implementované:**
- 416 koreňových a 88 `@media` = **504 výlučne administrátorských CSS pravidiel** premiestnených do `app/admin/admin-root-extracted.css`; import iba v `app/admin/layout.tsx`, pred existujúcou admin legacy/workspace vrstvou.
- Rovnako `app/navigation-hotfix.css` je teraz importované iba v administrátorskom layoute; pôvodný súbor ostáva zachovaný.
- `app/globals.css` sa zmenšil z 339 828 na 285 776 znakov: **mínus 54 052 znakov (15,9 %)**. Nástroj vybral celé pravidlá vrátane mobilných variantov, neodstránil samotné štýly.
- Konzervatívna výnimka: zmiešané selektory pre verejný web a Admin (`.admin-relation-grid`, `.admin-inquiry-body`, `.admin-directory-flags`) zostali v globálnom CSS. Zachované aj `.event-markdown`, všetky CSS premenné, verejné karty, fotografie, navigácia a príslušné `@media`.
- Pridané statické testy rozdelenia CSS a rozpočtu zdrojového súboru v `tests/public-css-scope.test.mjs`. Upravené pôvodné testy umiestnenia CSS: `tests/public-design-tokens.test.mjs`, `tests/section-navigation.test.mjs`, `tests/rendered-html.test.mjs`.

**Overenie:** V kóde sa skontrolovalo vyváženie blokov a 504 pravidiel s výlučne administrátorskými selektormi, prítomnosť výnimiek v pôvodnom CSS a importy iba na Admin route. **Nejde o skutočnú nameranú úsporu gzip/Brotli ani konečného CSS bundle;** tú poskytne až porovnateľný produkčný build a Lighthouse. Po presune môže zmena poradia CSS medzi root a route ovplyvniť kaskádu v Admine, preto pred zlúčením vyžaduje vizuálny smoke test adminových editorov a mobilného rozloženia. Zmeny nevyžadujú D1 migrácie, zmeny dát ani nové závislosti.

Dôležité: `globals.css` obsahuje ďalšie verejné CSS veľkého rozsahu. Automatická eliminácia podľa názvu bez kontroly používania by mohla rozbiť vzory a šablóny. Ďalšie čistenie vyhodnotiť až na základe build CSS reportu, route coverage a snímok kľúčových stránok.

## Krok 4 — odložený JavaScript a izolovaná hydratácia (nižšia záťaž pred interakciou)

**Audit existujúcich odkladov:** `LazyPublicSearchSuggestions` už používa `React.lazy` až od dvoch znakov vyhľadávania; desktopový FullCalendar je už samostatný `next/dynamic` komponent; Google Maps renderer má samostatný JS bundle a kontrolu súhlasu. Existujúce funkčné mechanizmy sa nemenili, aby nevznikli duplicity a regresie.

**Nové zmeny:**

1. **PhotoSwipe:** Z `components/public-visual-system/public-photoswipe-enhancer.tsx` bol odstránený runtime statický import `photoswipe/lightbox`; teraz sa Lightbox controller importuje dynamicky len po priblížení ku galérii (`IntersectionObserver`, predstih 600 px) alebo pri prvom kliknutí. Samotný PhotoSwipe core bol už importovaný až pri otvorení a tak ostal. Zachovaný predchádzajúci import CSS, výpočet rozmerov fotografií, pôvodný linked variant a standard cleanup. Prvý klik pred dokončením importu čaká na controller a otvorí správny index; pri chybe chunku použije priamy odkaz na fotografiu. Modifier-click a explicitné ciele odkazov sa nemenia. Observer sa viaže na prvý skutočný link (nie wrapper s `display: contents`).
2. **Kalkulačka na konci homepage:** Nová klientská hranica `components/lazy-dog-age-calculator.tsx` používa `React.lazy` + `Suspense` pre `components/dog-age-calculator.tsx`; pri podpore `IntersectionObserver` sa skript načíta s predstihom 600 px pred príchodom používateľa. Fallback má stabilný minimálny rozmer, aby pri lazy rendrovaní nevznikal zbytočný CLS. Keď API `IntersectionObserver` chýba, skutočný kalkulátor sa načíta hneď. Funkcia výpočtu, jeho ovládacie prvky a hodnoty ostali nezmenené.
3. **Regresie:** `tests/performance-fastpaths.test.mjs` chráni dynamický import lightboxu, funkčnosť odkazov a prvého kliknutia, vlastnosti observera a samostatnú kalkulačku; existujúce integračné kontrakty PhotoSwipe a domovskej stránky ostávajú zachované.

**Účel:** Znížiť JavaScript, ktorý musí prehliadač parsovať a vykonať pri prvej návšteve. Nie je to dôkaz konkrétnej úspory KB/CPU: bundle analyzer a opakované Lighthouse merania ešte neprebehli. Nie všetky client komponenty sa dajú bez rizika odložiť (napr. primárna navigácia a vyhľadávanie musia reagovať okamžite). Reálny build a mobilné/desktop testy vrátane otvorenia PhotoSwipe pred dokončením načítania a ovládania kalkulačky po zobrazení sú nutné pred merge.

Referenčné postupy: https://react.dev/reference/react/lazy a https://web.dev/articles/reduce-javascript-payloads-with-code-splitting.

## Krok 5 — optimalizácia D1 dotazov domovskej stránky

**Audit:** `app/page.tsx` už spúšťa 7 logických zdrojov paralelne (hero samostatne), vrátane jediného skupinového D1 dotazu pre veterinárov a trénerov a jediného batch dotazu pre dve publikované vizuálne úpravy bannerov. `getPublishedArticleSummaries({ limit: 120 })` zásobuje najnovšie články a tri redakčné sekcie s vylúčením duplicít, preto nebol limit znížený bez dôkazu, že zostane rovnaký obsah. Predbežné merania TTFB a `EXPLAIN QUERY PLAN` na produkčnom D1 nie sú k dispozícii.

**Zmeny v existujúcom PR:**

1. **`lib/homepage-directory-query.ts`** — CTE `candidates` a `ranked` pracujú len s `id`, `name`, `category`, `featured` a dvomi indexmi rotácie. Zobrazované polia (`slug`, `city`, `district`, `image_url`, `thumbnail_display_json`) a náročná extrakcia `fallback_district` z JSON sa teraz načítajú až **po filtrovaní `card_rank <= ?`** cez join na `directory_profiles.id`. Filtre `status = 'published'`, pôvodná podmienka kanonického R2 obrázka a poradie `featured` / dennej rotácie sa nemenia. Stále ide o **jediný D1 roundtrip**, nie o N+1 čítania.
2. **`lib/article-store.ts`** — existujúci per-binding `WeakMap` cache pre `articleImageProjection` doplnený o `WeakMap` rozpracovaných `Promise` hodnôt. Ak viac paralelných verejných čítaní naraz zisťuje stĺpce `managed_articles`, zdieľajú jeden `PRAGMA table_info` dopyt. Po dokončení sa rozpracovaný Promise vymaže. Predchádzajúci režim kompatibilného fallbacku zostal nezmenený.
3. **Testy** — nový `tests/homepage-directory-query-performance.test.mjs` porovnáva celý výsledok originálneho aj optimalizovaného SQL nad reálnym SQLite (rôzne kategórie, poradia, dátumy/offsety, limity, zlé JSON, draft/published a neplatné obrázky); zapojený do `npm run test:homepage-media`. Statické kontraktné testy v `tests/homepage-media-quality.test.mjs` a `tests/performance-fastpaths.test.mjs` zabezpečujú neskoré načítanie JSON, bezpečné publikovanie a deduplikáciu metadátových čítaní.

**Hranice overenia:** samostatná lokálna kontrola parity ekvivalentného SQLite dotazu pre 20 kombinácií prešla; test zoznamu scenárov je uložený v repozitári, jeho CI výsledok ešte nie je potvrdený. Bez produkčného `EXPLAIN`, profileru a porovnateľného Lighthouse nemožno tvrdiť konkrétny pokles ms, D1 nákladov ani prenosu. Žiadna SQL migrácia, zmena schémy, indexov, publikovania, Notion synchronizácie ani administrácie.


## Krok 6 — Edge HTML cache, RSC bezpečnosť a HIT/MISS diagnostika

**Zistený základ:** Worker už má 45-sekundové `caches.default` **iba pre explicitné anonymné HTML** z `psipedia.sk`. Verziovaný kľúč `CF_VERSION_METADATA.id` nevráti staré asset hashe po nasadení novej verzie. Ide o lokálnu POP Cache API, nie globálne synchronizovanú cache. Existujúca invalidácia používa rovnaký verziovaný kľúč a ostatné POP sa spoliehajú na krátku TTL.

**Zmeny:**
1. V `worker/index.ts` sa okrem pôvodných blokácií cookies, Authorization, Cloudflare Access, Admin/Partner/API, query a RSC blokujú tiež Server Actions, Next client/middleware prefetchy a `Sec-Purpose`. Požiadavka so `Sec-Fetch-Dest` musí byť dokument a `Sec-Fetch-Mode` navigácia.
2. Požiadavky s vynúteným refreshom/revalidáciou (Cache-Control no-cache/no-store/max-age=0, Pragma no-cache, If-None-Match, If-Modified-Since, Range/If-Range) sa nikdy neuspokoja zo zdieľanej HTML cache.
3. Zdieľaný helper `isSafePublicHtmlVary` v `lib/public-anonymous-html-cache.ts` povoľuje iba Accept-Encoding a známe Next dokumentové Vary hlavičky; pri neznámych závislostiach (Accept-Language, User-Agent, Origin, experimenty) odpoveď nie je vhodná na URL-only cache. Oba režimy cachovania používajú rovnakú kontrolu. `X-Robots-Tag: noindex` nie je možné povýšiť na cacheable HTML.
4. 45 s TTL sa nemení; odstránené nepodporované `stale-while-revalidate=30` z Cache API. Cloudflare `cache.put/cache.match` nepodporuje SWR.
5. Read-only diagnostika: `npm run perf:html-cache:probe -- / /adresar/veterinari /plemena`. Na každý vybraný verejný path odošle dve sekvenčné, neprihlásené GET požiadavky, vypíše prvý/druhý čas do hlavičiek, HTTP status a cache HIT/MISS/BYPASS. Nečíta privátne stránky, neodosiela cookies ani query, nevykonáva zápisy. Meranie nemá za cieľ umelo zvyšovať záťaž a nie je náhradou za Lighthouse.
6. Regresné testy `tests/public-anonymous-html-cache.test.mjs`, `tests/public-html-cache-safety.test.mjs`, `tests/public-html-cache.test.mjs`, nový `tests/web-perf-html-cache-probe.test.mjs` a predchádzajúce perf testy sú v `npm run test:perf-fastpaths`.

**Zachované:** RSC/Flight sa **neukladá** do spoločnej HTML cache. Žiadna zmena Cloudflare nastavení, D1 migrácií, Adminu, Notion ani maximálneho TTL. Invalidácia cez Cache API je lokálna pre daný POP; okamžitá celosvetová invalidácia nie je garantovaná. Build, funkčné smoke testy a reálne HIT/MISS a TTFB zatiaľ neboli potvrdené a patria do kroku 10.

Zdroje: https://developers.cloudflare.com/workers/runtime-apis/cache/ a https://developers.cloudflare.com/workers/reference/how-the-cache-works/
