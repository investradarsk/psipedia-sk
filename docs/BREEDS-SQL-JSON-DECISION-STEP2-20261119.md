# Plemená – krok 2/6: záväzné rozdelenie SQL, JSON a väzieb

**Stav:** rozhodnutie / návrh D1 modelu, bez produkčnej migrácie.
**Zdroj pravdy:** aktuálne `db/schema.ts`, `lib/breed-store.ts`, `lib/breed-canonical.ts`, `lib/notion-breed-workcopy-field-sql.mjs`, `lib/breed-notion-workcopy-field-contract.mjs`, produkčné read-only merania D1 (19. 11. 2026).
**Strojovo kontrolovaná mapa 90 Notion polí:** `lib/breed-storage-decision.mjs`.
**Testy:** `tests/breed-storage-decision.test.mjs`.

## Pravidlo

Cloudflare **D1** je jediná produkčná databáza plemien. Typ ukladania rozhoduje o spôsobe:
1. **SQL scalar** = samostatne editovateľná, filtrovaná, identifikačná alebo indexačná hodnota.
2. **JSON v D1** = jeden malý zoznam, ktorý sa upravuje atomicky ako jedno pole, alebo multi-select bez potreby SQL väzieb. JSON nie je druhá databáza.
3. **SQL relačná tabuľka** = vzťah medzi dvoma existujúcimi entitami s garantovanými ID.
4. **Mediálne súbory** = mimo D1 (R2 alebo aktuálne podporované mediálne úložisko); D1 má iba kľúč/URL.

## Rozhodnutie pre dnešných 10 JSON stĺpcov `managed_breeds`

| Aktuálne pole | Produkčné meranie | Finálne miesto | Kedy starý stĺpec odstrániť |
|---|---:|---|---|
| `gallery_json` | 0 galériových prvkov | **zachovať JSON v D1** | **neodstraňovať**: Admin/editor aj verejný UI galériu stále podporujú |
| `sports_json` | 333 športových prvkov u 52 plemien | **zachovať JSON v D1** | **neodstraňovať** |
| `health_risks_json` | 706 prvkov u 343 plemien | **zachovať JSON v D1** | **neodstraňovať** |
| `good_for_json` | 657 prvkov u 347 plemien | **zachovať JSON v D1** | **neodstraňovať** |
| `consider_json` | 633 prvkov u 347 plemien | **zachovať JSON v D1** | **neodstraňovať** |
| `sources_json` | 25 prvkov u 11 plemien | **zachovať JSON v D1** | **neodstraňovať** |
| `related_breeds_json` | 6 vzťahov u 2 plemien | **nová `breed_related_breeds` SQL tabuľka** | až po prenose a parite všetkých 6 väzieb |
| `fci_standard_json` | 343 neprázdnych objektov | **nová `breed_fci_standard` SQL 1:1 tabuľka** | až po prenose 31 textových + 2 URL/PDF kľúčov a cutovere |
| `editorial_json` | 344 neprázdnych objektov | **nová `breed_editorial_text` SQL 1:1 tabuľka** | až po prenose šiestich používaných redakčných polí a overení starých tipov/heroTraits |
| `seo_json` | 343 neprázdnych objektov | **8 SQL stĺpcov na `managed_breeds`** | až po zmene SQL canonical/noindex eligibility, sitemap a SEO editora |

**Záver: 6 JSON ponechať; 3 JSON objekty zmeniť na SQL; 1 JSON pole zmeniť na SQL väzby.**

## Navrhované fyzické tabuľky a pravidlá pre public/Admin

### `managed_breeds` – existujúca jadrová SQL tabuľka

Ponechať identitu (`id`, `slug`, `import_key`, `fci_number`), publikovanie (`status`, `published_at`), FCI skupinu a sekciu (`fci_group`, `fci_section_number`), názov, obrázok, public texty `intro`, `character`, `history`, `needs`, `exercise`, `training`, `health`, hodnotenia 1–5 a súčasné filtrované hodnoty. 
Nové SQL SEO polia: `seo_title`, `seo_description`, `seo_focus_keyword`, `seo_canonical_url`, `seo_og_title`, `seo_og_description`, `seo_og_image`, `seo_noindex` (INTEGER 0/1; osobitne `noindex` a canonical nesmú na chybnom importe zmeniť indexovateľnosť).

`search_text` je **odvodený index**, nie nezávislý redakčný zdroj. Niektoré existujúce textové fallbacky (`origin`, `height`, `weight`, `lifespan`, `fci_section`) treba ponechať do auditu public parity; nekopírovať nové kontrolované hodnoty duplicitne do starých a nových permanentných stĺpcov.

### `breed_fci_standard` – nová SQL tabuľka 1:1

Jeden riadok na plemeno (`breed_id` unikátne, FK). Samostatný SQL TEXT stĺpec pre všetkých **31 podporovaných kľúčov FCI textu** + `fci_nomenklatura_url` a `fci_standard_pdf`. Dôležitý dôvod: 33 editovateľných položiek verejného FCI štandardu sa mení v Notione nezávisle a viacstupňové JSON patche by komplikovali spätné párovanie a diagnostiku.

### `breed_editorial_text` – nová SQL tabuľka 1:1

`overview`, `coat_care`, `family_life`, `other_dogs_life`, `curiosities`, `common_owner_mistakes`. Existujúce obsahové scalar `intro`, `needs`, `history`, `exercise`, `training`, `health`, `character` ostávajú v `managed_breeds`, aby nevznikli dve autority. 
Starých päť doplnkov `heroTraits` + `exerciseTip`, `trainingTip`, `healthTip`, `coatTip` vyžaduje pred odstránením čitateľský audit; nie sú novými canonical public poľami.

### `breed_public_facts` – nová SQL tabuľka 1:1

Šesť samostatných SQL čísel: `height_min_cm`, `height_max_cm`, `weight_min_kg`, `weight_max_kg`, `lifespan_min_years`, `lifespan_max_years`.
Tri samostatné JSON **stĺpce v tej istej SQL tabuľke**: `origin_countries_json`, `coat_types_json`, `use_types_json` — každý je jedno Notion multi-select pole.
Aktuálne Notion selecty `FCI skupina`, `FCI sekcia`, `Veľkosť` nesmú vytvoriť druhú kanonickú kópiu v `values_json`; už majú existujúci SQL cieľ `managed_breeds.fci_group`, `managed_breeds.fci_section_number`, `managed_breeds.size`.

### SQL relačné tabuľky

**Nová `breed_related_breeds`** s `breed_id`, `related_breed_id`, `position` prenesie dnešných 6 vzťahov; bez straty poradia a bez samoväzieb. 
**Existujúce `breed_article_relations` a `breed_directory_relations` ponechať** — nesmie vzniknúť ďalší JSON ani duplicitná tabuľka pre tie isté odkazy.

### Notion – 90 fyzických polí

Strojová mapa priraďuje každej z 90 Notion vlastností jeden cieľ:
- **73 SQL** položiek (existujúce aj navrhnuté nové stĺpce),
- **9 JSON** položiek (výhradne JSON stĺpce v D1),
- **8 Notion-only** (7 explicitne historických opisov + jeden technický zdrojový odkaz; nevytvárať z nich duplicity v D1).

Technické `Psipedia ID` a `URL profil / slug` sú mapované na existujúce identitné stĺpce, **nie sú však oprávnením meniť identitu cez ľubovoľný webhook**. Každý zápis musí preveriť vlastníctvo Notion stránky a identitu Psipedia ID. 
Štruktúrovaný JSON text vo fyzickej vlastnosti Notion (`Ďalšie fotografie`, `Športy a aktivity`) je **vstupný formát jednej bunky**, nie ďalšia produkčná databáza.

## Súbežné zmeny, last-write-wins a bezpečnosť

- Aktualizácie sa aplikujú podľa **konkrétne zmeneného poľa**, nie plošným resave 90 polí. Novšia overená zmena má prioritu podľa per-field verzie/času – nie podľa globálneho `updated_at` celej stránky.
- Notion chýbajúca property **nie je prázdna hodnota** a nesmie zmazať D1; vedomé vymazanie explicitne zmenenej property môže vymazať len danú hodnotu.
- Každý JSON zoznam sa aktualizuje samostatne s revíziou / CAS. JSON prechodne iba `json_set` konkrétnej cesty.
- Evidencia posledného Notion potvrdenia, retry a revízie je **sync metadáta**, nie druhý hlavný public zdroj údajov.
- Pri prechode `breed_notion_controlled_values.values_json` nesmie zostať trvalým druhým zdrojom tých istých 12 hodnôt; prepis čítačov a synchronizačného enginu je súčasť krokov 4 a 6.
- D1 má **347** riadkov; jednorazové mapovanie Notion sa plánuje pre **344**. Extra 3 riadky sa nesmú automaticky vymazať ani zmazať cez upsert.
- Produkčný cutover: pridať schému; overiť 344 identity / 347 riadkov; preview a idempotentný backfill; **zabezpečiť synchronizované shadow writes pred prečítaním nového SQL**; porovnať všetky dáta; spoločne prepnúť public aj Admin/Notion; overiť a spracovať pending aktualizácie; až potom zrušiť historické stĺpce / fallbacky.

## Upozornenie na stav

**Toto je návrh, nie realizovaná D1 schéma.** `breed_fci_standard`, `breed_editorial_text`, `breed_public_facts`, `breed_related_breeds` a nové `seo_*` stĺpce ešte nemusia existovať; implementujú sa v kroku 3. 
Aktuálny web/Admin stále číta historické JSON polia. **V kroku 2 nič nemažeme, nenasadzujeme ani nespúšťame Notion import.**

### Kontrolné testy

```sh
node --test tests/breed-storage-decision.test.mjs
node --test tests/breed-json-legacy-audit.test.mjs
```
