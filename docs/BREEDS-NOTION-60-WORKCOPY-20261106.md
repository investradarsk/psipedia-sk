# Plemená – 60-poľová pracovná kópia: výsledok a prechod (6. 11. 2026)

## Overený Notion stav
- Pôvodná produkčná databáza: `2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2`; 344 profilov, 109 polí.
- Nová pracovná databáza: `f460b1e5-4454-4a10-9200-3b35106f9e32`; 344 profilov, 60 obsahových a 2 technické polia.
- Pôvodná záloha `170793fc-1d18-8204-a6f9-87479609dca7` sa nemenila.
- Po prvotnom kopírovaní pôvodné odborné automatizácie ďalej aktualizovali produkciu: 56 dokončených v starej, 47 v pracovnej kópii.
- Dňa 6. 11. boli do pracovnej kópie prenesené novšie údaje v 12 plemenách: samostatné polia, zlúčené FCI/redakčné časti a novšie základné texty v zlúčených poliach.
- Záverečné porovnanie cez oba Notion databázové pohľady: **344/344 jedinečných Psipedia ID a FCI identít; 56/56 označení Editorial complete; 0 rozdielov v prístupných samostatných poliach; 0 rozdielov v základných častiach zlúčených polí a v 23 označených zdrojových častiach**. Overené aj odkazy na pôvodné stránky. Dátumy v historickom zdrojovom poli neboli dostupné v porovnávacom pohľade, preto je povinná ešte plná kontrola priamo cez API.

## Pripravená technická kontrola
- `scripts/notion-breed-workcopy-preflight.mjs` číta **výhradne** oba Notion data sources a porovnáva 344 profilov podľa `Psipedia ID`, názvu, FCI čísla a zdrojovej Notion URL.
- Rekonštruuje 60 obsahových polí z produkčných 109 podľa spoločnej mapy `lib/breed-notion-compact-consolidation.mjs`, vrátane 23 označených zlúčení.
- Kontroluje aj historické pole dátumu platnosti FCI štandardu a vypisuje počty obsadených nepresunutých prevádzkových a historických polí.
- Pri zistenej chybe, duplicite identity, zmene schémy alebo možnom skrátení Notion rich-textu skončí neúspešne; nezapisuje nič do Notionu, Adminu ani Cloudflare.
- Test: `node --test tests/notion-breed-workcopy-preflight.test.mjs`.
- Spustenie s existujúcim bezpečne uloženým tokenom: `NOTION_API_TOKEN=... node scripts/notion-breed-workcopy-preflight.mjs`.
- Výsledok preflightu je potvrdenie **dátovej parity**, nie povolenie na produkčné prepnutie.

## Produkčný cutover je stále ZABLOKOVANÝ
1. Existujúca aplikácia stále používa pôvodné `NOTION_BREEDS_DATA_SOURCE_ID` vo `wrangler.jsonc`.
2. V `breed_notion_sync` sú naviazané pôvodné Notion `page_id`. Nová kópia má odlišné stránky; jednoduchá zmena data source ID neumožní ich bezpečné párovanie.
3. Chýbajúce vlastnosti `Slug`, `Stav`, `Sync stav`, `Sync chyba`, `URL Psipedia`, súvisiace ID a vybrané SEO/OG polia používa synchronizátor na riadenie práce, publikovanie a spätné potvrdenia. Ich metadáta musia mať plnohodnotný domov v D1/Admin systéme.
4. FCI a redakčné údaje v 23 zlúčených textoch musia mať kompatibilný parser aj obojsmerný zápis bez duplikátov. Súčasná ochrana pred duplicitami bola napísaná pre pôvodnú 109-poľovú databázu.
5. Obe hodinové obsahové automatizácie musia byť presmerované koordinovane so syncom a overený ich prvý beh.
6. Až po D1/readback testoch, kontrolách obrázkov, URL, vzťahov, publikovania a rollback pláne sa môže starý data source odpojiť. Záloha nesmie byť vymazaná.

**Tento PR nesmie meniť produkčný data source ID, nevytvára D1 migráciu a nemení automatizácie.**

## Kontrola skutočných D1 identít (rozšírenie PR)
- Funkcia `lib/notion-breed-workcopy-identity-plan.mjs` porovná 344 pôvodných + 344 nových stránok s `managed_breeds` a súčasnými `breed_notion_sync` väzbami.
- Explicitne blokuje duplicitné ID, nesprávny zdrojový odkaz, zmenené FCI číslo, nesúlad `Slug` a prípad, keď má profil v D1 inú Notion stránku.
- Nový zabezpečený endpoint `GET /api/admin/notion-breeds-workcopy-preflight` len číta Notion + D1 a vracia počty a kódy blokátorov; nezaťažuje produkčný synchronizátor zápismi.
- Adresa novej pracovnej databázy je v samostatnej konfiguračnej premennej `NOTION_BREEDS_WORK_DATA_SOURCE_ID`. Pôvodná `NOTION_BREEDS_DATA_SOURCE_ID` zostala bez zmeny.
- Test `tests/notion-breed-workcopy-identity-plan.test.mjs`: **7/7 izolovaných testov**; kontrola úplného inventára, identity, FCI, historických väzieb a odmietnutia konfliktov.
- Kompletný živý D1 preflight je možné spustiť až po sprístupnení novej verzie v bezpečnom runtime. Testy so syntetickými záznamami **nie sú** dôkazom zhody produkčnej D1.

## Nová čítacia vrstva a bezpečný D1 shadow model (pokračovanie 6. 11.)
- Admin môže po nasadení bezpečnej prípravy spustiť **len GET** `/api/admin/notion-breeds-workcopy-preflight`. API vyžaduje prihlásenie cez Admin a porovná 344 pôvodných a 344 nových profilov s aktuálnou produkčnou D1 (ID, slug, FCI, staré Notion page ID a synchronizačné receipts). Hodnoty polí ani tokeny nevracia.
- Obsahovú paritu číta z rovnakého čistého modulu, ktorý používa samostatný Notion API skript; zároveň validuje formát 23 zlúčených sekcií. Toto nie je dôkaz produkčného výsledku, kým endpoint skutočne nie je zavolaný na pripojenej D1.
- `materializeBreedWorkCopyForRead` vytvorí virtuálny 109-poľový čítací pohľad, ale **nie** systémové stĺpce: `Slug` berie len z D1 po zhodnom Psipedia ID a FCI. `Stav`, `Sync stav`, publikovanie a ostatné admin metadáta nevyrába.
- `drizzle/0159_breed_notion_workcopy_links.sql` je výlučne **aditívna** tabuľka. Uchová pôvodné a nové Notion ID, identitu D1 a pôvodný sync receipt; existujúca tabuľka `breed_notion_sync` a zverejnené plemená zostávajú nezmenené. Zatiaľ neexistuje aktivačná operácia ani automatický D1 backfill.
- Doplnkové testy: 7/7 identity, 5/5 rollback shadow väzby, 3/3 čítací kompatibilný adapter; spolu s prvými 10 testami **25/25 izolovaných testov**. SQLite schéma bola otestovaná v lokálnej dočasnej databáze vrátane CHECK a UNIQUE obmedzení. Celé CI ani produkčné E2E doteraz nie je potvrdené.

## Bezpečný plánovač zápisu jedného zlúčeného poľa
- `lib/notion-breed-workcopy-field-patch.mjs` vie nahradiť iba základný text alebo iba jednu z 23 pomenovaných sekcií v príslušnom zlúčenom Notion poli.
- Ostatné pôvodné sekcie musia ostať rovnaké; pri duplicite nadpisu, nesprávnom poli, chybnom FCI dátume/URL alebo zmene kontrolovaného textu sa zápis odmietne.
- Výsledkom je **jeden pripravený Notion PATCH cell**, nie volanie API; žiadne produkčné zápisy ani prepnutie automatizácií sa ešte neuskutočnili.
- Doplnkové izolované testy `tests/notion-breed-workcopy-field-patch.test.mjs` prešli **8/8**. Celkový počet overených izolovaných testov pre túto pracovnú kópiu je **33/33**.

## Doplnené skutočné obojsmerné napojenie (6. 11. – ďalšia fáza)

- `lib/notion-breed-workcopy-sync.ts` obsahuje podmienený **Notion → Admin** prenos cez existujúce per-field plánovanie a bezpečné D1 ukladanie a **Admin → Notion** prenos iba jedného povoleného poľa pri každom zápise. Zmeny v poli FCI neprepíšu susedné sekcie.
- Starý aj nový režim sú explicitne vzájomne vylúčené: `NOTION_BREED_SYNC_ENABLED=true`, `NOTION_BREED_WORKCOPY_SYNC_ENABLED=false` znamená zachovať súčasnú produkciu. Súbežné zapnutie dvoch synchronizátorov vyvolá chybu a nové zápisy sa nevykonajú.
- Prepínanie je zapojené do plánovaného worker behu, do administrátorskej sync API trasy a do Admin → Notion writebacku. V novom režime sa produkčný stav publikovania uchováva v D1, pretože 60+2 databáza nemá `Stav`, `Sync stav` ani `URL Psipedia`.
- D1 zrkadlo používa výhradne novú `breed_notion_workcopy_links` tabuľku so stavom `ACTIVE` a vlastnými per-field receipty. Staré `breed_notion_sync` sa počas nového režimu nemení.
- `POST /api/admin/notion-breeds-workcopy-stage` vie **až po samostatnom zapnutí** `NOTION_BREED_WORKCOPY_STAGE_ENABLED` a explicitnom potvrdení uložiť 344 *SHADOW* väzieb. Neaktivuje ich ani nemení produkčné dáta. Opakovateľné SQL má identitné/CAS podmienky; iný Notion profil ani prepojenie neprepíše.
- Pred skutočnými zápismi musí byť **344/344 aktívnych väzieb** s per-field receiptmi. Každý Notion zápis číta aktuálnu revíziu a overuje cieľové pole opätovným čítaním; D1 zápisy používajú existujúcu CAS ochranu.
- Bežné odborné texty, hodnotenia, SEO titulky a zlúčené FCI časti sú pripravené. **Médiá, galérie, vzťahy, športy a agregované JSON polia zatiaľ nový engine neprepíše**, iba ich zachová a nechá na samostatný bezpečný adaptér. Nedokáže tak vyhlásiť úplnú parity každého z pôvodných 109 polí; zachovanie ostáva v D1.
- Dodatočné izolované testy: 7/7 pre mapovanie jednotlivých Admin polí na Notion PATCH, 6/6 pre runtime bezpečnostné kontrakty. SQL stagingu prešlo testom v dočasnej SQLite databáze (vloženie, idempotencia, odmietnutie cudzej väzby).
- **Produkcia neprešla na novú databázu.** Reálne volanie novej sync trasy proti 344 produkčným D1 záznamom, E2E a úplné CI ešte nie je potvrdené.
- Pred ostrým prepnutím: (1) zastaviť obe staré redakčné automatizácie, (2) prebehnúť kompletný preflight znova, (3) vytvoriť a overiť SHADOW väzby, (4) kontrolovane označiť všetkých 344 ako ACTIVE a zapnúť nový režim pri vypnutom starom, (5) overiť Notion ↔ Admin na jednom profile, (6) až potom zmeniť zadania automatizácií na nový data source. Pôvodnú Notion databázu ponechať ako zálohu.


## Pokračovanie: ochrana prázdnych hodnôt a atómová aktivácia (6. 11.)

- V novom 60-poľovom režime Notion → Admin **prázdny reťazec, iba whitespace, null ani prázdne pole [] nevymazávajú** existujúci hodnotný obsah v D1. Explicitné `false` alebo `0` ostávajú platnými hodnotami. Nedotknuté polia majú vlastný receipt, takže neskôr vyplnené údaje sa môžu preniesť.
- `lib/notion-breed-workcopy-activation-plan.mjs` validuje kompletnú sadu 344 SHADOW záznamov, pôvodné D1 receipt väzby, zhodné identity a revízie stránok novej databázy; neúplný alebo zmenený rad **odmietne**.
- Nový `POST /api/admin/notion-breeds-workcopy-activate` je **vypnutý** (`NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED=false`). Nie je volaný cronmi ani obyčajným mergom. Vyžaduje Admin autentifikáciu, výslovné potvrdenie, potvrdenie pozastavenia oboch redakčných automatizácií a oba synchronizátory vypnuté.
- Pri výslovne povolenej aktivácii vykoná znovu aktuálnu paritu Notion, kontrolu 344 profilov v D1 a kompatibilitu každého per-field receiptu. Samotné označenie 344 väzieb `ACTIVE` je **jediný atómový SQL UPDATE** podmienený úplnou zhodou pôvodných väzieb a receiptov, nie 14 nezávislých batchov. Nezapisuje do `managed_breeds`, pôvodného `breed_notion_sync` ani do Notionu.
- Aktivácia **sama nezapne nový synchronizátor a neprepne automatizácie**. Pred živým použitím treba potvrdiť nasadenie migrácie 0159, úplné produkčné D1 a Notion overenie, zabezpečiť pauzu oboch automatizácií, vypnúť oba crony, vytvoriť a overiť SHADOW, výslovne aktivovať ACTIVE, vykonať readback, potom zapnúť výhradne nový sync a presmerovať obe automatizácie.
- Ak sa živá validácia zlyhá, **neaktivovať ani nemergovať ako hotový cutover**. Pri návrate po skutočných zápisoch do novej databázy treba dáta najprv zosúladiť; starú databázu nemožno bez ďalších kontrol automaticky vyhlásiť za aktuálnu.

Izolované testy aktivácie sú registrované v `test:breed-concurrency`. Ich existenciu nemožno zamieňať za produkčný E2E test. Konfiguračný prepínač ostáva vypnutý.

- Doplnené sú aj nezávislé 60-poľové zoznamové bunky **Zdravotné riziká**, **Vhodné pre**, **Zvážiť** a **Zdroje**; Admin → Notion používa rovnaké oddelenie položiek bodkočiarkou ako existujúci parser, pri neplatnej hodnote alebo starej baseline zápis zastaví. Obrázky a vzťahy sa nemenia.
