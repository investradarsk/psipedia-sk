# Psipedia.sk – Admin UI Unification, krok 3/18: typografia

**Dátum:** 14. 11. 2026  
**Vizuálna referencia:** existujúci editor článkov + spoločný `EditorWorkspace`.  
**Rozsah:** iba admin CSS, jeden statický regresný test a read-only CI. Bez zásahov do produkcie, serverových API, Notion, D1/R2, uloženia záznamov alebo verejného webu.

## Potvrdený problém v zdroji
Hlavný admin layout importuje postupne historické `admin-root-extracted.css`, `admin-legacy-scoped.css`, `admin-workspace.css`, `admin-unified-forms.css` a `admin-editorial-foundation.css`.
Hoci už existovali spoločné farebné a rozmerové tokeny, typografiu prepisovali `Georgia`/serif deklarácie na hodnotách, niektorých vstupoch a administrátorských nadpisoch.
Aj editor článkov mal v `admin-content-editor-v3.module.css` niekoľko samostatných serifových nadpisov. Ak má byť referencia pre celý admin, najprv musíme jeho chrome zjednotiť; formátovanie ukážkového článku musí zostať samostatné.

## Zmena
- `app/admin/admin-editorial-foundation.css` je **kanonický vlastník** typografie administrácie:
  - `--admin-ui-font-family`: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  - `--admin-ui-type-body`: 0.91rem;
  - `--admin-ui-type-heading`: clamp(1.2rem, 1.7vw, 1.5rem);
  - `--admin-ui-type-section`: 1.05rem;
  - `--admin-ui-type-label`: 0.82rem;
  - `--admin-ui-type-caption`: 0.83rem;
  - `--admin-ui-type-stat`: clamp(1.6rem, 2.5vw, 2.1rem).
- Všetky všeobecné admin prvky dedia ten istý font. Mierna `:where()` špecificita **neprepisuje úmyselne odlišné ukážky obsahu článku**.
- Základné H1 a H2/H3 v admin shelli a formulároch používajú typografické tokeny, nie nezávislé veľkosti.
- `app/admin/admin-workspace.css` a `app/admin/admin-unified-forms.css` používajú jeden token pre labely.
- `components/admin-editor-workspace.module.css`, `components/admin-workspace-dashboard.module.css` a `components/admin-content-editor-v3.module.css` zdieľajú typografiu pre ovládanie, prehľady a nadpisy.
- V historických admin CSS súboroch zostali **iba dve serifové deklarácie pre obsahové ukážky článku** (`.admin-preview-intro` a `.admin-preview-paper`).
- Nadpis v **náhľade publikovaného článku** v `admin-content-editor-v3.module.css` zámerne zostáva serifový. To nie je nadpis adminu; cieľ je zachovať zobrazenie obsahu.
- `components/admin-facebook-graphic-editor.module.css`: názov náhľadu loga v ovládaní už nepoužíva samostatný Arial font.

## Mobil – garantované a ešte neoverené
- **Zachované v CSS:** všetky existujúce minimálne 44px výšky dotykových prvkov, v mobilných textových poliach `font-size:16px`, jeden stĺpec V4 formulára.
- **Zatiaľ nepreukázané browserom:** vypočítané písma pre všetky moduly, horizontálny presah pri 320/375/390/430px, prekrytie sticky elementov a správanie pri otvorenej soft klávesnici. Toto bude overené vizuálnymi regresiami pred merge. Žiadne tvrdenie o úplnom vyriešení mobilného presahu.
- Obsah typu rich-text/preview si smie zachovať odlišné písmo, keď ide o verný náhľad verejného článku; pravidlá pre ovládanie adminu sú jednotné.

## Overenie a akceptácia
- `node --test tests/admin-typography-step3.test.mjs tests/admin-ui-unification-inventory.test.mjs`
- Read-only workflow: `.github/workflows/admin-typography-contracts.yml`, trigger na PR a manuálne z Actions.
- Pred schválením zobrať **aktuálny PR HEAD**, lokálne vykresliť obrazovky prehľadu, článkov, plemien, služieb, podujatí, Pomoci, kvality, Gemini, FB a nastavení na desktop + mobil 320/375/390/430px; preveriť computed `font-family`, line wrap, size, overflow a sticky.
- Pri typografických zmienkach v starých statických testoch opraviť očakávanú hodnotu, nie obísť funkčný test. Až po aktuálnom CI a screenshot dôkaze je možné uvažovať o merge.

**Status:** úpravy sú zapísané do Draft PR #1369, ale runtime/screenshot a CI výsledky zostávajú otvorené do ich samostatnej kontroly. Žiadne automatické merge, deploy alebo produkčné zmeny.
