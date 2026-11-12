# Psipedia Admin – krok 6/10: React renderovanie a klientský výkon

**PR:** #1318; **vetva:** `fix/admin-stability-10-steps-20261111`.  
**Cieľ:** znížiť záťaž hlavného vlákna pri tabuľkách, editovaní a globálnom hľadaní bez zmeny dátového alebo navigačného kontraktu. Žiadna migrácia, Notion write ani zmena REST API.

## Kontrola už existujúcich riešení

- Admin používa vlastný zdieľaný `AdminRecordTable` založený na existujúcom **TanStack Table**. Tabuľky zobrazujú strany s obmedzeným počtom riadkov; nebolo vhodné dopĺňať druhú knižnicu pre virtualizáciu.
- `AdminQuickNavigation` už používa `next/dynamic` a **Fuse.js/Radix** načítava až pri otvorení Ctrl+K; prefetch po každom renderi teda nebol hlavný problém.
- `AdminQuickNavigationDialog` už mal 140 ms debounce, `AbortController`, TTL cache 15 sekúnd a strop 24 cached query. Tieto mechanizmy zostali.
- `EditorWorkspace` používa `IntersectionObserver` na sledovanie aktuálnej sekcie; závislosti efektu pôvodne obsahovali objektové `sections` a `onSectionChange`, ktoré sa v editoroch často rekonštruujú pri každej zmene poľa.

## Implementované opravy

### 1. Tabuľky: stabilné TanStack modely a menej aktualizácií pri resize

`components/admin-record-table.tsx`:
- `getCoreRowModel<T>()` a `getSortedRowModel<T>()` vytvárame cez `useMemo` **raz na životnosť danej tabuľky**, pri zachovaní generických typov.
- `getRowId` je stabilná funkcia, ID z D1 zostáva zdrojom identity riadka.
- Ovládaný `SortingState` vytvárame iba po zmene sort ID/direction, nie pri každom lokálnom renderi.
- Keď `serverSorted` alebo `serverSorting`, nastavuje sa `manualSorting: true` a **lokálny sorted row model sa nespúšťa**. Radenie na backendom stránkovaných tabuľkách tým nepreusporiada len aktuálnych 50 záznamov.
- `columnResizeMode` sa zmenilo z `onChange` na **`onEnd`**: pri ťahaní sa nesnaží prepočítať celý TanStack model po každej udalosti pointermove; finálna šírka sa aplikuje po pustení myši/prsta. Všetky doterajšie stĺpce, viditeľnosť a klávesnica zostali.

Dôležité: nejde o virtualizáciu riadkov, ktorá by mohla narušiť mobilné karty, focus alebo prístupnosť.

### 2. Editor sekcií: observer sa nereštartuje pri písaní

`components/admin-editor-workspace.tsx`:
- Sledovanie observera teraz závisí na stabilných **ID sekcií**, `mode` a `sectionMode`, nie na novej referencii `sections` alebo callbacku pri každom prepise draftu.
- Aktuálny `onSectionChange` sa bezpečne aktualizuje v malom `useEffect`.
- Už nahlásená sekcia sa neposiela znova do React state/callbacku.
- Ak `IntersectionObserver` zanikne alebo sa zmenia ID/mode, stále sa správne odpojí; scrollovanie a navigácia do sekcie zostáva pôvodná.
- Viditeľné položky sa vyberajú jedným prechodom namiesto `entries.filter().sort()` pri každej notifikácii.

### 3. Globálne vyhľadávanie: neredukovať zoznam na každý hover/šípku

`components/admin-quick-navigation-dialog.tsx`, `lib/admin-quick-navigation-results.ts`:
- Fuse vyhľadávanie sekcií je memoizované podľa `query`.
- Zmiešané výsledky zo sekcií a z D1 sa memoizujú podľa `query`, sekcií a výsledkov; presúvanie aktívneho riadka už match neprepočítava.
- Starý kvadratický `findIndex` dedup pre každý prvok nahradil jednopriechodový **Set**; prvý zhodný href ostáva v pôvodnom poradí, takže nad lokálnymi sekciami nevzniknú duplicitné položky.
- `onMouseEnter` nepíše stav, ak je riadok už označený.
- Debounce, cancelation, cache limity a endpointy zostali nezmenené.

### 4. Opakované komponenty v riadkoch

- `AdminReviewCheckbox` je `React.memo`, lebo dostáva iba primitive props a drží vlastný stav API požiadavky.
- `AdminRecordId` je `React.memo`; vlastné kopírovanie do clipboardu ostáva nezmenené.
- Zmeny stavu rodičovského zoznamu preto nemusí sprevádzať nový render všetkých ID tlačidiel a review checkboxov.

## Čo sa zámerne nemení

- Existujúci TanStack Table, filter/sort/paging/focus/selection kontrakt, `admin_record_tombstones`, operácie zmeny statusov, publikovanie.
- Synchronizácia Notion, Cloudflare D1 schéma, backendové dotazy, názvy profilov a počet záznamov.
- Lazy loading command palette už bol pripravený, bez pridania duplicity `dynamic()`.
- Žiadna nová npm dependency. Virtualizáciu a veľké zásahy do UI riešiť iba pri konkrétnych meraných dlhých úlohách; na 40–50 záznamov na stránku nie je automaticky prínosom.

## Regresné testy

- `tests/admin-react-performance-step6.test.mjs`: reálne testovanie čistej funkcie na stabilné deduplikovanie, source-contract kontrola TanStack sort/selection/resize, stabilita IntersectionObserver, cache+debounce/search a review/ID API affordance.
- `tests/admin-record-table-selection.test.mjs` aktualizovaný tak, aby kontroloval `manualSorting` aj pri `serverSorted`.
- `npm run test:admin-react-step6` zapojený do existujúcej `test:admin-pwa` sady. Nepridali sa balíky.

**Stav verifikácie:** statické porovnanie kódu a kontrola existencie testov prebehla, ale lokálny Node/npm test runner, TypeScript build, Playwright, výkonnostný profil Chrome ani reálne iOS meranie v tejto fáze **nebežali**. Nemožno preto tvrdiť konkrétne percentuálne zrýchlenie ani úplné vyriešenie zamŕzania.

## Ďalšie kroky

7/10: iOS/PWA/navigácia/tab life cycle; 8/10: chybové zotavenie detailov (vrátane organizácie #128); 9/10: E2E/integračné a performance regresie; 10/10: aktualizácia proti súčasnému main, TS/build/CI, pred/po merania a testy.
