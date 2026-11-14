# Psipedia.sk – krok 15/18: Kvalita údajov, Mapy a technické nástroje

**Dátum:** 14. 11. 2026  
**PR:** #1369 (Draft). Bez merge, produkčného deployu, zmien dát alebo platených API volaní.

## Východiskový audit

1. **Kvalita údajov** na `/admin/kvalita` už porovnáva **Aktuálny údaj** s **Nájdeným údajom** (aj stav `Prázdny`). Používa samostatné filtre podľa sekcie, typu údaja a profilu; metriky, manuálny Tavily formulár a schvaľovanie návrhov mali rozličné veľkosti kariet a rozostupy. Správanie schvaľovania bolo funkčné a **nemá sa prepisovať**.
2. **Mapy** na `/admin/mapy` obsahujú summary unresolved položiek, trojicu filtrov, manuálne platené Google kontroly, rozpočtové upozornenie, operátorské karty, overenie Place ID a stránkovanie. Na úzkych viewportoch je potrebné skrátiť rozostupy a vynútiť `min-width: 0` na vnorených prvkoch, nie schovávať pretekanie celej stránky.
3. **Nástroje** na `/admin/nastroje` už majú funkčný grid odkazov na import, Notion, GEO a Google Places; jednotlivé karty používali odlišnú šírku než bežný admin obsah. `/admin/nastroje/notion-audit` mala natvrdo nastavený 20px rozostup.
4. Základné tokeny a tlačidlá už existujú v admin V3/V4 a krokoch 3–14. Netreba nový framework, mapového providera ani nové formátovanie hodnôt.

## Zapracované vizuálne zmeny

- `AdminMissingQualityDashboard`: opt-in `data-admin-content-module="quality-review"`, kompaktné karty, jednotné nadpisy a filtre, jemnejšia metrika, bezpečné zalamovanie dlhých URL/e-mailov, 44px ovládanie a 16px mobilné formuláre. **Oba stĺpce porovnania ostali**, na mobile sú pod sebou. Súbory: `components/admin-missing-quality-dashboard.tsx`, `.module.css`.
- `AdminGeoOperatorDashboard`: opt-in `geo-operator`, existujúce `data-admin-list-filters` a `data-admin-list-pagination` pre zdieľané vizuálne pravidlá, lokálne kompaktné filtre a karty, wrap textu a akcií, 16px mobilné ovládanie, prehľadné počítadlá hromadného výsledku. **Platené tlačidlo, limit dávky, cena a varovanie zostali prístupné a bez zmeny funkcie.**
- `/admin/nastroje`: opt-in `technical-tools`, rovnomerné kompaktné karty s pôvodnými odkazmi.
- `/admin/nastroje/notion-audit`: opt-in `notion-audit`, spoločné admin tokeny namiesto inline `gap: 20`.
- Nové `app/admin/admin-operations-step15.css` je importované **iba v `app/admin/layout.tsx`**, všetky selektory sú pod `[data-admin-workspace]` a opt-in modulmi. Kvalita údajov používa existujúci lokálny CSS modul. **Žiadne `overflow-x: hidden` na dokumente.**

## Čo sa nemenilo

- Všetky requesty, query parametre, schvaľovacie a zamietacie akcie, `current_value` a `value`, uloženie návrhov a refresh.
- Tavily manuálne spúšťanie, rozpočty, plány, externé tokeny a automatizácie.
- Google Place picker, ceny API, vykonávanie dávok, ich zastavenie, ochrana pred nevyžiadaným spustením a stav `NOT_REQUIRED`.
- Notion/D1, migrácie, backend, verejný web, autentifikácia a prístupové práva.

## Kontroly

- `tests/admin-operations-step15.test.mjs`: read-only source kontrakty pre porovnanie údajov, zachovanie mutačných handlerov, mapové varovania, navigáciu a CSS scope.
- `tests/e2e/admin-operations-step15.spec.ts`: read-only izolovaný localhost, 320/375/390/430/768/1440px pre Kvalitu, Mapy a Nástroje; žiadny klik na spustenie Tavily, Google, schválenie alebo zápis.
- `.github/workflows/admin-typography-contracts.yml`: pridané zmenené súbory a source kontrakt.
- **Zatiaľ nepotvrdené:** nový HEAD TypeScript, CI, reálny Playwright, screenshoty PR revízie a fyzické iOS Safari. Existujúce zdrojové kontrakty nie sú dôkazom úspešného vykreslenia.

## Pred merge

- [ ] Skontrolovať a opraviť merge konflikty s najnovším `main` (PR #1369 bol pri kontrole `mergeable=false`).
- [ ] Presný HEAD: node testy, TypeScript, relevantné E2E, screenshoty mobil 390px + desktop 1440px; overiť aj 320/375/430 a klávesnicu iOS.
- [ ] Overiť prázdne/vyplnené stavy Kvality, nefunkčný GEO provider, dlhé texty a dostupnosť tlačidiel bez skutočného plateného volania.
- [ ] Vlastník musí výslovne povoliť merge.

**Nasleduje 16/18:** Nastavenia, komponenty, šablóny, monetizácia, právne a navigácia.
