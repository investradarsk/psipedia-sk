# Psipedia Admin Performance V2 – kroky 2–10

**PR:** #1321 · **Báza:** main po #1318 · **Dátum:** 12. november 2026  
**Cieľ:** odľahčiť načítanie editorov, znížiť nepotrebné D1 volania a udržať bezpečnosť formulárov.

## Skutočné zmeny v tomto PR

| Krok | Implementácia | Bezpečnostná hranica |
|---|---|---|
| 2. Články | Celoobrazovkový náhľad a editor výrezu sú `next/dynamic`; grafika Facebook sa importuje až pri spustení generovania; náhľad sa ani nemountuje, kým nie je otvorený | Uloženie, status a rich-text kontrakt nezmenené |
| 3. Služby a plemená | V adresári sa crop, FB panel a breeder galéria načítajú až pri potrebe; galéria a FB zostávajú namontované po prvom otvorení, aby sa nestratili rozpracované úpravy; galéria plemien a DnD sú v samostatnom chunku | Parent editor stále vlastní skutočné dáta; immutable `moveAdminGalleryItem` nahrádza iba utility `arrayMove` |
| 4. Podujatia a mobil | Mapy a geo panel sa nenamontujú pri otvorení ostatných sekcií; po prvom otvorení lokality zostanú namontované; foto crop a FB panel sú lazy importy | Rozpracovaný mapový stav sa nestratí pri zmene sekcie; žiadne Google Places volania navyše |
| 5. D1 vyhľadávanie | Read-only SQLite EXPLAIN/bench porovná existujúci substring filter s indexovaným presným Admin ID; bez nových indexov alebo produkčnej migrácie | Bez zmeny výsledkov, tombstone filtrov, ACL, schematických lockov; FTS5 až po zvláštnom schválenom návrhu |
| 6. Command palette | Číselné Admin ID preskočí 140 ms debounce; textové zostanú so debounce; query sa skráti na existujúci serverový limit 80 znakov, takže nadlimitné znaky nespúšťajú identické requesty | AbortController a krátka in-memory cache zostávajú |
| 7. Upozornenia | `react.cache` pre exact summary **len v rámci jedného server requestu**; zdieľané medzi AdminShell a pracovným prehľadom | Nie je to globálna alebo viacsekundová cache, pri ďalšom RSC requeste sa stav zistí znovu |
| 8. Organizácie | Uloženie samotnej adresy alebo noop už nevyvolá celú `router.refresh()` sekvenciu; po uložení identity sa naďalej obnoví kanonický kontext | Údaje a snapshoty adresy sa aktualizujú podľa serverovej odpovede; ochrana novších úprav platí |
| 9. Tabuľky | Recyklovaná prázdna selekcia pre bežné tabuľky bez výberu, aby TanStack nemusel prepočítavať selection model; benchmark a kontrakt limitu 50 záznamov pri organizáciách | Server-side ordering, ID a bulk preflight bez zmeny |
| 10. Integrácia | Regresný Node/AST test, rozšírený read-only CI, syntetický benchmark, meranie TypeScript diagnostík podľa zmenených súborov, konfliktový audit a zosúladenie `main` | Žiadny deploy, produkčný zápis, migrácia, Notion edit ani automatické zlúčenie |

## Ako sa testuje

- `npm run test:admin-performance-v2` zahŕňa AST source baseline, 8 nových kontraktov, legacy Admin/PWA regresie, D1 search a exact attention-count testy, plus TS diagnostický parser.
- `npm run audit:admin-performance-v2 -- --json` zbiera porovnateľnú source-only baseline.
- `npm run benchmark:admin-search-v2` meria **iba syntetickú SQLite** v pamäti, SQL plán a lokálny p50/p95; čísla sa nesmú vydávať za produkčné D1/INP.
- `.github/workflows/admin-performance-v2.yml` vykonáva Node regresie a lokálnu query-plan diagnostiku s `permissions: contents: read`.
- Pôvodné `e2e:admin-stability-step9` stále poskytuje read-only prehliadačové merania navigácie, no emulácia mobilu nie je reálny iPhone Safari.

## Integrácia kroku 10 a oprava hlavného CI

Prvý priechod hlavného `Playwright E2E and production smoke` workflowu pre PR #1321 skončil na
`tests/admin-attention-queue.test.mjs`. Test stále hľadal `loadExactAdminAttentionSummary`
v `AdminShell`, ktorý od kroku 7 správne používa `loadRequestAdminAttentionSummary`.
Jeho očakávania som prepísal tak, aby overovali zdroj `react.cache` a volanie
pôvodnej exact D1 agregácie **vo vnútri request-scoped loadera**, nie starý import.

Stránka `/admin/operations` tiež používa `loadRequestAdminAttentionSummary()`,
preto sa opakované RSC čítania v rámci jedného requestu správajú jednotne.
Doplnil som ju do kontrolovaného TypeScript scope a do regresných testov. Zachované
zostávajú dostupnosť/partial stavy počítadla, neukladá sa dlhodobá cache a nemení
sa kanonický zdroj dát ani logika upozornení.

**CI pre posledný commit sa musí vyhodnotiť podľa skutočných GitHub Actions runov.**
Úspech predchádzajúceho scoping workflowu nie je dôkazom úspechu posledného
commitu a zlúčenie sa nesmie vyhlasovať za dokončené pred finálnou kontrolou.

## TypeScript je samostatný projektový problém

Pri prvom plnom `npx tsc --noEmit` kontrola na tejto vetve odhalila **994 projektových diagnostík**, väčšinou mimo zmenených súborov – napr. Cloudflare Env/DB typing, historické formuláre a verejné stránky. Nepravdivo by bolo tvrdiť, že projekt prešiel čistým typecheckom.

Zmenené súbory majú preto dodatočnú kontrolu `scripts/check-admin-v2-types.mjs`, ktorá zo skutočného výpisu `tsc`:
1. vypíše počet všetkých diagnostík,
2. vyberie diagnostiky len v tomto PR zmenených TypeScript súboroch,
3. odlíši jedinú **predchádzajúcu** známe chybu `defaultOpen` v `admin-article-editor.tsx`,
4. failne CI pri akejkoľvek ďalšej diagnostike v dotknutých súboroch.

Táto kontrola **nenahrádza plný čistý typecheck** a neignoruje nové chyby v dotknutých súboroch. Dokumentované globálne chyby treba opraviť v samostatnej typovej úlohe, nie naraz s bezpečnými výkonnostnými optimalizáciami.

## Akceptačné podmienky

1. Žiadny `POST/PUT/PATCH/DELETE` v nových benchmarkoch, žiadna produkčná DB ani Notion migrácia.
2. Funkčné prepínanie sekcií v editore, bezpečný upload/odstránenie obrázku, zachovaná galéria a mapa po návrate do sekcie.
3. Žiadny zásah do Notion sync smerov, publish/unpublish, kontrolného ID a načítania údajov.
4. Profilové vyhľadávanie stále vracia rovnaké kategórie a rešpektuje tombstones, fallback a ACL.
5. Source metri­ky sa neprezentujú ako dôkaz zmenšenia výsledných JavaScript bundle chunks; na to je potrebná produkčná/browser bundle diagnostika.
6. PR zlúčiť až po vlastnom rozhodnutí redakcie a vyhodnotení CI; netvrdiť úspešný build bez výsledku.

## Zostávajúce technické príležitosti (mimo tohto PR)

- FTS5 index pre osm kategórií len po samostatnej špecifikácii zápisov, triggerov, backfillu a aktuálneho `rows_read`.
- Rozbiť monolitický editor do viac samostatných stabilných formulárov pri zachovaní optimistic concurrency, Notion delta a dirty snapshotov.
- Meranie reálneho iOS Safari main-thread long tasks / INP a p95 RSC/D1 latencie na prevádzke.
