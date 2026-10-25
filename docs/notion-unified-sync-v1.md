# NOTION-UNIFIED-SYNC-V1 — postupné zjednotenie bez nových migrácií

**Stav:** rozpracovaný Draft PR; postupné commity sa pridávajú do toho istého PR.  
**Rozsah:** existujúce prepojenia Notion ↔ Psipedia pre Adresár (Služby pre psov), Podujatia, Pomoc psom a v ďalších fázach ostatné agendy.  
**Bez produkčných zásahov:** neaplikovať D1 migrácie, nevytvárať nové Notion databázy, nemeniť Cloudflare flagy, nerobiť automatický merge/deploy.

## Pravidlá, ktoré musia zostať zachované

- D1/Psipedia Admin vlastní kanonické ID, schvaľovanie, publikovanie, moderáciu, potvrdené Google miesto a súkromné kontakty; Notion môže upravovať iba explicitne povolené obsahové polia.
- Znovu použiť existujúce Notion data-source ID a väzby `directory_notion_sync`, `event_notion_sync`, `notion_agenda_sync`, `service_catalog_notion_auto_attempts` a existujúce hash/lease/receipt mechanizmy. Každá fáza má najskôr overiť, že príslušná produkčná schéma je reálne nasadená.
- Žiadne mazanie, vytváranie nových kanonických ID ani publikovanie len preto, že sa zmenilo pole v Notione. Výnimky ako už autorizované obsahové importy musia zostať výslovne podchytené svojím doménovým kontraktom.
- Pri zhodnom obsahu nič nezapisovať. Pri bezpečne overenej jednostrannej zmene synchronizovať; pri konfliktnej identite, súbežnej zmene toho istého poľa či chýbajúcom dôveryhodnom baseline neprepísať bez potvrdenia.
- Facebook obrázky ponechať funkčné vrátane explicitného schvaľovania a ochrany proti dvojitému publikovaniu. Preberať ich dobré mechanizmy (stav, verziovanie, idempotencia, zrkadlenie) — nie ich pravidlá publikovania do iných domén.
- Použiť jeden existujúci Cloudflare Worker, nie ďalší cron, ďalšie databázy ani paralelné synchronizátory pre rovnaký kanonický záznam.

## Checklist (jeden spoločný PR)

- [x] **1A:** hodinové zrkadlenie katalógu Služby V3 presmerované na existujúci D1-first `runServicesV3CatalogAutoSweep` namiesto chybného `runSimpleServiceCatalogSync` volania. Zachovať vstupný kontrakt `{db, bindings, now}`, DRAFT/PENDING, CAS, claim a karanténu neoverených zápisov. Bez nového D1 SQL.
- [x] **1B:** doplnený regresný test pre konkrétne cron zapojenie a zákaz návratu k paralelnému jednoduchému importéru v scheduled Workeri.
- [x] **2A:** vykonaný audit existujúcich hourly/five-minute tokov; ponechaný jediný existujúci Worker bez nových cronov a bez duplikovania event sync pri bidirectional režime.
- [x] **2B:** spoločný bezstratový read-only log `notion_sync_health` pre Služby V3, Adresár, Podujatia/Pomoc psom a Facebook obrázky. Výstup rozlišuje `DISABLED`, `BLOCKED`, `IDLE`, `SYNCED`, `PARTIAL`, `CONFLICT`, `ERROR`; bez úniku obsahu alebo tokenov.
- [ ] **2C:** pokračovať zjednotením per-agenda diagnostiky a administrátorského prehľadu, bez zmeny doménovej publikačnej logiky.
- [x] **3A:** každé prepojené ID Adresára sa v jednom hodinovom behu reconciliuje najviac raz; fast-path bez zosúladenia naďalej povoľuje export zmenených kanonických údajov D1. Moved/archived/trashed Notion stránka nie je platný cieľ PATCH.
- [x] **3B-1:** identická chyba Adresára sa znovu nepatchuje (rovnaký záznam konfliktu zostáva viditeľný); D1-vetva znovu využíva už načítanú Notion stránku, bez ďalších HTTP GET.
- [ ] **3B-2:** manuálne rozlíšenie skutočne rozdielnych historických obsahových konfliktov po read-only preflight, bez hádania víťaza a bez hromadného prepísania.
- [x] **4A:** zjednotená idempotentná konfliktná diagnostika v Events/Help: už zapísaná identická chyba sa znovu nepatchuje, takže sa nemení `last_edited_time`; existujúce doménové hranice zostávajú zachované.
- [x] **4B-1:** spoločná kontrola vlastníctva Notion stránky v Adresári aj Events/Help. Žiadny obsahový ani diagnostický PATCH alebo Notion→D1 import presunutej, archivovanej alebo trashed stránky. Platí pre všetkých päť Events/Help agend a cielené ensure Podujatia, bez migrácie.
- [ ] **4B-2:** zostávajúce regresné a integračné overenie všetkých Events/Help agend (konflikty, súbeh, súkromné údaje, schvaľovanie).
- [x] **5A:** spoločný read-only prehľad ôsmich oblastí na existujúcej admin stránke Notion auditu, založený na D1 evidencii bez Notion API dopytov.
- [ ] **5B:** živý stav posledných behov (úspech, chyba, čaká, konflikt) až po zavedení dôveryhodných run receipts; neodvodzovať ho zo starých mapovaní.
- [ ] **6:** integračné testy Admin → D1 → Notion a povolených Notion → D1 zmien pre každú agendu, vrátane opakovania, súbehu, chybných ID a nedostupného Notion API.
- [ ] **7:** read-only produkčné preverenie schém, prepojení, povolení a nasadených flagov; následný rollout len po explicitnom schválení používateľa.

## Fáza 1 — presná zmena

Pôvodné volanie `runSimpleServiceCatalogSync({db, bindings, now})` nepasovalo na podpis `{db, env, now}` a nepoužívalo už pripravený D1-first `runServicesV3CatalogAutoSweep`. Oprava zapája existujúci overený runner, ktorý prevádza **najviac jednu dynamickú DRAFT/PENDING položku na hodinový tick** a nikdy nevytvára ACTIVE záznam ani kanonické ID z cudzieho Notion konceptu. Používa existujúci journal 0139, takže nový migration súbor netreba. Ak produkčný journal chýba, funkcia bezpečne skončí `BLOCKED`.

Táto fáza nemení Notion schému, Facebook obrázky, správanie synchronizátorov profilov ani administráciu. Pred merge treba vykonať cieľové testy a skontrolovať najnovší CI stav; samotné zelené CI nie je povolením nasadenia.

## Fáza 2 — spoločná diagnostika existujúcich synchronizátorov

Zavedený `lib/notion-sync-health.ts` normalizuje iba výsledky už vykonaných operácií. Nový `event: "notion_sync_health"` zahŕňa identifikátor agendy, stav, počty skontrolovaných, nových, upravených záznamov, konfliktov a chýb. Neposiela obsah záznamov, URL obrázkov, tokeny ani Notion page ID.

- `CONFLICT` neznamená zlyhanie synchronizátora. Neriešiteľnú kolíziu ponechá doménovému mechanizmu na manuálnu revíziu.
- `BLOCKED` znamená nesplnené podmienky alebo nepripravenú schému, nie úspešný beh.
- `IDLE` znamená vykonaný beh bez zmien; `DISABLED` znamená vypnutú agendu.
- Existujúce log eventy zostávajú zachované kvôli spätnej kompatibilite. Normalizované logy nespúšťajú žiadnu ďalšiu synchronizáciu, cron ani D1 zápis.
- Pri events-help so zapnutým bidirectional režimom zostáva legacy event synchronizátor vypnutý; nevznikajú dva paralelné zapisovače.
- Automatické zobrazenie jednotných stavov priamo v admin rozhraní je samostatná nasledujúca časť, nie tvrdenie o hotovej UI funkcii.

Regresný test: `node --experimental-strip-types --test tests/notion-sync-health.test.mjs`. Zahrnutý aj v `npm run test:notion-events-help-sync`, takže bude súčasťou existujúceho testovacieho workflow bez samostatného runnera.

## Fáza 3A — identita a predchádzanie duplicitnému spracovaniu Adresára

- `notionDirectoryPageBelongsToSource` je čistá ochranná funkcia nad Notion `parent.type/data_source_id`, `archived` a `in_trash`. Porovnáva konfigurovanú databázu po normalizácii UUID. Nesprávny cieľ sa odmietne pred zápisom do D1/Notion, nie automaticky „opravený“ presunom či založením nového profilu.
- Dve existujúce hodinové vetvy (`recentNotionPages` a `changedProfileIds`) môžu zachytiť rovnaký profil. `attemptedMappedProfileIds` zaisťuje maximálne jeden skutočný reconcile pokus na ID za beh, vrátane opakovaných konfliktov a čiastočných zlyhaní.
- Rýchly skip podľa nezmeneného Notion snapshotu zámerne nepridáva ID do tejto množiny: kanonický D1 edit sa aj vtedy musí môcť dostať cez druhú vetvu. Ak niekto zmení D1 súbežne až po pokuse, zmena zostáva na ďalšie existujúce cron spustenie, neprepisuje sa naslepo.
- Nezmenené: canonical identity, potvrdené Google miesto, Notion stavy schvaľovania, príprava obrázkov, Services V3 choices, Facebook publisher, feature flagy, počet cronov, D1 schéma.
- Regresie sú v existujúcom `tests/notion-directory-sync.test.mjs`.

### Bezpečnostné doplnenie fázy 3A

Pri nesúhlase identity Notion stránky alebo pri presune z kanonického data source vznikne typovaná chyba `NotionDirectoryUnsafeTargetError`. Obe catch vetvy stále započítajú zlyhanie do diagnostiky, ale **neposielajú ani diagnostický PATCH** `Sync stav / Sync chyba` na neoverenú Notion stránku. Dáta zostávajú nedotknuté a existujúce D1 mapovanie sa nemení. Test kontroluje obe cesty.

## CI regresná oprava — izolované VM integračné testy

Doplnený reálny `notionDirectoryPageBelongsToSource` a `NotionDirectoryUnsafeTargetError` do existujúcich VM fixture kontextov `tests/notion-directory-apply-sql-r2-integration.test.mjs` a `tests/gemini-canonical-publish-handoff.test.mjs`. Skúšobné Notion stránky majú validné `parent.type` a `parent.data_source_id`; produkčná ochrana sa teda testuje, neobchádza. Regresie v predchádzajúcom SHA boli spôsobené tým, že výňatok funkcie bol spustený bez jeho importov.

## Fáza 4A — idempotentná diagnostika konfliktov Events/Help

Opakovanie tej istej detegovanej chyby `BASELINE_UNAVAILABLE` alebo identity konfliktu už nezapisuje nezmenené `Sync chyba`/`Sync stav`/`Posledný sync` do Notionu pri každom hodinovom behu. `markConflict` používa údaje o stránke už získané v danej dávke, nezavádza nové API čítania. Ak sa chyba zmení alebo stav prestane byť `Chyba`, aktualizácia sa vykoná ako doteraz. Konflikt sa stále počíta a posiela na kontrolu; oba obsahové systémy zostávajú nedotknuté a nedochádza k automatickému výberu víťaza. Nové testy sú v existujúcom `notion-data-quality-recovery.test.mjs`.

## Fáza 3B-1 — stabilné stavy chýb Adresára

Pri identickom `Sync stav=Chyba` a `Sync chyba` sa nevykoná opakovaný diagnostický PATCH. Nemení sa posledná Notion revízia, takže následná hodinová synchronizácia nedostáva umelé zmeny iba kvôli vlastnému chybovému hláseniu. Kontrola funguje v smere nedávno editovaných stránok aj v smere D1 zmien; druhá vetva odovzdáva už načítaný snapshot namiesto ďalšieho GET. Ak sa chyba zmení, PATCH sa vykoná. Historické konflikty s **odlišnými** hodnotami zostávajú blokované na manuálne overenie; systém nevyberá víťaza podľa času úpravy.

## Fáza 4B-1 — spoločná ochrana vlastníctva Notion stránok

Čistý a bezdatabázový helper `lib/notion-sync-page-ownership.ts` vyhodnocuje `parent.type`, `parent.data_source_id`, `archived` a `in_trash`; chýbajúci kontext je neplatný. Adresár zachováva svoju existujúcu API funkciu ako kompatibilný wrapper nad tým istým helperom. Events/Help filtruje výsledky kanonického datasource pred vytvorením `identities` a `pagesById`, pred mapovaním, Notion→D1 importom a všetkými page PATCH (vrátane konfliktnej diagnostiky). Nepriradené stránky sa vykážu iba v read-only review queue. Rovnaký guard používa cielené `ensureManagedEventInNotion`.

Tento krok nikdy nemigruje, nemaže, nepresúva ani neprepája Notion záznamy, neinterpretuje textový názov ako identitu a nemení Gemini schvaľovanie. Nové regresie používajú reálne Notion parent shape a sú súčasťou existujúceho `tests/notion-events-help-bidirectional.test.mjs`.

## CI kompatibilita so súčasným main (bez zmeny Notion správania)

Široký workflow `Playwright E2E and production smoke` zlyhal v `tests/directory-read-facets.test.mjs` na vzájomne protichodnom očakávaní: test vyžadoval `readNonemptyD1Page(total, () => listStatement.all())` **aj** staré priame `await listStatement.all()` pri verejnom Adresári. S predpokladaným guardom priamy await neexistuje. Použitý presne aktuálny výkonový kód z `main` (vrátane jeho existujúceho read helpera) a opravené očakávanie v teste tak, aby vyžadovalo lazy page read a zakazovalo jeho obídenie. Nezavádza sa žiadna iná implementácia, produkčné dáta, D1 migrácia ani zmena Notion práv.

## Fáza 5A – evidencia prepojení v administrácii

Do existujúcej cesty `/admin/nastroje/notion-audit` pribudol kompaktný prehľad pre Adresár, Podujatia, Organizácie, Adopcie, Pomoc psom, Stratené a nájdené, Katalóg Služby V3 a Facebook obrázky. Opätovne používa vizuálne triedy existujúceho auditu, nevytvára ďalšiu administrátorskú sekciu.

Endpoint `GET /api/admin/notion-sync-overview` používa existujúce admin oprávnenie, cache `no-store` a nanajvýš deväť read-only D1 SELECT dotazov. Neposiela Notion tokeny, obsah ani jednotlivé identifikátory profilov; vôbec nekontaktuje Notion. Vyhodnocuje počet mapovaní a posledný zaznamenaný čas podľa existujúcich tabuliek. Katalóg V3 má inú metriku – dokončené overené automatické pokusy. Facebook má počet prepojených obrázkov, **bez falošného času synchronizácie**. Chýbajúca D1 schéma či chybný dotaz sa zobrazí ako neznáme, nie úspešné.

Živú dostupnosť Notionu, úspešnosť schedulerov, čakajúce zmeny ani aktuálne obsahové konflikty tieto metadáta nedokazujú. Na to zostáva ďalšia fáza 5B. Nová UI vrstva potrebuje pred merge screenshoty presne z hlavy PR: desktop 1440 px a mobil 390 px; `VISUAL_REVIEW_ROUTES: /admin/nastroje/notion-audit`.

Test `tests/notion-sync-overview.test.mjs` beží v existujúcom `test:notion-events-help-sync`.