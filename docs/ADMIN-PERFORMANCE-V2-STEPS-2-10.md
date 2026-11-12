# Psipedia Admin Performance V2 – kroky 2–10

**PR:** #1321 · **Báza:** main po #1318 · **Dátum:** 12. november 2026  
**Cieľ:** odľahčiť načítanie editorov, znížiť nepotrebné D1 volania a udržať bezpečnosť formulárov.

## Skutočné zmeny v tomto PR

| Krok | Implementácia | Bezpečnostná hranica |
|---|---|---|
| 2. Články | Celoobrazovkový náhľad a editor výrezu sú `next/dynamic`; grafika Facebook sa importuje až pri spustení generovania; náhľad sa ani nemountuje, kým nie je otvorený | Uloženie, status a rich-text kontrakt nezmenené |
| 3. Služby a plemená | V adresári sa crop, FB panel a breeder galéria načítajú až pri potrebe; galéria a FB zostávajú namontované po prvom otvorení, aby sa nestratili rozpracované úpravy; galéria plemien a DnD sú v samostatnom chunku | Parent editor stále vlastní skutočné dáta; immutable `moveAdminGalleryItem` nahrádza iba utility `arrayMove` |
| 4. Podujatia a mobil | Základný panel Google Maps sa načíta až pri prvej návšteve sekcie; druhý, samostatný adresný geo-fallback sa zapne **iba po kliknutí**. Foto crop a FB panel zostávajú lazy importy | Pri bežnom otvorení lokality sa už nespúšťa druhé geo GET čítanie; po zapnutí fallback zostáva namontovaný, takže sa nestratí rozpracované overenie. Žiadne automatické Google Places discovery |
| 5. D1 vyhľadávanie | Syntetický read-only SQLite benchmark teraz vykoná **skutočné generované SQL všetkých 8 kategórií** pre text, presné ID a tombstone filtering. Zaznamená pre každý dotaz `EXPLAIN QUERY PLAN`, lokálne p50/p95 a zachovanie výsledkov | Žiadna migrácia či zmena produkčného SQL, autentifikácie ani Notion dát; výsledky lokálneho SQLite nie sú produkčné D1 `rows_read` alebo reálny výkon iPhone |
| 6. Command palette | Číselné Admin ID preskočí 140 ms debounce; textové zostanú so debounce. Doplnil sa request-generation guard proti oneskoreným odpovediam, opakovanie chybového alebo neúplného vyhľadávania, ochrana proti nadlimitným rovnakým query a správne správanie pri odmietnutom odchode z rozpracovaného editora | AbortController a 15-sekundová obmedzená cache zostávajú; neúplné výsledky sa **neukladajú** do cache a zrušená navigácia ponechá dialóg otvorený |
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

## Doplnený audit kroku 5: osem skutočných dotazov

Syntetický benchmark `scripts/benchmark-admin-search-v2.mjs` používa
`searchAdminRecords()` z produkčného kódu a verný, ale úplne **in-memory**
SQL model ôsmich tabuliek. Pre každý režim vyhľadávania zachytí osem
pripravených/bindovaných SELECTov, ich query plány a lokálne časy:

- **Substring text:** porovná, kde sú v plánovači SQLite scan kroky a kde index.
- **Číselné Admin ID:** overí, že všetkých osem query plánov používa indexovaný lookup na `id`.
- **Tombstone:** overí, že odstránený profil je vylúčený len zo svojej kategórie, výsledky ostatných siedmich zostanú.
- **CI JSON artefakt:** workflow zbiera `admin-v2-search-plan.json` ako validný JSON (bez `npm run` banneru) a validuje počet kategórií a paritu výsledkov.

**Interpretácia:** `instr(lower(coalesce(...)))` neznamená automaticky, že každý
dotaz vždy prečíta celú tabuľku: plán závisí od zoradenia a indexov. `FTS5`
tokenové matchovanie sa nesmie slepo zameniť za pôvodné substring správanie
(čiastočné slová, diakritika, iné stĺpce). V tomto PR preto nerobíme FTS
migráciu; tá potrebuje samostatný návrh so zápismi/triggerom, backfillom,
porovnaním výsledkov a meraním skutočného D1 `rows_read`.

**Bezpečnostná hranica:** všetky merania sú lokálne, syntetické a bez spojenia
na Cloudflare D1, Notion alebo produkčné API.

## Doplnený krok 6: bezpečnejšie vyhľadávacie okno

Po kontrole pôvodného `AdminQuickNavigationDialog` sa opravili štyri skutočné
prípady, ktoré predchádzajúce časové optimalizácie neriešili:

1. **Staré odpovede:** každý efektívne odlišný dotaz zvyšuje generáciu. Odpoveď
   sa zobrazí iba ak `AbortController` nebol zrušený **a** generácia stále
   zodpovedá aktuálnemu dotazu. Rovnaká ochrana platí aj pre chybové hlásenia.
2. **Trvalé „Načítavam…“ pri viac než 80 znakoch:** pri pridaní znakov za
   backend limit sa aktuálna požiadavka neinvaliduje; jej výsledok sa môže
   korektne zobraziť.
3. **Nedostupný modul vyhľadávania:** pri `incomplete` sa výsledok nevkladá do
   in-memory cache; pri výpadku aj čiastočnom výsledku je k dispozícii
   manuálne `Skúsiť vyhľadávanie znova`. Reakcia nezamieňa výpadok zdroja
   za stav `nič sa nenašlo`.
4. **Neuložený editor:** pri veto udalosti odchodu zostáva vyhľadávací dialóg
   otvorený so zachovaným dotazom. Zatvorí sa až keď ochrana odchod povolí.

Regresný test `tests/admin-global-search-ui-step6.test.mjs` overuje súvisiace
source kontrakty a syntax JSX. Ide o statické a logické kontroly, nie o
zmerané p95 používateľskej odozvy na skutočnom iPhone. Žiadne zmeny
v D1 tabuľkách, vyhľadávacom SQL, prístupových oprávneniach alebo Notione.

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
