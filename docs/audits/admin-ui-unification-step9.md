# Psipedia.sk — krok 9/18: zjednotenie obsahových modulov

**Vetva:** `chore/admin-visual-unification-step2-audit-20261114`  
**PR:** #1369 (Draft). **Nič nemergovať bez súhlasu majiteľa.**

## Rozsah a zdrojový audit

Obsahové sekcie: **Články, Plemená, Šteniatka, Sekcie a podsekcie, Recenzie a testy, Psie meniny**. Existujúci článkový editor `EditorWorkspace` je vizuálnou referenciou. V krokoch 3–8 už prešli typografickým a navigačným zjednotením Články, Plemená a Recenzie; nebolo vhodné znovu prepísať ich komponenty alebo formové kontrakty.

Zdrojovo potvrdené rezervy pri doposiaľ nezjednotených moduloch:
- Šteniatka: `AdminShell` + druhá `EditorWorkspace` hlavička a tretí rovnaký nadpis v karte, priveľké paddingy oblastí, názvy a akcie tesné na úzkych obrazovkách.
- Sekcie: duplicitný titulok na úrovni shell/editor, dvojstĺpcová toolbar mriežka mala rigidné minimálne šírky 16rem + 18rem a väčšie odsadenia než článkový editor.
- Psie meniny: technický názov `Canonical psie meniny`, jedinečná typografia a rozmery panelov, vždy otvorený veľký importný JSON blok a 900px široká tabuľka aj na mobiloch.
- Recenzie a testy: už skompaktnené a opravené v predchádzajúcom Work audite, bez nutnosti zasahovať do dát.

## Uskutočnené úpravy

### 1. Šteniatka

- `AdminPuppyAreaEditor` používa `EditorWorkspace.hidePageTitle`, čím zostáva **jediná hlavná hlavička v `AdminShell`**.
- Vnútorný názov karty je jednoznačné `Oblasti na úpravu`, nie tretíkrát rovnaká hlavička.
- Accordion oblastí má kompaktnejšie 44px summary, užšie medzery/paddingy, zalamovanie názvov a mobilné ovládacie plochy.
- Zachované pohyby oblasti, Lexical textové polia, obrázky, nahrávanie a pôvodné `save()` API volanie.

### 2. Sekcie a podsekcie

- Aj `AdminSectionEditor` potláča druhý titulok, zachováva názov stránky `Sekcie a podsekcie`.
- Zjednotené border radius, fonty labelov, výšky polí, karty a toolbary s tokenmi článkového editora. Dvojstĺpcový toolbar používa `minmax(0,...)` a na tablete sa zmení na jeden stĺpec, aby nepretiekol.
- Zachované `AdminSortableOrderPreview`, vyhľadávanie, hierarchia, viditeľnosť, editácia podsekcií, `dirty`, `onReorder` a save.

### 3. Psie meniny

- Shell má názov `Psie meniny`; odstránený technický výraz `Canonical` vo viditeľnom titulku.
- Zjednotený kompaktný systém KPI, toolbaru a formulárov; pridaná stručná informácia `Zobrazené: X z Y mien`.
- Každá tabuľková bunka má zrozumiteľné `data-label`. Na šírke ≤700px sa z tabuľkových riadkov stávajú zrozumiteľné mobilné karty; na desktope zostáva štandardná tabuľka. Celá tabuľka má vlastný focusovateľný región.
- Import JSON sa zobrazuje ako **zbalená voliteľná sekcia**, na kliknutie sprístupní všetky pôvodné polia a tlačidlá. Používateľské štítky štyroch importných výsledkov sú slovenské; kódy `INSERT/UPDATE/SKIP/ERROR`, kontrola chýb a `runImport(false/true)` sa **nezmenili**.
- Modal pridania/úpravy, archivácia s potvrdením, status, požadované údaje a všetky API zostávajú rovnaké.

### 4. Články, Plemená, Recenzie a testy

- Zachované už zavedené `EditorWorkspace`, správanie kanonických publikačných akcií a Notion importu.
- Recenzie majú spoločný markér `data-admin-content-module="reviews"` s ostatnými zjednocovanými obsahovými obrazovkami; žiadne nové duplicity kariet či workflow.
- `data-admin-content-module` je iba značkovanie pre admin styling; nemení vyhľadávanie ani serverové údaje.

## Technická ochrana

- Každý nový globálny CSS selector je pod `[data-admin-workspace]` a opt-in identitou modulu. Zoznamy, verejný web a ostatné editory nie sú zasiahnuté.
- Žiadne globálne `overflow-x:hidden`, žiadna nová databázová migrácia, API mutácia, Notion synchronizácia, zmena oprávnení, publikovania ani data edit flow.
- Závisí na spoločných tokenoch z krokov 3–8; nemení samotný systém `EditorWorkspace`.

## Testy

**Source contracts**: `tests/admin-content-step9.test.mjs` (5 prípadov, zachovanie save, uploadu, poradia, statusov, read-only import preview a vzhľadu).

**Izolované Playwright**: `tests/e2e/admin-content-step9.spec.ts`, iba localhost/admin fixture. Read-only scenáre pre Šteniatka, Sekcie, Recenzie a Psie meniny na 320/390/768/1440px; accordion, šírka, nadpisy, import a mobilná tabuľka. **Neodosiela žiadne formuláre ani zápisové API požiadavky.**

**Otvorené pred merge:**
- [ ] CI a TypeScript na poslednom HEAD, Playwright na autentifikovanej fixture; výsledok statickej kontroly nie je vizuálne potvrdenie.
- [ ] Skutočné iOS/Safari screenshoty na 320/375/390/430/768/1440px vrátane dlhého mena a otvoreného importu.
- [ ] Zapracovať nasledujúce Work audit výstupy (ďalšie záložky plemien a zvyšné obrazovky).
- [ ] Vetvu zosúladiť s aktuálnym `main` (už bola zaostávajúca), preveriť konflikty a potom žiadať potvrdenie na merge.

**Nasledujúci krok 10/18:** Adresár/Služby, kategórie, detail profilu a editor, podľa nových Work audit nálezov.
