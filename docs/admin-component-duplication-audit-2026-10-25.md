# ADMIN-DUP-01 — Audit duplicitných komponentov administrácie

**Dátum:** 25. 10. 2026  
**Bod plánu:** 1/5 — iba inventúra a návrh technického zjednotenia  
**Referenčný commit `main`:** `645d452bc372e38c843dfe770ad94fede2a65065`  
**Rozsah inventúry:** 117 súborov `components/admin-*.tsx` a 106 admin `page.tsx` (spolu 223 primárnych vstupných bodov). Ďalšie knižnice a podkomponenty sú zachytené podľa konkrétnych väzieb.  
**Metóda:** manuálna revízia kľúčových editorov, dashboardov, zdieľaných komponentov a vybraných utilít + reprodukovateľný read-only skener `scripts/admin-ui-duplication-inventory.mjs`.

> **Dôležité:** PR #1040 („ADMIN — Spoločné galérie, titulné fotky, texty a modály“) bolo pri audite stále **otvorené ako Draft, NIE merged**. Preto tabuľka „na main“ nie je opisom jeho rozpracovaných zmien. Pred bodom 2 najprv znovu overiť merge #1040 a odpočítať jeho implementácie. Nerobiť totožnú prácu dvakrát.

## Kvantitatívny baseline z úspešného CI skenera

Skener prešiel všetkých **223** zdrojových vstupov (`117` komponentov a `106` stránok). Záznam z `ADMIN-DUP-01 read-only inventory` na `main` baseline:

| Syntaktický signál | Výskytov | Súborov |
|---|---:|---:|
| Natívne `window.confirm` | 50 | 35 |
| Vlastné navigácie so štítkom „Stránkovanie“ | 10 | 9 |
| Použitie zdieľaného `AdminPagination` | 4 | 4 |
| HTML `<button>` | 351 | 104 |
| Zdieľané `AdminActionButton` | 149 | 28 |
| HTML file-input | 21 | 17 |
| Použitie spoločných modálov | 23 | 17 |
| Zdieľané galérie | 2 | 2 |
| Použitie `EditorUnsavedChangesGuard` | 5 | 5 |

**Interpretácia:** 50 potvrdení **neznamená 50 bugov** a 351 tlačidiel **neznamená 351 duplicít**. Ide o počet syntaktických výskytov v pôvodnom `main`, nie počty chýb. Dôležitý je zoznam potvrdených miest, ich pracovný tok a odpočet zmien už pripravených v #1040. Výsledky sú reprodukovateľné príkazom `node scripts/admin-ui-duplication-inventory.mjs --json`.

## Výsledok auditu

- **Potvrdená duplicita:** dva alebo viac implementačných miest riešia rovnaký UI mechanizmus (napr. stránkovací panel, potvrdenie odchodu). Zhodné použitie komponentu neznamená rovnaký dátový kontrakt.
- **Kandidát:** opakujúci sa vzor, pri ktorom je vhodné zdieľať stavebné prvky alebo pomocnú logiku až po porovnaní kontraktov.
- **Oprávnená odlišnosť:** špecifická validácia/persistencia má zostať v agende; „zjednotenie“ nesmie byť plošné prepísanie.

### Register nálezov a poradie realizácie

| ID | Priorita | Stav | Zistenie a konkrétne dôkazy na `main` | Bezpečný cieľ | Nadväzujúci bod |
|---|---|---|---|---|---|
| DUP-01 | P1 | **Potvrdená duplicita** | Native `window.confirm` vedľa spoločného `AdminModalDialog`: [Adresár](../components/admin-directory-editor.tsx) (kategória + odchod, riadky ~531/736), [Pomoc psom – zoznam](../components/admin-help-dashboard.tsx) (~136), [katalóg služieb](../components/admin-service-catalog-workspace.tsx) (~96/179), [Navigácia](../components/admin-navigation-editor.tsx) (~57), [Sekcie](../components/admin-section-editor.tsx) (~121), [Partner claim](../components/admin-partner-claim-actions.tsx) (~14–15) a ďalšie akcie. | Existujúci prístupný `AdminDestructiveConfirmDialog` / `AdminUnsavedNavigationDialog` podľa významu. Zachovať pôvodnú mutáciu až po potvrdení a bezpečný focus na Zrušiť. | 2 |
| DUP-02 | P1 | **Potvrdená duplicita** | Spoločný [`AdminPagination`](../components/admin-pagination.tsx), použitý v [Adresári](../components/admin-directory-dashboard.tsx) (~189) a [Organizáciách](../components/admin-organization-publication-dashboard.tsx) (~254), ale vlastné navigácie v [Adopciách](../components/admin-adoption-dashboard.tsx) (~65), [Stratené/Nájdené](../components/admin-lost-found-dashboard.tsx) (~23) a [Pomoci psom](../components/admin-help-dashboard.tsx) (~204). | Jeden komponent/stavebná logika s voliteľným číselným režimom. Zachovať filtre, query parametre, počty, HTML odkazy a klávesnicu. | 4 |
| DUP-03 | P1 | **Kandidát na zjednotenie** | GET filtre v [Adopciách](../components/admin-adoption-dashboard.tsx) (~51–59), [Pomoci psom](../components/admin-help-dashboard.tsx) (~171–176) a [Adresári](../components/admin-directory-dashboard.tsx) (~103–114) verzus riadené filtre v [Podujatiach](../components/admin-event-dashboard.tsx) (~255–260) a [Plemenách](../components/admin-breed-dashboard.tsx) (~150–154). | Zdieľať **kompozíciu/filter shell, vymazanie, URL serializáciu**, nie význam polí. Zachovať serverové fulltextové vyhľadávanie, voľby a bezpečné hranice. | 4 |
| DUP-04 | P2 | **Potvrdená duplicita pomocnej logiky** | [`lib/admin-list-query.ts`](../lib/admin-list-query.ts) má stránkovací limit a sklopenie slovenskej diakritiky (`boundedAdminPageSize`, `sqlFoldAdminText`); [`lib/admin-event-pagination.ts`](../lib/admin-event-pagination.ts) má vlastný `positiveInteger`, limity 50/100 a SQL `foldSql`. | Zdieľať len bezpečné čisté helpery po ekvivalenčných testoch pre rozličné vstupy; nemení sa filtrovanie ani SQL výsledky. | 4 |
| DUP-05 | P2 | **Potvrdený rozdiel UI realizácie** | [`AdminActionButton`](../components/admin-interaction-system.tsx) existuje, ale [Pomoc psom editor](../components/admin-help-editor.tsx), [Stratené/Nájdené](../components/admin-lost-found-editor.tsx), [Adopcie](../components/admin-adoption-editor.tsx), [Oblasti Šteniatok](../components/admin-puppy-area-editor.tsx) a viaceré dashboardy majú množstvo lokálnych `<button>`. | Zdieľať iba rovnaké typy akcií (primary/neutral/destructive, loading a 44px). `type="submit"`, disabled podmienky, form binding a rôzne workflow sa nesmú stratiť. | 2 |
| DUP-06 | P2 | **Potvrdený rozdiel UI realizácie** | Editory majú nezávislé `message/error/saving` zobrazovanie; základ [`EditorStatus`](../components/admin-editor-workspace.tsx) existuje, ale [Adopcie](../components/admin-adoption-editor.tsx), [Pomoc psom](../components/admin-help-editor.tsx), [Katalóg služieb](../components/admin-service-catalog-workspace.tsx) používajú vlastné textové stavy. | Prevziať spoločné `AdminFormFeedback` z #1040 po merge, ponechať sémantiku `role=alert/status`, chyby jednotlivých polí a bez zmeny API. | 2 |
| DUP-07 | P2 | **Potvrdený rozdiel ochrany navigácie** | [`EditorUnsavedChangesGuard`](../components/admin-editor-workspace.tsx) už existuje, ale [Adresár](../components/admin-directory-editor.tsx) na `main` používa `open={false}` a natívne potvrdenie, [Adopcie](../components/admin-adoption-editor.tsx) či [Stratené/Nájdené](../components/admin-lost-found-editor.tsx) nemajú rovnaký guard. | Zohľadniť ochranu spracovanú v #1040; pri zostávajúcich prípadoch sa nesmú potvrdzovať „stratené zmeny“ po úspešnom save. | 2 |
| DUP-08 | P2 | **Čiastočne spoločný mechanizmus** | Na `main` existuje [`AdminPhotoGallery`](../components/admin-photo-gallery.tsx) pre URL pole, kým rôzne editory používajú samostatné primárne `type=file` vstupy a ukladacie callbacky. [Facebook obrázky](../components/admin-facebook-images.tsx) (~351) obsahujú vlastný picker; [JSON import](../components/admin-address-research-import.tsx) (~252) je naopak zámerne **iný formát**. | Po merge #1040 znovu skontrolovať `AdminSingleImageUpload`, `AdminGalleryDropzone`, `adminSelectedImage`; nezjednocovať JSON import s obrázkom ani R2 priečinky. | 3 |
| DUP-09 | P2 | **Odlišné dátové modely** | [`AdminPhotoGallery`](../components/admin-photo-gallery.tsx) pracuje s `string[]`, štruktúrované obrázky článkov a plemien môžu obsahovať `alt/caption/credit/imageKey/size`; používa sa viacero spôsobov radenia. | Spoločné ovládanie/radenie áno, **nikdy** automaticky prevádzať štruktúrovanú galériu na pole URL. #1040 už pripravuje spoločné DnD identifikátory. | 3 |
| DUP-10 | P2 | **Kandidát po kontrole kontraktov** | [`AdminBulkSelection`](../components/admin-bulk-selection.tsx) rieši explicitný/all-matching výber a fingerprint snapshotu, zatiaľ čo [Podujatia](../components/admin-event-dashboard.tsx) a [Pomoc psom](../components/admin-help-dashboard.tsx) majú ďalšie vlastné bulk akcie. | Reuse len UX a neškodných helperov, ak sedí snapshot/eligibility/atomicita. **Nesmie** sa meniť množina schválených záznamov alebo publish lifecycle. | 4 |
| DUP-11 | P3 | **Kandidát pre spoločný prezentačný obal** | [Adopcie](../components/admin-adoption-dashboard.tsx) a [Stratené/Nájdené](../components/admin-lost-found-dashboard.tsx) používajú vlastné tabule + responsívne obaly; [import adries](../components/admin-address-research-import.tsx) má dve široké tabuľky s inline štýlmi. | Najprv zdieľaný prístupný wrapper, prázdny stav a šírka; na TanStack neprechádzať iba kvôli použitiu knižnice. | 4 |
| DUP-12 | P3 | **Oprávnená odlišnosť – neprepísať** | [Rich-text článkov](../components/admin-article-block-editor.tsx), [redakčný rich-text](../components/admin-rich-text-editor.tsx) a [text podujatí](../components/admin-event-markdown-editor.tsx) nemajú automaticky rovnaký persistovaný formát. | Reuse len tlačidla/prístupného dialógu na pridanie textu; bezstratový prevod AST ↔ Lexical nie je týmto auditom potvrdený. | 3 |

### Doplnkové oblasti na kontrolu po merge #1040

- **Potvrdenia, ktoré #1040 zjavne nepokrýva úplne:** katalóg služieb (dve `window.confirm`), partner podujatia, niektoré potvrdzovania filtrov v Adresári, Gemini/Notion samostatný modál, Facebook editor a automatizačné review. Pred zásahom najprv audit konkrétneho toku a focus kontraktu.
- **Globálna konzistentnosť CSS:** zdrojom má byť existujúci admin design system, nie duplikovanie CSS class names naprieč editormi. V bode 1 sa žiadna CSS trieda neodstraňuje.
- **Rôzne typy filtrácie:** miestne filtre URL GET, riadené klientské filtre, dynamické agendy a API filtrovacie operácie nemôžu slepo zdieľať rovnaké serializované polia.
- **Validácia:** ak už ju vlastní Zod/server, nesmie ju spoločný input obísť; prístupné field-level chyby sú iná vrstva než validácia domény.

## Stav #1040: musí sa odpočítať pred ďalšími implementačnými bodmi

Na samostatnej vetve #1040 sú už pripravené spoločné uploady, triedenie galérií, dostupné modály, Lexical append, `AdminFormFeedback` v deviatich editoroch a ďalšia ochrana neuložených zmien. Audit **neoznačuje tieto úpravy za nasadené**, keďže v referenčnom `main` ešte nie sú. Po ich merge treba zmeniť stav nálezov DUP-01, 05–09; neotvárať druhý PR s rovnakými úpravami.

## Akceptačné kritériá nasledujúcich bodov

1. **Bod 1 (tento PR):** register nálezov s prioritou, skutočnými súbormi, triedou dôkazu, bezpečnými hranicami a reprodukovateľnou inventúrou; **0 zmenených runtime komponentov / API / D1 / R2**.
2. **Bod 2:** po merge #1040 prevziať len potvrdené duplicity tlačidiel, potvrdení, feedbacku a unsaved guardu. Pri každom odstránenom vzore priložiť test, že zrušenie nič neodosiela a save funguje.
3. **Bod 3:** bezpečné spoločné ovládanie médií a textu bez zmeny úložných kontraktov; vylistovať všetky skutočne nahradené implementácie.
4. **Bod 4:** jednotné filtre/stránkovanie a vyhodnotenie bulk mechanizmov, s testami query, výberu a desktop/mobil.
5. **Bod 5:** až po kontrolovanom nahradení zmazať nepoužívaný starý kód, urobiť testy, screenshoty 1440/390/320 a finálny súpis výnimiek.

### Reprodukcia inventúry

```bash
node scripts/admin-ui-duplication-inventory.mjs
node scripts/admin-ui-duplication-inventory.mjs --json
node --test tests/admin-ui-duplication-inventory.test.mjs
```

Skener je **read-only**, skúma každý `components/admin-*.tsx` a každé TSX pod `app/admin`. Počty sú syntaktické indikátory, **nie automatické dôkazy duplicity**: napr. obyčajný `<button>` či `<table>` môže byť oprávnený. Dôkaz duplicity a priority stanovuje táto ručne revidovaná tabuľka.
