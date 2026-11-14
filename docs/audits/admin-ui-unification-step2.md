# Psipedia.sk – Admin UI Unification, krok 2/18 (audit kódu)

**Dátum:** 14. 11. 2026  
**Repo:** `investradarsk/psipedia-sk`  
**Baseline:** `main` pri čítaní, commit `6c7d8f2910045042eeedcaaf75a463b795b9afb0`  
**Pravidlo:** žiadne produkčné zmeny, žiadne odstraňovanie, žiadne zmeny dát, D1, Notion, R2, API ani správania uloženia.  
**Referenčný vizuál:** existujúci editor článkov (`components/admin-article-editor.tsx`) a spoločný `EditorWorkspace` (`components/admin-editor-workspace.tsx`).

## 1. Rozsah a hranice auditu

- Prečítaná kanonická navigácia `lib/admin-navigation.ts`: **7 skupín, 28 hlavných položiek**; úplný kontrolovateľný register v `docs/audits/admin-ui-unification-inventory.json`. Ten nepredstavuje úplný inventár vnorených URL; každý modul má aj vlastné detailové, nové a nástrojové stránky.
- Priamo porovnaných **11 rodín editorov**: články, plemená, služby, podujatia, Pomoc psom, adopcie, stratené/nájdené, organizácie, e-shopy, sekcie a šteniatka.
- Porovnaných **7 zoznamových/dashboardových komponentov**: podujatia, Pomoc psom, služby, organizácie, adopcie, stratené/nájdené a centrálne Facebook obrázky. Ďalšie doplňujúce zdroje: kvalita údajov, katalóg služieb, navigácia, spoločný shell.
- Prečítaná spoločná základňa CSS a vybrané modulové štýly, vrátane `admin-root-extracted.css`, `admin-legacy-scoped.css`, `admin-workspace.css`, `admin-unified-forms.css`, `admin-editorial-foundation.css`, `admin-shell.module.css` a `admin-editor-workspace.module.css`.
- **Nešlo o browser audit prihláseného admina.** Skutočný computed font, presah stránky, posun pri otvorení iOS klávesnice, prekrytie sticky prvkov a presné screenshot diffy zatiaľ NIE SÚ potvrdené. Toto je zdrojový audit + mapa implementácie.

## 2. Kanonický vzor a rozdiely

| Vzor | Zdroj | Rozhodnutie |
| --- | --- | --- |
| Horný shell, sidebar, menu | `components/admin-shell.tsx`, `components/admin-navigation.tsx` | Zachovať jeden shell; upravovať iba jeho kanonické CSS a mobilné umiestnenie |
| Editor | `components/admin-editor-workspace.tsx`, `components/admin-editor-workspace.module.css` | Vizualny vzor článku pre nadpisy, karty, sekcie, navigáciu a action bar |
| Formuláre | `app/admin/admin-unified-forms.css`, `app/admin/admin-editorial-foundation.css` | Využiť existujúce V4 polia, nenahrádzať fyzické inputy ani ich state |
| Akcie/confirm | `components/admin-interaction-system.tsx` | Spoločné rozmery a vzhľad; ochrany nesmú zmeniť doménovú sémantiku |
| Mobilné sticky výšky | `components/admin-sticky-metrics.tsx` | Jediný zdroj výšky sticky stacku, nie lokálne hard-coded offsety |
| Zoznamy | `AdminPagination`, zdieľané filtre a tabulkové wrappery | Zdieľať prezentáciu, ale zachovať lokálny GET/client model aj výber množiny |

### Editorový rozdiel potvrdený priamo v zdroji

**Prímo používajú `<EditorWorkspace>` (6):** `admin-article-editor.tsx`, `admin-breed-editor.tsx`, `admin-event-editor.tsx`, `admin-eshop-editor.tsx`, `admin-section-editor.tsx`, `admin-puppy-area-editor.tsx`.

**Používajú vlastný formulárový obal `data-admin-form-system="v4"` + vlastnú navigáciu (5):** `admin-directory-editor.tsx`, `admin-help-editor.tsx`, `admin-adoption-editor.tsx`, `admin-lost-found-editor.tsx`, `admin-organization-editor.tsx`.

Tieto implementácie nie sú automaticky zbytočné duplikáty; ich uloženie, validácia a polia sú rôzne. V ďalších krokoch zarovnať ich **vizuál**, bez prepísania doménového editorového state.

### Preukázané rozdielne ovládanie

- `components/admin-directory-editor.tsx:951`: `window.confirm` pri zahodení nezapísaných **kategóriových filtrov** (nie celý editor).
- `components/admin-facebook-images.tsx:412`: `window.confirm` pri zahadzovaní zmien grafického editora.
- Nie všetky zoznamy používajú `AdminPagination`: naopak `admin-directory-dashboard.tsx` a `admin-organization-publication-dashboard.tsx` ho už volajú. Pri adopciách/stratených a nájdených sa používa vlastný mechanizmus zobrazenia strán.
- V rovnakom admine sú aj natívne `<button>` a `<AdminActionButton>` – samotný natívny button **nie je chyba**; iba ak vizuálne porušuje spoločný kontrakt.

**Bezpečné rozhodnutie:** zjednotiť výzor, šírku, typografiu a stavy; potvrdenia, filtre a bulk výber presunúť do spoločných prvkov len po teste ekvivalencie.

## 3. CSS / mobilné riziká

- `app/admin/layout.tsx` importuje súčasne päť vrstiev CSS: `admin-root-extracted.css`, `admin-legacy-scoped.css`, `admin-workspace.css`, `admin-unified-forms.css`, `admin-editorial-foundation.css`. V rôznych modulových `*.module.css` sú ďalšie lokálne prepisy.
- Tieto súbory plus `components/admin-shell.module.css` majú spolu **6 908 riadkov** a **200 výskytov CSS vlastnosti `font-size`**. Je to rozsah na audit, nie 200 nezávislých chýb.
- `app/admin/admin-legacy-scoped.css` má 7 výskytov `font-family: Georgia`/alternatív; `admin-root-extracted.css` 3 takéto deklarácie; `admin-workspace-dashboard.module.css` obsahuje historické Georgia deklarácie, ktoré neskôr prepisuje `font-family: inherit`. Na živom zobrazení treba zistiť víťazný computed style.
- `components/admin-editor-workspace.module.css:219` nastavuje lokálnu sans-serif rodinu. Na celú administráciu chceme **jeden kanonický admin font token**, pričom článkový obsah (rich text) môže mať zámerný odlišný štýl, ak je to v editori potrebné.
- `app/admin/admin-root-extracted.css:1243-1252` drží tabuľku importu Pomoci s `min-width:1050px` **vo vlastnom `overflow-x:auto` wrapperi**. To je prípustný samostatný posuv tabuľky, nie automaticky bug.
- `components/admin-shell.module.css` má viac mobilných pravidiel pre topbar/fixed menu vrátane 320px; `components/admin-sticky-metrics.tsx` meria skutočné výšky. Preveriť konflikty pri 320/375/390/430px a pri soft keyboard. Nepridávať globálne `overflow-x:hidden` ako maskovanie problému.

### Priorita na zjednotenie

| Priorita | Oblasť | Konkrétna akcia | Krok |
| --- | --- | --- | --- |
| P1 | Typografia | Zaviesť jednu rodinu a veľkostnú škálu v admin scope, odstrániť iba preukázane konfliktné deklarácie | 3 |
| P1 | Hustota rozloženia | Spoločná sada veľkostí panelov, medzier, headingov; editor článkov ako vzor | 4 |
| P1 | Ovládanie | Vizuálne zjednotiť polia/tlačidlá/hlásenia vrátane native vs shared prvkov | 5 |
| P1 | Mobil a sticky | Fixné menu, navigácia a topbar bez prekrývania; presné meranie viewportu | 6–7 |
| P2 | Tabuľky/filtre | Jednotné zobrazenie; zachovať URL parametre, bulk rozsah a stránkovanie | 8 |
| P2 | Zvyšné sekcie | Prejsť všetkých 28 hlavných vstupov aj ich detailové obrazovky | 9–16 |
| P2 | Odstránenie starého CSS/kódu | Až po potvrdení, že ho import graph, dynamické routy ani testy nepotrebujú | 17 |
| P1 | Regresia | Screenshots, overflow, focus, klávesnica, formulár, desktop/mobil | 18 |

## 4. Knip – skutočný nález z kroku 1

**GitHub Actions run:** https://github.com/investradarsk/psipedia-sk/actions/runs/43628661039  
**Artifact:** https://github.com/investradarsk/psipedia-sk/actions/runs/43628661039/artifacts/14127167232

Run **success**, archív obsahuje `findings.json` a `findings.md`.

| Kategória statického nálezu | Počet |
| --- | ---: |
| Unused files | 32 |
| Z nich súbory súvisiace s adminom / automatizáciami | 19 |
| Unused exports | 440 |
| Unused exported types | 192 |
| Duplicate exports | 4 |
| Unlisted dependencies | 3 |

19 súborov je zaradených **na preverenie, nie na mazanie**. Dominujú historické komponenty automatizácií, ale sú tam aj `admin-rich-text-editor.tsx`, `admin-unsaved-navigation-dialog.tsx`, `admin-breed-notion-extras.tsx`. V reporte je tiež `public/sw.js`; jeho používanie cez registráciu service workera nemusí vytvárať statický import. Ani jeden nález nepreukazuje, že funkcia je nepotrebná pre produkt.

**Následné spracovanie:** krok 17; kritickú závislosť na registrácii/externom volaní overiť pred každým odstránením.

## 5. Testovací/akceptačný kontrakt pre kroky 3–18

Cieľové viewporty: **320, 375, 390, 430, 768 a 1440 px**.

- Dokument nemá neúmyselný horizontálny presah (`scrollWidth <= clientWidth`). Široká tabuľka môže scrollovať iba v svojom obale.
- Žiadny fixed/sticky panel neprekrýva editované pole, titulok, uloženie či modal.
- Akcie zostávajú dostupné a dotykové plochy majú aspoň 44px, okrem legitímnych kompaktných dekoratívnych prvkov.
- iOS/WebKit: textový input nedáva stránke neželaný zoom, otváranie klávesnice nemení šírku dokumentu; list/edit toggles pracujú bez straty neuložených dát.
- Tab/Shift+Tab, Escape, focus restore, aria-label/error/disabled/loading a ochrana pred zahodením zostávajú funkčné.
- Každý vizuálny PR potrebuje screenshoty z **presného PR HEAD**; staré screenshoty ani historické green testy nenahrádzajú aktuálne výsledky.
- NEMENIŤ: produkčné API, D1/R2, Notion sync, Gemini, Facebook publikovanie, hodnoty formulárov, routy a nasadzovanie.

## 6. Rozsah PR a ďalší krok

**Krok 2 je iba audit.** V `PR B` budeme v krokoch 3–18 používať tento dokument a strojovo kontrolovateľný register 28 hlavných sekcií.

**Krok 3/18:** typografia. Najprv overiť vybrané computed fonty na hlavných ekranách a porovnať s článkom. Potom postupne presunúť admin písmo a typografickú škálu do jediného kanonického tokenového zdroja; nezasiahnuť formátovanie obsahových blokov článku.

Žiadny súbor sa v tomto kroku neodstránil ani neskrátil, nič sa nemergovalo a nič sa nedeployovalo.
