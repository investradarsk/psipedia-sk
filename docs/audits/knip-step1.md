# Psipedia.sk — Knip, krok 1/18 (iba audit)

## Účel
Zaviesť reprodukovateľný **read-only** scan nepotrebných súborov, exportov a npm závislostí.
Tento krok **nemení** admin, produkčný web, databázu, Notion ani obsah; automaticky nič neodstraňuje.

## Spustenie
- Lokálne po `npm ci`: `npm run audit:knip` (výpis do terminálu).
- Lokálne po `npm ci`: `npm run audit:knip:report` (dva súbory pod `reports/knip/`).
- V GitHub Actions: **PSIPEDIA — Knip unused-code audit**, automaticky na PR meniacom konfiguráciu a ručne na vetve `main`, keď bude workflow dostupný.
- GitHub Actions poskytne artefakt `psipedia-knip-<run>-<attempt>` s `findings.json` a `findings.md`, ak scan uspeje.

Príkazy používajú pevne určené `knip@6.45.1` cez `npm exec --package` namiesto pridania do `package-lock.json`.
Je to zámerná bezpečná prvá integrácia: `npm ci` aj produkčné dependencies ostávajú nezmenené.
Pred závislosťou na reporte treba úspešné CI vykonanie, ktoré nie je súčasťou samotného commitu.

## Metodika
- Next.js routy sa považujú za verejné vstupné body (môžu byť využité cez URL bez statického importu).
- Samostatne spúšťané skripty, testy, worker entrypointy a konfiguračné súbory sú považované za vstupné body.
- React komponenty, editorové moduly, admin funkcie a knižničné súbory sú v projektovom grafe: Knip môže hlásiť nepoužívané kusy.
- `knip.json` nezakrýva nálezy plošným ignorovaním `components/admin-*` alebo `lib/admin-*`.
- Build artefakty a `node_modules` sú mimo skenu.

## Ako vyhodnocovať nálezy
1. **Potenciálne nepotrebný súbor**: preveriť statické/dynamické importy, URL routovanie, konfiguračné a CI odkazy a generovanie komponentov.
2. **Potenciálne nepotrebný export**: preveriť dynamické načítanie, testy, string-based registry a volanie z externého systému.
3. **Potenciálne nepotrebná npm knižnica**: preveriť runtime načítanie, Cloudflare/Vite/Next plugin, build a skripty.
4. Prioritne prejsť `components/admin-*`, `app/admin/**`, `lib/admin-*` a staré wrappery/formuláre.

**Knip nepozná skutočnú frekvenciu používania admin funkcií používateľom.**
Používaný, ale nepotrebný panel nezachytí ako dead code. Ten vyžaduje ručný produktový audit.
Žiadny nález nie je dôvodom na automatické `--fix` alebo mazanie; pred každým odstránením treba potvrdiť volania a testy.

## Riziká a hranice
- Tento krok je neblokujúci: `--no-exit-code` nezhodí build kvôli nálezom, ale chyba nástroja sa stále musí opraviť.
- Workflow má iba `contents: read`, neprijíma produkčné tajomstvá a nevyvoláva mutácie.
- Scan môže mať falošné pozitíva pri dynamickom importe, komponentových registroch alebo špeciálnych Cloudflare integráciách.
- Nevykonáva sa `knip --fix`, `npm uninstall`, migrácia ani merge.
- **Stav:** konfigurácia a CI runner pripravené na review. Skutočný výsledkový report sa musí overiť z GitHub Actions artefaktu.

## Akceptácia
- [ ] PR workflow beží na presnom HEAD a nainštaluje existujúce závislosti cez `npm ci`.
- [ ] `reports/knip/findings.json` je parsovateľný JSON.
- [ ] `reports/knip/findings.md` obsahuje nálezy alebo informáciu o prázdnom výsledku.
- [ ] Nálezy pre admin sa ručne klasifikujú: kandidát / používa sa / nejasné.
- [ ] Žiadny runtime súbor, databáza, automatizácia ani produkcia neboli zmenené.
