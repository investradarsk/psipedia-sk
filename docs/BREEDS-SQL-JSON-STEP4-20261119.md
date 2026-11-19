# Plemená – krok 4/6: prepojenie Admin ↔ D1 ↔ Notion ↔ verejný detail (staging)

**19. 11. 2026 — staging/preflight, NIE produkčný SQL cutover.**
Cieľ: jeden typovaný adaptér pre 90-field model, bezpečné paralelné overovanie SQL, a bez zmeny dnešných čítačov/zapisovačov do ukončenia migrácie 0174 a dátového backfillu.

## Čo je už v kóde

### 1. Typované smerovanie zapisovaných polí
`lib/breed-sql-v2-bridge.mjs` definuje **jednu mapu** pre:
- `fciStandard.<kľúč>` → 33 individuálnych TEXT stĺpcov `breed_fci_standard`.
- `editorial.overview`, `coatCare`, `familyLife`, `otherDogsLife`, `curiosities`, `commonOwnerMistakes` → 6 SQL stĺpcov `breed_editorial_text`.
- `seo.title`, `description`, `focusKeyword`, `canonicalUrl`, `ogTitle`, `ogDescription`, `noindex` → 8 SQL stĺpcov `managed_breeds`.
- `controlled.*` (12 typed Notion properties) → zodpovedajúce SQL scalar a tri JSON array stĺpce v `breed_public_facts`, pri FCI skupine/sekcii a veľkosti použijeme pôvodný SQL canonical stĺpec.
- `healthRisks`, `goodFor`, `consider`, `sources`, `gallery`, `sports` → pôvodný JSON stĺpec ako **jeden atómovo upravovaný zoznam**.
- `relatedBreedIds` → budúca SQL relácia s zachovaným poradím.

Plánovač **neprijíma voľné SQL názvy**, odmieta neplatný typ a **nevykonáva UPDATE, INSERT ani DELETE**. Každé nezmapované historické alebo štruktúrne pole sa odmietne mapovať na domyslený stĺpec. Plán musí byť neskôr vykonaný spolu s korešpondujúcou pôvodnou zmenou a per-field CAS/LWW v jednej DB transakcii; nikdy nie ako samostatný „best-effort“ duplicitný zápis.

### 2. Verejný profil a Admin čítajú cez spoločnú bezpečnú bránu
`lib/breed-store.ts` používa `compareBreedSqlV2Detail` pri `getPublishedBreed` aj `getManagedBreed`.
`lib/breed-sql-v2-preview.ts` obsahuje iba 4 **read-only SELECT**:
- `breed_fci_standard` podľa `breed_id`,
- `breed_editorial_text` podľa `breed_id`,
- 8 nových `seo_*` stĺpcov v `managed_breeds`,
- `breed_related_breeds` podľa `breed_id` v poradí.

Funguje **výhradne keď** `BREED_SQL_V2_COMPARE_MODE=compare` a tabulky fyzicky existujú. Inak sa nevykoná žiadna SQL požiadavka do nových tabuliek. Vrátené výsledky verejného webu aj Adminu sú *stále 100 % pôvodné*. SQL hodnoty sa zatiaľ iba porovnávajú s aktívnym JSON, a logy obsahujú iba počty nesúladov, nie texty alebo SEO údaje.

**Dôležité:** V kroku 4 **nepridávaj túto env premennú do Cloudflare**. Pri prázdnych SQL tabuľkách by logy iba hlásili nezaimportované riadky. Je určená na kontrolu po kroku 5.

### 3. Notion aj Admin používajú rovnaký plán zapisovaného poľa
`lib/notion-breed-workcopy-direct-field.ts` je existujúci bezpečný per-field zapisovač používaný z Notionu aj Admin API. Diagnosticky sa pripája k `summarizeBreedSqlV2Write`; plán vykoná **iba v pamäti, po mene poľa, bez druhého SQL UPDATE**. 
Kým nemáme per-field synchronizovaný import, zostáva aktuálny Notion/SQL JSON zápis a všetky CAS/receipts bez zmeny.

Číselné a multi-select Notion hodnoty sa zatiaľ ukladajú do súčasnej `breed_notion_controlled_values` sidecar tabuľky. Ich fyzické presmerovanie, spracovanie pending sync a odstránenie dvojitej autority patria do **kroku 5–6**.

## Čo sa úmyselne EŠTE neprepína

- Admin editor ani API **nezapisujú do prázdnej v2 SQL schémy**.
- Verejný profil, atlas, porovnávač, FCI podstránky, sitemap a SEO canonical SQL **nezávisia od 0174**.
- Migrácie 0171/0172 (partner) a 0173 (adresár) ešte majú otvorené PR. Naša 0174 ostáva v `pending-migrations/`.
- Synchronizácia Notion nesmie používať paralelné master hodnoty, kým sa neoverí presun všetkých 344 aktívnych Notion identít a 347 D1 riadkov.
- Žiadny starý JSON stĺpec sa nevymazáva a do produkčnej Cloudflare D1 sa neodosiela SQL.

## Krok 5 – presun a aktivácia

1. V správnom poradí dokončiť 0171–0173, potom manuálne a kontrolovane aplikovať schema-only 0174.
2. Read-only porovnať všetkých 347 D1 záznamov s 344 ACTIVE Notion odkazmi; vysvetliť rozdiel 3 záznamov.
3. Pripraviť idempotentný per-field presun zo starých JSON a Notion sidecar do nových SQL stĺpcov s preflightom NULL/explicitné prázdne a ochranou novších úprav.
4. Zaviesť atomické shadow writes do old + new, oddeliť receipts od canonical údajov, overiť parity aj pri súbežných zmenách.
5. Až potom atomicky prepnúť Admin, Notion a public reader (vrátane sitemap/SEO, atlasu, FCI), s okamžitým plánom rollback.
6. Testovať web, Notion ↔ Admin/D1 po jednotlivých poliach; staré polia vymazať až v kroku 6.

## Overenie tohto kroku

```sh
node --test tests/breed-sql-v2-bridge.test.mjs
node --test tests/breed-storage-decision.test.mjs
node --test tests/breed-sql-0174-foundation.test.mjs
npm run db:check-migrations
```

**Stav:** vrstva prepojenia aj bezpečné read-only brány sú pripravené a testované offline; nie je povolený žiadny nový produkčný SQL writer ani v2 public read režim.
