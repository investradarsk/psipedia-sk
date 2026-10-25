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
- [ ] **3:** Adresár a Služby: bezpečné aktualizácie obsahu/volieb, stabilná identita a ochrana potvrdených údajov. Vyriešiť historické konflikty cez identifikovateľné existujúce riadky bez hromadného prepísania.
- [ ] **4:** Podujatia a Pomoc psom: spoločné vykonávanie pre agendy `events`, `organizations`, `adoptions`, `help-cases`, `lost-found` s oddelenými doménovými hranicami.
- [ ] **5:** zjednotiť reportovanie „Posledný sync / Čaká / Chyba / Konflikt“ a dočasné zlyhania bez hádania o stave publikovania.
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
