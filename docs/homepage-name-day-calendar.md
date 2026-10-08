# HOMEPAGE-UX-ENHANCEMENTS-1 — interaktívne psie meniny

## Architektúra
- Kanonické dáta: existujúca D1 tabuľka `dog_name_days` (NAME-DAY-1). Žiadna migrácia, import, statický fallback, ani úprava zdrojových menín.
- Verejné čítanie: `getPublishedDogNameDaysForMonth`, parametrizované SELECT výhradne `status = 'published'`. Pri chybe databázy fail-closed na prázdny zoznam.
- Výpočet dneška: `Europe/Bratislava` vrátane prechodu UTC a nového roka.
- Mesačná mriežka/pondelkový začiatok/prestupný rok/navigácia: spoločné čisté utility existujúceho `event-calendar-view`.
- Verejná cesta: `/psie-meniny` s `?mesiac=YYYY-MM&den=YYYY-MM-DD`, prirodzené odkazy podporujú klávesnicu, históriu a čitateľné URL.
- Na homepage je výhradne malý dátový modul `HomeDogNameDayEntry`, vložený pred existujúci kalkulátor veku psa; iné bloky zostávajú nezmenené.

## Izolácia a kontrola kolízií
Nové CSS aj kalendár sú lokálne v module, globálna navigácia a hlavička nie sú upravované. Integrácia v `app/page.tsx` mení len import a jedno renderovanie mimo hero / článkov / podujatí / služieb. Keď PUBLIC-UX-FOUNDATION-V3 zmení rovnaký súbor, pred merge treba overiť jeho výsledný diff; nesmie sa prepísať nová verzia homepage. ADMIN-UX-HARDENING-1 sa nedotýkame.

## Testovanie
- `node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/dog-name-day-calendar.test.mjs`
- `npm run test:name-days`
- `npx playwright test tests/e2e/home-name-days-calendar.spec.ts tests/e2e/name-days.spec.ts`
- `npm run lint`, `npm run build`
- E2E kontroluje 375 / 390 / 430 / 768 / 1280 / 1440 px; 390/1440 px snímky pripája do Playwright reportu (bez produkčného deployu).

## Obmedzenia
Ak kanonický dataset nemá publikované meno pre daný deň, UI zobrazuje prázdny stav; mená sa nevymýšľajú. Screenshoty vyžadujú spustený lokálny alebo PR testovací build. Merge je manuálny, auto-merge OFF.

## Izolovaná PR vizuálna validácia
Samostatný `.github/workflows/homepage-name-days-ci.yml` iba pre tento modul spúšťa NAME-DAY unit/integration suite a desktop/mobile Playwright na lokálnom D1 bez produkčného deployu. Výsledný Playwright report vrátane 390 px a 1440 px screenshotov publikuje ako GitHub Actions artifact.
