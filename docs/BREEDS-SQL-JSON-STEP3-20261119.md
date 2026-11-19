# Plemená – krok 3/6: aditívna SQL schéma 0174 (predprodukčný návrh)

**Stav 19. 11. 2026:** SQL aj Drizzle typy sú pripravené v PR #1449, ale **NIE SÚ nasadené** do Cloudflare D1. **V tomto kroku nebol vykonaný žiadny zápis do produkcie.**

## Prečo je súbor iba v pending-migrations/

Migrácie musia tvoriť **súvislú číselnú postupnosť** (overuje `scripts/check-migration-safety.mjs`):

- `0171_partner_single_manager.sql` + `0172_partner_help_claim_ownership.sql` patria PR **#1437**.
- `0173_directory_structured_sql_foundation.sql` patrí PR **#1451**; zatiaľ je tiež v `pending-migrations/`.
- **0174** rezervujeme pre Plemená: `pending-migrations/0174_breeds_sql_json_foundation.sql`.

Keby sme vložili 0174 do `drizzle/` už teraz, CI by správne zlyhala na chýbajúcich 0171–0173. **Nevytvárať prázdne migrácie, neprečíslovať iných autorov, nespúšťať generic migration replay.** Po skutočnom zlúčení a fyzickej kontrole 0171–0173 pripraviť osobitný overený presun 0174 z `pending-migrations` do `drizzle`. Každá schema-only aplikácia bude manuálna, s preflightom, Time Travel obnovovacím bodom a postflightom.

## Presný obsah SQL 0174

### 7 nových nullable stĺpcov `managed_breeds`

`seo_title`, `seo_description`, `seo_focus_keyword`, `seo_canonical_url`, `seo_og_title`, `seo_og_description`: `TEXT NULL`.
`seo_noindex`: `INTEGER NULL CHECK (seo_noindex IN (0,1))`.

**Prečo NULL:** zatiaľ nie sú presunuté hodnoty. `NULL` = neskopírované, `''` = výslovne vymazaný text a `0` = explicitný indexovateľný obsah. Starý `seo_json` ostáva autoritou počas prípravy. Verejná canonical SQL podmienka a sitemap sa v kroku 3 nemenia.

### 4 nové SQL tabuľky (bez údajov)

| Tabuľka | Nové dátové polia | Účel |
| --- | ---: | --- |
| `breed_fci_standard` | 33 nullable TEXT | 31 FCI textov + PDF URL + nomenklatúra URL, zmeny jednotlivo |
| `breed_editorial_text` | 6 nullable TEXT | prehľad, starostlivosť o srsť, život v rodine, spolužitie so psami, zaujímavosti, chyby majiteľov |
| `breed_public_facts` | 6 nullable REAL + 3 nullable JSON TEXT | numerické rozsahy a tri nezávislé Notion multi-select zoznamy |
| `breed_related_breeds` | vzťah + poradie | nahradenie `related_breeds_json`, zachová poradie a 6 existujúcich vzťahov po budúcom prenose |

Všetky tabuľky majú FK na existujúce `managed_breeds.id` s `ON DELETE CASCADE`; kaskáda je iba bežná integrita väzby, migrácia nevymaže žiadny riadok.
`breed_related_breeds` odmieta duplicitný cieľ, duplicitnú pozíciu, samoväzbu, záporné poradie a neexistujúce ID.
Multi-select JSON stĺpce prijímajú iba platné JSON polia (arrays) alebo NULL; prázdny výber je `[]`, absentujúca hodnota `NULL`.

**Nepridávame** žiadnu duplicitnú tabuľku pre články ani služby: `breed_article_relations` a `breed_directory_relations` už existujú.
**Ponechávame** `gallery_json`, `sports_json`, `health_risks_json`, `good_for_json`, `consider_json`, `sources_json`.

## Drizzle modely

`db/breed-storage-schema.ts` zodpovedá štyrom novým tabuľkám. **Zámerne ešte nie je importovaný do `db/index.ts`, ani do aktívnej Drizzle schémy managedBreeds**: produkcia 0174 zatiaľ neexistuje. Predčasné rozšírenie `managedBreeds` o nové SEO kolónky by mohlo pri Drizzle `SELECT *` pokaziť existujúci web. Moduly sa aktivujú až po preukázateľnom nasadení 0174.

## Bezpečné poradie krokov 3–6

1. Najskôr úspešne dokončiť partner **0171–0172** a adresár **0173**; overiť D1 fyzickú schému aj ledger, nie iba zelenú kontrolu PR.
2. Rozhodnúť o čase produkčného nasadenia 0174. Pripraviť owner-only manuálny workflow s audit/apply, jednoznačným cieľovým D1 DB ID, pinned obsahom SQL, Time Travel bookmarkom a kontrolou existujúcich 347 plemien.
3. Aktivovať **iba schému** 0174; potvrdiť, že pôvodných 347 riadkov a JSON hodnoty ostali zachované a štyri nové tabuľky sú prázdne.
4. V krokoch 4–5 vykonať explicitné 344 ID preflight, backfill z Notionu a guarded per-field shadow writes; výslovná zmena jednotlivého poľa nesmie stratiť novší zápis.
5. Až po read/write parite zmeniť čítačov verejného webu, Admin a Notion a potom vymazať zrušené historické SQL JSON stĺpce v kroku 6.

## Testovanie (offline, bez Cloudflare kľúčov)

```sh
node --test tests/breed-sql-0174-foundation.test.mjs
node --test tests/breed-storage-decision.test.mjs
npm run db:check-migrations
```

SQLite fixture v teste má **347 existujúcich plemien** a reálne JSON výseky; overí zachovanie každého existujúceho poľa, všetkých 7 nullable SEO stĺpcov, 4 prázdne tabuľky, 33 FCI polí, 6 redakčných polí, 6 čísel, 3 JSON multi-selecty a FK/unikátnosť/prepojenia.

**Nepúšťaj `pending-migrations/0174_breeds_sql_json_foundation.sql` ručne do produkčnej Cloudflare Console pred vyriešením 0171–0173.**
