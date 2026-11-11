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
2. [ ] **LCP na mobile/desktop.** Identifikovať skutočný LCP element Lighthouse/CrUX; hero priority, formáty, `srcSet`, `sizes`, preloading iba pri merateľnej výhode a bez duplicít.
3. [ ] **CSS cost a render-blocking.** Zmerať build CSS, vybrať len nepoužívané/zdieľané pravidlá a presunúť admin CSS mimo verejnej vetvy bez zmeny vzhľadu; regresné vizuálne testy.
4. [ ] **JavaScript a hydration.** Analýza route chunkov, minimalizovať client boundary, presunúť nevyhnutnú interaktivitu do izolovaných komponentov; bez zhoršenia navigácie.
5. [ ] **Úvodná stránka / D1.** Zmerať náklady paralelných čítaní, odstrániť iba preukázané duplicity, overiť obsah, poradie, publikovanie a SEO.
6. [ ] **HTML/RSC/cache.** Preskúmať reálny HIT/MISS, TTFB a invalidáciu; nikdy necacheovať administráciu, partnera, cookies, autentifikované, query alebo RSC požiadavky.
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
