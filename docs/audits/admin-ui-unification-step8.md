# Psipedia.sk — krok 8/18: zoznamy, filtre, tabuľky a stránkovanie

**Stav:** implementované vo vetve Draft PR #1369; bez merge/deploy a bez zmeny produkčných údajov.

## Zdrojový audit a rozhodnutie

Administrácia mala dva odlišné, **funkčne správne mechanizmy stránkovania**:
- GET/URL: `AdminPagination`, `AdminNumberedPagination` (Články, Adresár, Adopcie, Stratené/nájdené, Organizácie a Pomoc).
- Ovládané klientom: Plemená, Podujatia; stále používajú pôvodné `changePage`/`setPage`, vrátane rušenia výberu a filtrovania.
- Upozornenia používajú **cursor**; čísla strán ani menenie ich query by bolo chybné.

Vizuálny nesúlad bol v CSS: rozdielne výšky pager tlačidiel, šírky pokročilých filtrov, poloha výsledkov a kompaktnosť TanStack nástrojovej lišty. Nahrádzať backend stránkovanie a logiku filtrov jedným novým React modelom by prinieslo zbytočné riziko.

## Implementácia

**Vlastník spoločného vzhľadu**: `app/admin/admin-list-foundation.css`, načítaný v `app/admin/layout.tsx` za `admin-editorial-foundation.css`. Všetky pravidlá sú pod `[data-admin-workspace]`. Nepoužívajú globálne maskovanie `overflow-x:hidden`.

Pridané opt-in dátové atribúty:
- `data-admin-list-filters`: jednotné rozostupy, 44px filtre, 16px mobilné textové inputy, lokálne ohraničenie šírky;
- `data-admin-list-advanced`: vizuálne konzistentné pokročilé filtre, ale otvorenie/zatvorenie vlastní pôvodný komponent;
- `data-admin-list-results`: jednotná nenápadná typografia počtu výsledkov;
- `data-admin-list-pagination`: jeden štýl 44px tlačidiel/odkazov, vyznačená stránka, zreteľné disabled/focus stavy, zalamovanie pri 320px.

**Deväť pripojených zoznamov**:
1. Články (vrátane existujúceho opt-in pinned stĺpca Akcie);
2. Plemená;
3. Podujatia;
4. Adresár služieb;
5. Pomoc psom;
6. Adopcie;
7. Stratené a nájdené psy;
8. Organizácie;
9. Centrum pozornosti / upozornenia.

Komponent `components/admin-pagination.tsx` zachováva `prefetch={false}`, URL generovanie, sedemstranové okno aj existujúce hranice strán. Pribudli iba dátový atribút a oznámenie aktívnej strany (`aria-current`, `aria-live`). V Help zozname majú neaktívne hraničné odkazy `aria-disabled`.

`components/admin-record-table.module.css` zjednotilo vnútorný padding a odstupy nástrojovej lišty, `min-width:0` pri jej prvkoch a obmedzilo šírku/výšku výberu stĺpcov na mobil. Naďalej zostávajú:
- dostupná skutočná horizontálne scrollovateľná tabuľka a focusovateľný scroll región;
- voliteľné mobilné **Kompaktný pohľad / Všetky stĺpce**;
- opt-in pinned actions článkov;
- pôvodné row selection, bulk akcie, inline edit, sorting a resize.

Pri Plemenách má hľadanie správny `role="search"` s už existujúcim `aria-label`. Iné používateľské texty/filtre ani serverové odpovede neboli zmenené.

## Testovanie

- Node: `tests/admin-list-foundation-step8.test.mjs` — kontrola scope, deviatich zoznamov, 44px, 16px, prístupnosti, zachovania server/client/cursor paging a TanStack card/table.
- Read-only workflow: `.github/workflows/admin-typography-contracts.yml` (pripojené zmenené súbory a Node test).
- Playwright: `tests/e2e/admin-list-foundation-step8.spec.ts` — **iba izolovaný localhost**, bez zápisov, šírky 320/390/1440, otvorenie pokročilých filtrov, počty výsledkov, pager touch targets a prepnutie mobilnej tabuľky na karty.

**Pred merge je stále potrebné:**
- [ ] Potvrdiť Node testy, TypeScript, Playwright a ostatné regresie na **poslednom HEAD** PR.
- [ ] Screenshoty autentifikovanej izolovanej fixture na 320/375/390/430/768/1440px, najmä s dlhými názvami.
- [ ] Vyhodnotiť nové zistenia Work auditu z ďalších admin sekcií.
- [ ] Zosúladiť PR s aktuálnym `main` — v čase kroku 8 už vetva za hlavnou vetvou zaostávala; bez overenia konfliktov nemergovať.
- [ ] Výslovný súhlas majiteľa.

**Nasleduje 9/18:** obsahové redakčné sekcie — Články, Plemená, Šteniatka, Sekcie, Recenzie, Psie meniny — podľa nových Work auditných nálezov.

**Bez zásahov:** API, D1/R2, Notion, publikovanie, stav filtrovania, určenie členstva bulk výberu, oprávnenia a verejný web.
