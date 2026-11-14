# Psipedia.sk – krok 11/18: Podujatia, zoznam, editor a kalendár

**PR:** #1369 (Draft), vetva `chore/admin-visual-unification-step2-audit-20261114`. **Bez merge a nasadenia.**

## Audit kódu

- `AdminEventDashboard` má existujúcu React Query cache kľúčovanú dátumom a filtrami, zrušiteľný fetch, debounce vyhľadávania, klientské číslovanie strán, hromadný výber a úpravy, rýchly drawer, inline edit a potvrdenie mazania.
- `AdminRecordTable` podporuje opt-in sticky stĺpec Akcie; Podujatia ho zatiaľ nezapínali, a preto zostával na širokom desktope za horizontálnym posunom.
- `AdminEventEditor` už používa `EditorWorkspace` so switch-mode ôsmich sekcií, live preview, Notion import, lifecycle, ochranu neuložených zmien, SEO, Lexical texty, mapový panel načítavaný až po otvorení a vlastné dátové validácie.
- `AdminShell` už kreslil hlavný nadpis stránky; samotný editor kreslil druhý hlavný nadpis, čo pridávalo výšku.
- Administrátorský editor a zoznam nie sú verejný `EventCalendar`. Repo má samostatný **verejný kalendár** na `/podujatia`, zatiaľ čo `AdminEditorialCalendar` je kalendár **článkov**, nie podujatí. Nebolo by správne zobrazovať kalendár len z 12 aktuálne načítaných podujatí ako úplný mesačný prehľad.

## Úpravy

1. **Zoznam podujatí:** opt-in `data-admin-content-module="events-list"`, `data-admin-event-list`, zrozumiteľný search landmark; zachovaný `data-admin-list-filters`, pokročilé filtre, stav výsledkov a stránkovanie z kroku 8. `AdminRecordTable` používa `stickyActions`, kompaktnejší 238px stĺpec Akcie a min. 44px ovládacie plochy. Časové filtre na mobile zostávajú v horizontálne posúvateľnom paneli.
2. **Rýchla editácia / tabuľka:** rovnaké focus štýly, kompaktná hustota, zrozumiteľné odkazy Upraviť/Web, dostupné tlačidlá rýchlej editácie a odstránenia. `AdminInlineRowActions`, `AdminDrawer`, `AdminDestructiveConfirmDialog` ani ich handlers sa nemenia.
3. **Editor:** `hidePageTitle` v `EditorWorkspace` ponechá jeden nadpis v `AdminShell`. Zjednotené rozostupy, sekčný pager, veľkosť live náhľadu, 16px mobilné vstupy a bezpečné `scroll-margin-top`. Žiadna druhá nested scroll plocha.
4. **Sekundárne akcie:** Notion import a `AdminRecordLifecycleActions` sú vo vizuálne sekundárnom, prístupnom `<details>` s názvom „Ďalšie akcie“. Stavy, originálne potvrdenia, odmietnutie, `dirty` a povolenia sú zachované; pri novej udalosti sa menu nezobrazuje. Primárna akcia pre publikovaný profil zostáva **Uložiť zmeny**; pre koncept zostávajú oddelené **Uložiť koncept** a **Publikovať podujatie**.
5. **Kalendár:** administrátorská stránka dostala **priamy odkaz na verejný kalendár `/podujatia`** vedľa Nového podujatia. Administrátorský zoznam sa **nemení na samostatný kalendár**; nový kalendár by vyžadoval plný mesačný dátový zdroj, nie neúplnú stránku výsledkov. Nadpis je prehľadné „Podujatia“.

## Dátová ochrana

Bez zmien `fetchAdminEventPage`, query keys, stránkovania, výberu, bulk, publikovania, serverových API, D1, Notion event-field kontraktu, uploadov, Google Maps, validácií, práv, slugov, verejného kalendára, `save(nextStatus)` a `EditorUnsavedChangesGuard` internals.

## Testy

- Node read-only `tests/admin-events-visual-step11.test.mjs` – štyri kontrakty pre list, editor, CSS a kalendárovú navigáciu.
- Playwright `tests/e2e/admin-events-visual-step11.spec.ts` – izolované lokálne fixture, bez POST/PUT/DELETE; 320/390/768/1440px, filtre, stránkovanie, sticky akcie, jedno H1, Notion/lifecycle disclosure.
- `.github/workflows/admin-typography-contracts.yml` rozšírený o source tests a event súbory.

## Otvorené pred merge

- [ ] Overiť CI, TypeScript, Playwright a screenshoty aktuálneho HEAD; vykonanie testov nie je automaticky potvrdené ich pridaním.
- [ ] Skontrolovať na mobilnom Safari otvorenú klávesnicu, sekcie, rozbaľovacie menu a náhľad.
- [ ] Zosúladiť PR s aktuálnou hlavnou vetvou, preveriť konflikty.
- [ ] Výslovné schválenie merge od majiteľa.

**Nasleduje krok 12/18:** Pomoc psom, Adopcie, Organizácie, Stratené/nájdené.
