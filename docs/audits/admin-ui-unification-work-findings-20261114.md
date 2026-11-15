# Psipedia.sk – priebežný Work audit: nálezy z 14. 11. 2026

**PR:** #1369 (Draft), pokračovanie jednotného vizuálu.  
**Referenčný vzhľad:** editor článkov.  
**Pôvod nálezov:** nezávislý vizuálny audit, ktorého text poskytol majiteľ. Ide o 3× P2 a 2× P3; nie všetky obrazovky sú už kompletne prehliadnuté.  
**Bezpečnosť:** zachované D1/R2, Notion, API, publikovanie, form submission, vyhľadávanie, autentifikácia a všetky uložené dáta.

## P2.1 – sticky Tiptap lišta prekrývala začiatok sekcie

**Zistenie:** pri prechode na „Úvod a obsah“ sa označenie „Názov článku“ dostalo pod formátovaciu lištu.  
**Príčina v CSS:** `admin-content-editor-v3.module.css` používalo pre sekciu `scroll-margin-top` odvodené len od `--admin-sticky-stack`. Samostatná `[data-admin-tiptap-toolbar]` je tiež sticky, navyše sa môže zalomiť.

**Zmena:** `TiptapSharedToolbar` meria výšku cez `ResizeObserver` a ukladá ju ako `--admin-tiptap-toolbar-height` na opt-in article editor. Active sekcia a interaktívne polia používajú `scroll-margin-top: calc(admin stack + measured toolbar + 16px)`. Žiadne nové scroll kontajnery; `AdminSharedEditorNavigation` zostáva pôvodné.

**Overenie:** E2E prepne Publikovanie → Úvod a obsah na 320/390/768/1440px a kontroluje `label[for="article-title"]` oproti dolnej hrane toolbaru.

## P2.2 – nevyvážené filtre článkov

**Zistenie:** „Smer“ zaberá celý riadok, hľadanie je príliš úzke, „Filtrovať“ nevyzerá ako CTA.

**Zmena:** vo formulári článkov (a zhodnej šablóne Šteniatok) má vyhľadávanie plnú použiteľnú šírku. „Zoradiť“ a „Smer“ zostávajú v jednej dvojstĺpcovej skupine na desktope aj mobile. Tlačidlo má kanonický primárny vzhľad (zelená, 44px, focus). Pôvodné `name`, `defaultValue`, `onChange`, `applyFilter`, GET route a reset zostávajú.

**Overenie:** E2E porovná súradnice sort/direction pri 390/1440px; nespôsobuje dokumentový overflow.

## P2.3 – akcie tabuľky mimo viditeľnej šírky

**Zistenie:** pri článkoch sa stĺpec Akcie nachádzal vpravo mimo viditeľného výrezu tabuľky, preto vyžadoval horizontálny posun.

**Zmena:** `AdminRecordTable` prijíma iba opt-in `stickyActions` (default `false`), označuje vygenerovanú hlavičku column id, a `admin-record-table.module.css` pripína iba `[data-column-id="actions"]` v bežnej tabuľke. Články ho zapínajú, vedľajšie stĺpce boli zúžené. Mobilné card mode a ostatné adresáre/tavulky zostávajú bez sticky akcií. Scroll širokej tabuľky a resize stĺpcov nie je vypnutý.

**Overenie:** statický kontrakt + podmienený E2E pre naplnenú tabuľku; v izolovaných E2E dátach môže byť zoznam prázdny, čo nestačí ako dôkaz všetkých akcií.

## P3.4 – opakované odkazy a sedem nulových kariet na dashboarde

**Zistenie:** Kvalita údajov mala viac odkazov na pracovnom prehľade; sedem komunít s nulou bolo vykreslených ako veľké karty.

**Zmena:** kvalita údajov zostáva ako jedna dôležitá priorita v hornej sekcii. Odstránené opakované odkazy z panelu Gemini a spodných rýchlych odkazov. Komunitné zdroje so skutočnými nevybavenými položkami **alebo nedostupným počtom** sú ďalej samostatné viditeľné karty. Zdroje s *potvrdenou nulou* sú rozbaliteľné v jednom kompaktnom `<details>` s plne funkčnými filtrami `/admin/operations?source=...`. Načítavanie má jeden placeholder namiesto siedmich. Nezamieňa sa nedostupné s nulou.

**Overenie:** statické testy status delenia a prístupných odkazov; dashboard E2E otvorí skupinu nulových agend, ak sa v daných dátach nachádza.

## P3.5 – typografia a duplicitné publikovanie

**Zistenie:** rôzne písma v paneloch, publikovanie dvakrát upraviteľné a viacero umiestnení tlačidiel.

**Zmena:** typografia administrátorských nadpisov bola zjednotená v kroku 3 (serif zostáva iba v náhľade obsahu publikovaného článku). Pravý rail už obsahuje iba read-only súhrn termínu a odkaz na jedinú aktívnu sekciu Publikovanie; neobsahuje ďalší datetime input ani druhú sadu save/schedule/publish. Kanonický vstup termínu je `#article-published-at`; desktopové akcie ostávajú v spodnom actionbare, mobilné publikovanie v sekcii a uloženie v actionbare. Tieto rozdielne mobil/desktop akcie nie sú naraz viditeľné.

**Overenie:** aktualizované E2E aj source kontrakty potvrdzujú jediný dátumový input a dostupnosť publikovania cez pôvodné akcie.

## Regresia a aktuálny stav

- **Zmeny:** uvedené komponenty, CSS, testy; žiadne D1/Notion API, databázové migrácie, R2, Cloudflare deployment.
- **Kontraktný test:** `tests/admin-work-audit-step7.test.mjs`.
- **E2E:** `tests/e2e/article-admin-editor.spec.ts` a `tests/e2e/admin-ia-2.spec.ts`.
- **Existujúce testy:** upravené závislé statické kontroly počtov/rail polí (`admin-workspace-overview-performance`, `admin-workspace-notifications-v2`, `admin-editor-article-single-section-step8`), nie obchádzané guardy ukladania.
- **Pred merge:** overiť kontraktné CI, TypeScript, komplet Playwright z aktuálneho HEAD, autentifikované a naplnené fixtures + screenshoty mobil/desktop. Zelený static test nie je dôkaz skutočného prekrytia na iPhone.
- **Otvorené:** audit ostatných záložiek článku, Recenzií a testov a Plemien od majiteľa ešte nebol dodaný; následné zistenia sa spracujú po doručení.

**Status:** implementované v otvorenom Draft PR #1369. **Bez merge/deploy**.
