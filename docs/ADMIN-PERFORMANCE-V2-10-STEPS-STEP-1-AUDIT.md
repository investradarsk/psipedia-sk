# Psipedia Admin – performance V2, krok 1/10: východiskový audit

**Dátum:** 12. 11. 2026  
**Repo:** `investradarsk/psipedia-sk`  
**Báza:** `main` po zlúčení PR #1318 (východiskový commit `9dcd0056fd63a177603b8014ddd9b11cbd200722`)  
**Pravidlo:** jeden samostatný draft PR a 10 krokov; žiadne nasadenie, migrácia, zápis D1, zmena v Notione ani automatické ukladanie v kroku 1.

## Čo je overené priamo zo zdrojového kódu

| Miesto | Stav na začiatku | Dôvod ďalšej práce |
|---|---|---|
| `components/admin-directory-editor.tsx` | ~81 tisíc znakov, 1 236 riadkov, 43 statických importov; lazy-loaded `AdminPhotoGallery` | Najťažší kandidát na rozdelenie aktívnej a pokročilej časti editora |
| `components/admin-article-editor.tsx` | ~69 tisíc znakov, 1 070 riadkov, 36 statických importov, približne 58 jednoduchých `useState(...)` callsites plus generické | Viaceré podeditory, rich text, grafika, náhľady a SEO sú v jednom klientskom module |
| `components/admin-breed-editor.tsx` | ~51 tisíc znakov, 663 riadkov | Viacero textových/obrázkových podsekcií v jednom editore |
| `components/admin-event-editor.tsx` | ~28 tisíc znakov, 356 riadkov; statický import komponentu Google Maps a rich-text editorov | Potenciál lazy load mapy a grafických nástrojov, no bez zmeny dát a UX |
| `lib/admin-global-search.ts` | 8 kategórií; `instr(lower(coalesce(...)))` pre viaceré textové stĺpce; zdravý stav už používa `database.batch` | Substring vyhľadávanie môže vyžadovať full scan; rozhodnutie o indexe až podľa `EXPLAIN QUERY PLAN` a bezpečnostného kontraktu |
| `components/admin-quick-navigation-dialog.tsx` | Existuje `AbortController`, debounce, TTL a limit lokálnej cache | Nespúšťať duplicitné optimalizácie; najskôr merať odpoveď a skenované riadky |
| `components/admin-navigation.tsx` | `prefetch={false}` + zámerový prefetch pri hover/focus | Nevracať automatický prefetch všetkých D1-backed rout; pozor na iPhone a dirty editor |
| `lib/admin-attention-queue-store.ts` | Rozsiahle SQL pre zdroje upozornení; `AdminShell` zobrazuje exact attention count | Profilovať `loadExactAdminAttentionSummary` a jeho frekvenciu na viacerých routách |
| `app/admin/page.tsx` | Zdieľa jeden `attentionPromise` medzi hlavičkou a dashboardom | Už vyriešená redundancia na hlavnej stránke – neoptimalizovať znova |
| `components/admin-query-provider.tsx` | In-memory TanStack Query cache `staleTime: 20_000`, `gcTime: 60_000`, bez perzistencie | Zvážiť iba cielenú cache pre neosobné read-only zdroje, s invalidáciou po zmene |
| `components/admin-record-table.tsx` | TanStack implementácia, server sorting a `columnResizeMode: "onEnd"` z PR #1318 | Najprv zmerať výkon pri 50/100 riadkoch; neprepisovať fungujúci základ |

Poznámka: „znaky“, „riadky“ a počet statických importov sú **zdrojové ukazovatele**, nie veľkosť preneseného JavaScriptu. Nový AST nástroj poskytuje presnejšie opakovateľné počty, vrátane `import type` a generických React hookov.

## Dodané v kroku 1

- `scripts/audit-admin-performance-v2.mjs`: číta 12 presne určených súborov, cez TypeScript AST počíta runtime vs. type-only importy, `useState`, `fetch`, dynamic import a Next `dynamic`. Overí tiež architektonické signály globálneho vyhľadávania a upozornení.
- `npm run audit:admin-performance-v2`: čitateľný výpis; `npm run audit:admin-performance-v2 -- --json`: strojovo čitateľný JSON.
- `tests/admin-performance-v2-step1.test.mjs`: kontrola AST na fixture, detekcia chybnej syntaxe, presne ohraničená sada súborov, ochrana pred vedľajšími efektmi.
- `npm run test:admin-performance-v2-step1`: iba lokálny Node test, žiadne nasadenie či produkčná DB.
- Samostatný CI workflow (read-only, bez secrets) pre audit/test; ďalšie kroky ho môžu rozširovať.

## Merania, ktoré ešte treba získať (nesmú sa vymýšľať)

| Metrika | Zber a metodika | Interpretácia |
|---|---|---|
| JavaScript po buildnutí | Chunk analysis pre Admin entry + jednotlivé editory; JS transferred/gzipped | Nie `sourceBytes`; treba preukázať zmenu skutočného dodaného balíka |
| Prvý load a prechod medzi sekciami | Autentifikované E2E scenáre desktop Chromium + mobilná emulácia; cold/warm, p50/p95 zo série | Rozlíšiť TTFB, RSC dátové načítanie, hydration a užitočnú interaktivitu |
| iPhone zamŕzanie | Skutočný iPhone Safari/PWA, remote inspector a meranie long tasks; zaznamenať aj návrat z BFCache | Emulácia Chrome nie je iOS WebKit |
| D1 najdrahšie dotazy | Cloudflare D1 Query Insights: `rows_read`, duration, frekvencia; `EXPLAIN QUERY PLAN` na bezpečnej kópii dát | Nemerať produkciu cez neobmedzené `SELECT` full-scan testy |
| Globálne vyhľadávanie | Krátky/dlhý názov, diakritika, ID, nulový výsledok; ochota fallbacku pri chýbajúcej tabuľke | Zachovať existujúce bezpečné parametre, permissions a tombstone filter |
| Ukladanie | Read-only browser timing pred a po bezpečnej testovacej úprave v izolovanom prostredí | Nesmie dôjsť k strate neuložených dát ani k zmenám Notion sync |

## Ochrany, ktoré zostávajú nezmenené

1. Nespúšťať automatické `prefetch` všetkých chránených rout ani cache citlivých údajov do localStorage.
2. Zachovať ochranu neuložených zmien, explicitné potvrdenie opustenia editora a bezpečný iOS PWA fallback.
3. Nezmeniť význam polí, ich prázdnych hodnôt, presunov do Notion ani last-write-wins synchronizáciu.
4. Nemeniť production D1 schému ani nespúšťať migrácie bez samostatnej kontroly.
5. Pri redakčných zápisoch nevynucovať `router.refresh()`, ak by to mohlo zmazať nesúvisiace rozpracované zmeny.

## Plán pokračovania v tom istom PR

1. **Audit a reprodukovateľné source metriky** – tento krok.
2. Rozdelenie najťažších nástrojov editora článkov na bezpečné lazy chunks.
3. Lazy načítanie pokročilých panelov editora služieb a plemien.
4. Mobilná pamäť: životný cyklus náhľadov, mapy a podeditorov, cleanup.
5. Náklady globálneho D1 vyhľadávania: query plans, index experiment bez zásahu produkcie.
6. Search UI: rýchly výsledok, deduplikácia requestov a bezpečné fallbacky.
7. Výpočet upozornení: meranie, zníženie opakovaných read queries a presná invalidácia.
8. Save-to-UI latencia, rozumná aktualizácia po uložení, ochrana rozpracovaných údajov.
9. Výkonnosť tabuliek a najčastejších serverových listov na reálnych testovacích datasetoch.
10. Regressions + E2E meranie pred/po, konfliktový audit, najnovší `main`, finálny CI/build.

**Stav:** krok 1 dodal auditnú infraštruktúru; žiadne produkčné runtime meranie alebo zlepšenie INP zatiaľ nebolo potvrdené. Efekt najbližších zmien sa musí dokázať cez porovnanie s týmto východiskom.
