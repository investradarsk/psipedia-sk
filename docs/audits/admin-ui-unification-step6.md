# Psipedia.sk — Admin UI Unification, krok 6/18: shell a mobilná navigácia

**Dátum:** 14. 11. 2026  
**PR:** #1369 (Draft), vetva `chore/admin-visual-unification-step2-audit-20261114`.  
**Referencia:** kompaktný editor článkov a už zavedený Admin V3 shell.  
**Rozsah:** úpravy CSS shellu/navigácie, bez zmeny komponentových handlerov, routovania, formulárov alebo údajov.

## Výsledok zdrojového auditu pred zmenami

- `components/admin-shell.tsx` už používa jeden `AdminShell`, `AdminNavigation`, `AdminQuickNavigation`, `AdminTourButton`, notifikácie a meranie `AdminStickyMetrics`.
- `AdminStickyMetrics` meria výšku sticky topbaru a navigácie reálnym `ResizeObserver`. Nevkladať ďalšie hard-coded offsety pri meniacej sa výške lišty.
- Pri šírke ≤1100px je navigácia v pevnom 44px tlačidle vpravo. Topbar rezervuje pre tento ovládač 64/60px priestoru. Bočný drawer má vlastný body scroll lock, focus trap, Escape a ochranu pred navigáciou s neuloženými dátami. **Táto logika zostáva nezmenená.**
- Pred úpravou malo rýchle hľadanie na šírke ≤760px iba `36px` trigger, sprievodca mal základné `min-height:36px`. Susedné notifikácie a web link už majú 44px.
- `components/admin-navigation.module.css` používal šírku mobilného draweru `calc(100vw - 20px)` pri ≤390px a pôvodne `min(390px, calc(100vw - 24px))`; to nezohľadňuje vnútorne odsadený backdrop s CSS safe-area insets.
- Desktop sidebar mal 40px odkazy pod skupinami, hoci skupinové tlačidlá majú 44px.
- Na veľmi úzkom topbare môže dlhé slovo v logu ubrať priestor ovládacím ikonám. Logo zostáva prístupné aj bez vizuálneho textu, pretože `AdminHomeBrandLink` poskytuje `aria-label`.

## Implementované

1. **Topbar:** v `admin-shell.module.css` kanonické menšie medzery, `min-width:0` a ochrana ikonových akcií pred neúmyselným zmenšovaním. Pri ≤420px sa skryje iba dekoratívny slovný logotyp, nie klikateľné logo, akcie alebo ich ARIA názvy.
2. **Výber a vyhľadávanie:** `admin-quick-navigation.module.css` teraz používa 44px minimálnu výšku aj 44px šírku mobilnej ikonovej akcie.
3. **Sprievodca:** `admin-tour-button.module.css` používa rovnakú minimálnu výšku a na tablete/mobile ikonová verzia minimálnu šírku 44px.
4. **Sidebar:** `admin-navigation.module.css` zvyšuje minimálnu výšku podskupinových odkazov na 44px, zachováva scrollovanie sidebaru a focus.
5. **Drawer:** šírka sa určuje voči priestoru safe-area-aware backdropu (`width:min(390px,100%)`, max-width 100%, max-height 100%, min-height 0); nie voči `100vw`. Dvojstĺpcové odkazy používajú `minmax(0,1fr)` a zalamujú dlhé slová. Samotný dokument neskrýva horizontálny overflow a nič nie je zahodené.
6. **Sticky:** existujúce meranie výšok a všetky z-indexy zostali bez zmeny. Všetky hlavné sekcie aj 7 skupín menu a 28 trás zostávajú dostupné.

## Testovanie a akceptácia

- `tests/admin-shell-step6.test.mjs`: kontrakty pre rozmery, safe-area šírku, klávesnicu, varianty menu, overflow a existujúce React komponenty.
- `tests/e2e/admin-ia-2.spec.ts`: reálny shell test na šírkach **320, 375, 390, 430, 768 a 1440px**. Overuje prístupnosť a minimálne 44px tlačidlá topbaru, vzájomné prekrývanie zvončeka a hamburgeru, hranice draweru, Escape a vrátenie fokusu, sidebar scroll a nechcené horizontálne pretekanie.
- Existujúci read-only GitHub Actions workflow `.github/workflows/admin-typography-contracts.yml` spúšťa kontrakty krokov 3–6 + základné formulárové regresie.
- [ ] CI a Playwright z **aktuálneho HEAD**, bez čakania pri tvorbe PR.
- [ ] Screenshoty topbaru a vysunutého menu (vrátane safe-area iOS Safari) pre každú požadovanú šírku; zdrojový CSS audit sám osebe nepreukazuje absenciu runtime kolízie.
- [ ] Zapracovať výstupy od používateľa zo súbežného Work vizuálneho auditu; nepotvrdené chyby nezapisovať ako overené.
- [ ] Bez schválenia majiteľa nič nemergovať.

**Bez zásahov:** D1/R2, Notion, API, partner oprávnenia, editory, ukladanie, nav prefetch, ochrana neuložených zmien, obsah/SEO.

## Krok 7/18

Cielená mobilná stabilita: horizontálne pretekanie na jednotlivých obrazovkách, scroll pri otvorenej klávesnici, sticky menu a modálne panely. Vychádzať z konkrétnych screenshot nálezov Work auditu a aktuálneho Playwright reportu.
