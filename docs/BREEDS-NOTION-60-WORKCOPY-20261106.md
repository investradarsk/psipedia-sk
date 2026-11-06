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
