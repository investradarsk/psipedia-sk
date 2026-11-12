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
7. [x] **Fotografie a médiá.** Kompresia/rozmery, správne `srcSet`, lazy loading pod prvým viewportom, stabilné rozmery pre CLS; bez odstránenia originálov.
8. [x] **Adresár, podujatia, plemená, mapy.** Route-specific profily, zoznamy a filtrovanie, mapové knižnice načítavať až pri potrebe, priebežne kontrolovať UX a funkčnosť.
9. [x] **Tretie strany a dlhé úlohy.** Skripty analytiky, súhlasov a reklám, event handlery, INP; rešpektovať consent, reklamnú funkcionalitu a interný traffic.
10. [x] **Záverečný kódový audit, oprava zachytených regresií a CI brána (merania čakajú na porovnateľné nasadenie).** Opakovať Lighthouse mobil/desktop na rovnakých URL, rovnakom prostredí a intervaloch, porovnať skóre, LCP, CLS, TBT, skutočné INP len ak sú dostupné field dáta; testovať desktop/mobil, skontrolovať odkazy a SEO.

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


## Krok 7 — menej dát pre obrázky, responzívne mriežky, LCP a CLS

**Audit existujúcej infraštruktúry:** Verejné R2 obrázky už používajú URL `/media/...`, povolené šírky `160–1920` cez `?w=`, Cloudflare Images vytvára WebP s kvalitou 76 a originálne súbory v R2 sa vracajú bez zmeny. `responsiveMediaSrcSet` striktne odmieta cudzie, súkromné, nebezpečné a už parametrizované URL. Route `/media` už má samostatnú 300 s lokálnu edge cache. Túto funkcionalitu ani zásady vydávania originálov netreba prerábať.

**Zmeny:**
1. `components/directory-card.tsx`: namiesto len plného `src` dostane malá karta obrázok vo variantoch 160/320 px a `sizes` 76 px mobil / 88 px desktop. Rozmery 88×76 v atribútoch spolu s pevnou CSS šírkou/výškou rezervujú rámik.
2. `components/help-card.tsx`: bezpečné R2 varianty 160/320/480/640 px, `sizes` podľa 96/112/180 px slotu.
3. `components/adoption-card-media.tsx`: varianty 160–960 px a `sizes` pre úzky mobilný riadok a väčšiu desktopovú kartu.
4. `components/public-profile/public-profile-hero.tsx`: hlavná detailná fotografia používa 320–1280 px varianty + reálny mobil/desktop `sizes`; `loading="eager"` a `fetchPriority="high"` ostali.
5. `app/plemena/[slug]/page.tsx`: primárna fotografia plemena má explicitné `sizes`, `loading="eager"` a `fetchPriority="high"`; nižšie zobrazená galéria používa `loading="lazy"` a presnejšie `sizes`. Podobné plemená majú zmenšené 180 px hinty. `components/breed-card.tsx` / `components/breed-comparison.tsx` dostali hinty zodpovedajúce kartám.
6. `app/page.tsx`: fotografia v malom pravom zozname podujatí dostala správny `sizes="76px"` namiesto predvolenej 100vw voľby prehliadača.
7. `components/public-visual-system/public-photo-gallery.tsx`: `sizes` pri 3-stĺpcovej desktop / 2-stĺpcovej mobilnej galérii rešpektuje skutočné rozmerové obmedzenia CSS a má horný limit 394 px na širokých monitoroch. Breed/editorial majú samostatné hinty, široké redakčné obrázky si uchovávajú väčší slot. Neodkazové fotografie majú intrinsic atribúty 1280×960 (CSS už používal 4:3 aspect ratio a 16:9 override pre široké bloky); odkazy PhotoSwipe a originály zostávajú nezmenené.

**Overenie:** upravený `tests/public-media-responsiveness-1216.test.mjs` a existujúci `tests/public-photo-gallery.test.mjs` sú pridané do `npm run test:homepage-media`. Kontroly pokrývajú zdrojové URL, jednotlivé šírky, lazy vs high-priority hero, media grid, rozmery/CLS a zákaz transformácií pre cudzí/súkromný obsah.

**Limity a akceptácia:** Zdrojové R2 obrázky sa nemenia, neprepisuje sa uložený Notion odkaz a nevzniká nová migrácia. Nenastavujeme agresívne globálne `loading="lazy"` pre above-fold hero a nemeníme kvalitu kompresie bez Lighthouse. Voľba menšieho kandidáta závisí aj od DPR a šírky konkrétneho zariadenia; preto nemožno tvrdiť konkrétne prenesené kB alebo CLS zisk bez porovnateľného prehliadačového merania a validácie skutočného DOM. Následné merania mobil/desktop, kontrola fotografie pri zlyhaní transformácie a vizuálne porovnanie všetkých galérií musia prebehnúť pred merge v kroku 10.

Referencia: https://web.dev/articles/serve-responsive-images a https://web.dev/articles/optimize-cls


## Krok 8 — výkon verejných šablón adresára, kalendára, atlasu plemien a mapy

**Doterajšie mechanizmy zachované:** úvodné údaje a SEO sa generujú serverovo. Google renderer sa už načítava cez `next/dynamic` len na mapovej stránke a samotný Google SDK má samostatnú kontrolu súhlasu. Desktopový FullCalendar má vlastný lazy chunk; mesačné a denné načítanie podujatí už používa `AbortController`, malú krátkodobú klientsku cache a preklápanie mesiacov bez reloadu. Na týchto hraniciach nie je potrebné pridávať ďalšie vrstvy ani externé platené volania.

**Zmeny v tomto PR:**

1. **Adresár:** `components/directory-page.tsx`: náhľady kategórií (len nefiltrovaný prehľad, `getDirectoryCategoryPreviews(5)`), hero vizuál a redakčný bočný panel sa načítavajú v **jednom `Promise.all`**. Predtým sa náhľady čakali pred ďalšími dvoma nezávislými D1 čítaniami. Filtre a celá stránkovaná množina profilov sú bez zmeny. Keď nejde o prehľad, náhľady sa naďalej vôbec nenačítajú.
2. **Plemená — filtrovanie:** nový čistý modul `lib/breed-browser-search.ts` s `indexBreedSearch` a `filterIndexedBreeds`. Atlas znormalizuje vyhľadávacie texty pri zmene kolekcie plemien a pri každom stlačení klávesu už len porovnáva hotový text. Zachovaná skladba vyhľadávaných polí, diakritika, veľké/malé písmená, FCI sekcia, pôvod a poradie výsledkov.
3. **Plemená — FCI zoskupovanie:** `groupVisibleBreeds` prejde výslednú kolekciu iba raz, vytvorí FCI buckety a zoradí len zaplnené skupiny. Predchádzajúci renderer robil pre každú skupinu nový `filter()` cez celý zoznam. Výstup je rovnaký: prvé tri plemená, odkazy a možnosť rozbaliť všetky ostávajú.
4. **Podujatia:** `components/event-calendar.tsx` pomocou `useMemo` opakovane používa mriežku dní podľa mesiaca, súhrny dátumov podľa načítaných podujatí a denné udalosti podľa zvoleného dňa. Vedľajšie UI udalosti (napr. otvorenie filtra) už nemusia znovu prepočítavať pole podujatí. Žiadna zmena backend endpointu, pravidiel stavov alebo navigácie cez históriu prehliadača.
5. **Mapa:** `components/map/map-experience.tsx`: transformácia odpovede na markery a skupiny zhlukov je memoizovaná podľa samotnej API odpovede v hlavnej mape aj výsledkovom paneli. Posúvanie spodného panela či výber profilu už nemusia prechádzať všetky zhluky. `GoogleMapRenderer` zostáva dynamicky načítaný a verejné mapové API aj Google billing limity zostávajú nedotknuté.
6. **Testy:** `tests/public-route-performance-step8.test.mjs` porovnáva nový indexový filter a FCI grouping s pôvodnou logikou na kombináciách query, skupina, sekcia, pôvod; ďalej kontroluje bezpečné paralelné načítanie adresára, memoizáciu v kalendári aj mape a pôvodnú lazy hranicu. Zapojené do `npm run test:perf-fastpaths` spolu s bezpečnostnými testami z predchádzajúcich krokov.

**Overovanie a limity:** samostatne vykonané porovnanie extrahovaných čisto JavaScriptových funkcií pre 344 syntetických plemien a 800 kombinácií filtrov bez rozdielu v obsahu/poradí; 6 nových regresných assertions prešlo v izolovanom vykonaní. To **nie je úplný Node/CI test suite, build ani produkčný Lighthouse**. Výkon nie je garantovaný v ms a závisí od skutočného počtu profilov, latencie D1 a prevádzky prehliadača. Nezmenila sa D1 schéma, počet podujatí na stránku, produkčné SEO správanie, administrácia ani synchronizácia s Notion.

Referencie: https://react.dev/reference/react/useMemo a https://web.dev/articles/rendering-performance


## Krok 9 — skripty tretích strán, consent, práca hlavného vlákna a INP

**Audit:** `components/cookie-consent.tsx` už striktne viaže GA4 na `analytics` alebo `advertising` a vylučuje Admin/Partner/review-auth, interné návštevy, nechcené AI-referral počítanie a kontroluje súhlas **opakovane po dokončení externého skriptu**. `components/programmatic-ad-loader.tsx` používa centrálnu kontrolu `canLoadProgrammaticAds` (iba reklamný súhlas, platné publisher ID, zapnutý feature flag), kontrolu interných návštev a oddeľuje Google AdSense od serverových reklám. Existujúce consent/revoke/funkčné merania sú kritické; nemeňme začiatok GA4 merania a nevymýšľajme fiktívne zlepšenie INP.

**Uskutočnené zmeny:**

1. **`lib/defer-public-third-party.ts`** — čistý testovateľný pomocník na odloženie *neurgentného* klientského skriptu. `requestIdleCallback` s deadline 900 ms, pre Safari/embedded prehliadače jeden `setTimeout` s rovnakým deadline. V oboch režimoch je úloha zrušiteľná, nevyžaduje polling a nikdy sa nesmie vykonať dvakrát.
2. **`components/programmatic-ad-loader.tsx`** — keď stránka pri prvom hydratovaní narazí na už uložený reklamný súhlas, vloženie Google AdSense skriptu odloží až na idle/deadline; tým nezaťažuje prioritný prvý interval vykreslenia/internačnej odozvy. **Pri priamom novom kliknutí na súhlas alebo pri zmene interného režimu sa oprávnená akcia spracuje okamžite.** Pred skutočným vložením skriptu sa **nanovo overí** súhlas, interná návšteva, súkromná cesta a existencia načítaného skriptu. Ak návštevník pred dokončením úlohy zmení súhlas, je pending úloha zrušená; cleanup ju ruší aj pri prechode na inú trasu. Žiadna reklama bez súhlasu, žiadna duplicita skriptov; súčasné zobrazovanie priamych kampaní sa nemení.
3. **`components/back-to-top.tsx`** — pasívny scroll listener sa zoskupuje do najviac jedného `requestAnimationFrame` za snímok. React `setVisible` sa zavolá iba pri skutočnom prekročení 480 px; pri iných posunoch sa zbytočne neplánuje render. Odstránenie listenera a zrušenie čakajúceho frame pri unmount; samotná klávesnicová prístupnosť a tlačidlo zostali rovnaké.
4. **`tests/public-third-party-inp-step9.test.mjs`** — 7 kontrol: idle/deadline, presné volanie raz, zrušenie pred spustením, fallback, ochranné podmienky programmatickej reklamy, zachovanie GA4/AI-referral/monetizačných kontraktov a frame-throttling tlačidla. Zapojené do existujúceho `npm run test:perf-fastpaths`. Samostatne izolovane vykonaných 7/7 úspešných testov; nie je to potvrdenie full Node CI ani E2E.

**Bez zmien:** GA4 ID, poradové udalosti, `send_page_view: false`, súhlas na reklamné a analytické cookies, synchronizácia medzi záložkami, priamo spravované kampane, označenie `Reklama`, interný traffic, admin, Notion, R2, D1, Cloudflare billing. Zrušenie reklamného súhlasu po už vloženom skripte stále používa pôvodné obnovenie stránky. Neklameme o zmeranom `INP`, ktorý potrebuje terénne (field) dáta; Lighthouse/TBT, request waterfalls, marketing udalosti a click/scroll testy na mobiloch patria do záverečného kroku 10. Eventuálne ďalšie úpravy závisia od konkrétnych dlhých úloh z profilu prehliadača.

Referencie: https://web.dev/articles/optimize-inp a https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback


## Krok 10 — QA nálezy, opravy a rozhodnutie o release

**Rozsah:** PR #1317, jedna vetva `perf/public-web-10-steps-20261111`. Žiadne produkčné zápisy, meranie z používateľských dát, úpravy Notion ani SQL migrácie.

### Zachytené a opravené regresie

1. Predchádzajúci hlavný `Playwright E2E and production smoke` build gate skončil na `npm run lint`: dve **errors** v `components/lazy-dog-age-calculator.tsx`. Pomenovanie premennej `module` bolo zakázané pravidlom Next.js; vetva bez `IntersectionObserver` volala `setEnabled(true)` synchronne v `useEffect`. Premenná bola premenovaná na `calculatorModule`, fallback je teraz pripojený k `requestAnimationFrame` a pri unmount sa zruší. Rovnako zostáva funkčný Safari fallback, lazy import, `Suspense` a placeholder.
2. Nová cielená regresná sada odhalila zastarané tvrdenie v `tests/monetization-foundation.test.mjs`: posledný selektor `.admin-section-item` sa očakával *vo verejných* `app/globals.css`, hoci bol správne odrezaný v kroku 3 do Admin-only CSS. Test teraz končí na uzatváracej zátvorke existujúceho verejného `@media (max-width: 680px)`. Vizuál cookies sa nezmenil; osobitne bolo skontrolovaných desať CSS invariantov.
3. Vyhnúť sa prehnanému tvrdeniu, že kontrola zdrojového kódu alebo Lighthouse produkčného `main` dokazuje zrýchlenie **tohto nezlúčeného PR**. Neprehlásiť `INP` za zmerané z Lighthouse laboratórnych údajov (Lighthouse obsahuje `TBT`, nie field INP).

### Automatizovaná brána

Nový súbor `.github/workflows/public-web-perf-10-final.yml` spúšťa len pri výkonovej vetve: `npm run test:perf-fastpaths`, `npm run test:homepage-media`, `npm run test:public-css-scope`, dizajnové tokeny, `npm run test:events-public-ux`, `npm run test:map-public-ui`, FCI crawl, monetizáciu a AI referral. Zámerne **neduplikuje** produkčný build, ktorý beží v existujúcom hlavnom CI. Kontroluje hlavne bezpečnosť cache, SSR/FCI obsah, obrázky, CSS, event/month navigáciu, mapové consent a marketingové súhlasy.

Na opravenom SHA `7287dd95178d588507ade213a8b49107a50c54bf` nový cielený GitHub CI workflow `PUBLIC-WEB-PERF-10 focused regression gate` skončil **SUCCESS**. Samostatný `Public HTML Cache Safety Guard (offline)` a `Public DS-5 card and media contract` sú tiež **SUCCESS**. Stav hlavného produkčného buildu/lintu sa posudzuje osobitne podľa **najnovšieho** SHA, nie starých úspešných commitov. Ak vzniknú ďalšie commity, všetky výsledky z predchádzajúceho SHA už nie sú konečným merge dôkazom.

### Nepotvrdené metriky — žiadne vymyslené zrýchlenia

| Metrika | Stav pre nezlúčený PR | Meranie |
| --- | --- | --- |
| Lighthouse performance (mobil / desktop) | **UNKNOWN** | dve porovnateľné laboratórne série |
| LCP (mobil / desktop) | **UNKNOWN** | LCP node a čas, rovnaká šírka a profil |
| CLS (mobil / desktop) | **UNKNOWN** | Lighthouse a vizuálny scroll kontrolný záznam |
| TTFB / HIT→MISS | **UNKNOWN** | verzovaný Worker deploy + read-only `perf:html-cache:probe` |
| Prenos JS/CSS/fotiek | **UNKNOWN** | real transferred bytes + waterfall |
| TBT | **UNKNOWN** | Lighthouse lab, nie náhrada za field INP |
| INP p75 | **UNKNOWN** | CrUX alebo iné spoľahlivé field dáta, nie syntetický odhad |
| Admin po extrakcii CSS | **POTREBNÝ vizuálny smoke test** | desktop a mobil, najmä Admin PWA |

**Podmienka porovnania:** `scripts/web-perf-observability.mjs` už existuje a jeho workflow `WEB-PERF Observability` pre PR zámerne **nespúšťa živý Chrome/Lighthouse** (iba offline testy). Meria aktuálnu produkciu `https://psipedia.sk`. Nie je dôkazom výkonu nenasadeného PR. Bez porovnateľného preview alebo nasadenia verzovaného SHA **nie je čestné vyhodnotiť before/after**. Po dostupnom deployment SHA zachovať rovnaké URL, `baseline` režim (3 merania × 8 URL × 2 zariadenia) a konštantné verzie Chrome/Node/Lighthouse, vzdialenosť merania, cookie/consent, cache stav a rozsah zdrojových dát. `scripts/web-perf-compare.mjs` vyžaduje aj nezávislé identifikátory predchádzajúceho a nasadeného produkčného SHA; neodhadovať ich.

**Bezpečné príkazy pre kontrolu:**
- `npm run test:perf-fastpaths`
- `npm run test:homepage-media`
- `npm run test:public-css-scope`
- `npm run test:events-public-ux && npm run test:map-public-ui`
- `npm run test:monetization && npm run test:ai-referral`
- `npm run lint && npm run build` (v hlavnom CI)
- `npm run perf:html-cache:probe -- / /adresar/veterinari /plemena` (len anonymný read-only HTTP GET, po vhodnom nasadení)

### Pred zlúčením povinné release gate

- Aktuálny SHA musí mať **SUCCESS** v hlavnom `Playwright E2E and production smoke` aj cielenej `PUBLIC-WEB-PERF-10` suite. Predchádzajúca zelená z iného SHA nestačí.
- Overiť vizuálne mobil/desktop: hero homepage a plemien, zoom galérie PhotoSwipe, veková kalkulačka, 2/3 stĺpcové fotogalérie, directory filtre, podujatia bez reloadu, mapa bez súhlasu/s ním, cookies/ad/GA4 (vrátane odvolania), Admin CSS/PWA; nezamieňať E2E izolovaného lokálneho servera za produkčný smoke test.
- Potvrdiť absenciu HTTP 500, 404 image variantov, JS chunk errors, súkromného SSR cache a regresií v LCP/CLS; predchádzajúci incident HTTP 500 je dôvodom nevynechať smoke.
- Zaznamenať pred/po výkon iba keď existujú dva porovnateľné deploye. Bez toho uviesť `UNKNOWN`. Tento bod môže byť dokončený len po preview/nasadení — nie falošným vyhlásením o zlepšení pred merge.
- **NEZLUČOVAŤ automaticky.** Tento desaťkrokový PR je po kódovej stránke pripravený na review a CI validáciu; merge je oddelené vedomé rozhodnutie až po zelených release gates.

