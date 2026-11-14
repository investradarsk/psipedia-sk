# Psipedia.sk – admin visual unification, krok 12/18

**Dátum:** 14. 11. 2026  
**PR:** #1369 (Draft), `chore/admin-visual-unification-step2-audit-20261114`  
**Scope:** Pomoc psom, Adopcie, Stratené/nájdené, Organizácie. Bez merge, deployu a produkčných mutácií.

## Zdrojový audit

- Štyri agendy už majú **oddelené kanonické moduly**, vlastné spracovanie dát a publikovania. Editorové komponenty používajú `AdminSharedEditorNavigation`, `AdminEditorSectionVisibility`, `AdminEditorFooter` a `EditorUnsavedChangesGuard`. Plošná migrácia editorov by vytvorila riziko straty formulárových hodnôt.
- Spoločný `AdminRecordTable` už podporuje opt-in `stickyActions`, ale tieto štyri zoznamy ho nemali. Na desktope akcie mohli vyžadovať horizontálny posun.
- Pomoc psom zaberala výrazné miesto nad výsledkami duplicítou popisov modulov a šiestimi metrikami.
- Mobilná prezentácia adopcií už používa vlastné funkčné karty; stratené/nájdené a organizácie používajú TanStack tabuľku a jej existujúci mobilný režim. Dátové komponenty netreba nahrádzať.
- Technické termíny `canonical`, `lifecycle`, `LOST + FOUND`, `Publication stav` a `Lexical` sa vyskytovali vo viditeľných nadpisoch, poliach alebo pomocných textoch.

## Zmeny

1. **Spoločný vzhľad štyroch zoznamov:** `data-admin-content-module` pre Help, Adopcie, Lost-found a Organizácie; min. 44px ovládacie plochy, kompaktnejšie filtrovanie, jasný focus a disabled kontrast. Každý `AdminRecordTable` aktivuje opt-in **sticky stĺpec Akcie**, bez vypnutia horizontálneho scrollovania ostatných stĺpcov.
2. **Pomoc psom:** úvodná karta s kratším nadpisom „Správa prípadov a výziev“, menšou typografiou a paddingom; zachované štatistiky, sekčný rozcestník, hromadné úpravy a individuálne potvrdenie odstránenia. Editor ukazuje stručné odkazy na ďalšie samostatné agendy a kompaktnejšiu navigáciu; pôvodné sekcie aj živý náhľad zostávajú.
3. **Adopcie:** vyvážené filtre, ľahšie a kratšie karty na mobile, jednotné ovládacie plochy a jasný štítok stavu adopcie namiesto technického slova. Žiadna zmena `FormData`, `expectedUpdatedAt`, oprávnení či adopčného lifecycle.
4. **Stratené a nájdené psy:** filtrovacie voľby `Všetky hlásenia`, `Stratený pes`, `Nájdený pes` sú zrozumiteľné; interné `LOST/FOUND` **option.value zostali nedotknuté**. Formulár má kompaktné polia a sekcie a mobilné 16px inputy. Súkromné kontakty, lokalita, anonymizované súradnice, galéria a moderátorské prechody sa nemenili.
5. **Organizácie:** namiesto interných textov sú vysvetlené kontakty, popisy a rozdiel medzi overením/publikovaním. Formulár, karta obrázka, sekcie, adresa/mapping a všetky lokality zostávajú. Zoznam má lepšie čitateľné tabuľkové akcie a filter reset.
6. **Zhodný vizuálny rytmus editorov:** `admin-help-bulk.module.css`, `admin-lost-found.module.css`, `admin-adoption-editor.module.css`, `admin-organization-editor.module.css` používajú spoločné tokeny z krokov 3–11 pre paddingy, 44px akcie, labely, pager, mobilné 16px textové inputy a `scroll-margin-top`.
7. **Zrozumiteľnosť stránok:** Help, Adopcie a Organizácie majú krátke slovenské popisy bez interných názvov kódu.

## Nezmenené dátové kontrakty

- `GET` query filtre, server/client stránkovanie a sorting, riadkový a hromadný výber, inline editácia, uloženie `POST/PUT/PATCH`, publikovanie/unpublishing, potvrdenia archivácie a mazania.
- Lexical obsah, uploady, obrázkové galérie, súkromné vs. verejné kontakty, Google Place/Maps, Notion sync, SEO, `dirty` guard a existujúce validačné pravidlá.
- Žiadne migrácie D1/R2, nové polia, servisné volania na pozadí ani produkčné operácie.

## Testy a otvorené kontroly

- `tests/admin-help-modules-step12.test.mjs` — read-only zdrojové kontrakty všetkých štyroch zoznamov a editorov.
- `tests/e2e/admin-help-modules-step12.spec.ts` — read-only localhost Playwright, 320/390/768/1440px; zoznamy, tabuľkové akcie, adopčné karty a prístupné formulárové sekcie bez zápisu.
- `.github/workflows/admin-typography-contracts.yml` rozšírený o nové súbory/testy.
- [ ] CI/TypeScript/Playwright výsledok na poslednom HEAD.
- [ ] Reálne mobilné Safari a dlhé názvy, klávesnica, prechod medzi sekciami.
- [ ] Zosúladenie vetvy s `main` a kontrola konfliktov; aktuálna vetva už zaostáva.
- [ ] Výslovné schválenie majiteľa pred merge.

**Ďalej 13/18:** Partner účty, používateľské recenzie, moderácia a podnety.
