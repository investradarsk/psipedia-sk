## Aktualizácia 0174 po fyzickom potvrdení 0173

Produkčný 0173 apply je potvrdený v [run 44604743812](https://github.com/investradarsk/psipedia-sk/actions/runs/44604743812). SQL 0174 je preto v tomto PR presunuté z `pending-migrations/` do `drizzle/0174_breeds_sql_json_foundation.sql`, bez duplikátneho súboru. Samotná schéma sa ešte **nespustila**. Po merge PR je potrebné použiť len samostatný owner-only workflow **Production D1 Breeds 0174**: `audit` bez zápisu, následne pri úspechu `apply` iba na túto schému. Generic `migrations apply` je zakázaný pre neistý historický backlog.

## Overenie poradia migrácií – 0173 úspešne nasadená (19. 11. 2026)

GitHub Actions owner-only `production-d1-directory-0173.yml` [run #44604743812](https://github.com/investradarsk/psipedia-sk/actions/runs/44604743812) má **success** a v produkčnom logu `{"status":"POSTFLIGHT","mode":"apply","installed":true,"applied":true,"error":null}`. Súbor `drizzle/0173_directory_structured_sql_foundation.sql` je v `main`.

**Dôležitá vetva:** PR #1449 vznikol pred merge 0173 a stále nemá 0173 vo vlastnom `drizzle/` strome (vetva je oproti `main` pozadu). Preto zatiaľ ponechať 0174 v `pending-migrations/`; po synchronizácii PR vetvy s `main` treba presunúť schému 0174 do chronologického `drizzle/` poradovníka, aktualizovať offline testy a vytvoriť izolovaný owner-only audit/apply 0174. **Žiadny generický replay migrácií ani ručné vykonanie 0174 teraz.** Doterajší import 344 kontrolovaných Notion zrkadiel nie je import do tabuliek 0174.

# Psipedia Plemená – 6/6: bezpečný SQL/JSON cutover (PRIPRAVENÉ, NIE ZAPNUTÉ)

**Dátum:** 19. 11. 2026. **PR:** #1449. Kód kroku 6 sa pripravuje v tom istom PR ako kroky 1–5. **Nie je to súhlas na prepnutie produkčných čítačov a zápisov.**

## Čo už skutočne prebehlo

- Cloudflare D1 pred seedovaním: **347** plemien, **344** ACTIVE Notion workcopy prepojení, len **3** controlled zrkadlá.
- Produkčný GitHub Actions [run 44601495993](https://github.com/investradarsk/psipedia-sk/actions/runs/44601495993): **úspešný** prenos **341** chýbajúcich zrkadiel v **2** bezpečných dávkach: prvá overila 197 riadkov spolu, druhá **344**. `postflight-success`, `missing=0`, `issues=[]`.
- Toto bola **iba pomocná tabuľka** `breed_notion_controlled_values`. Nespustila sa migrácia 0174 ani prenos FCI/SEO/redakčných textov do finálnych v2 tabuliek.
- V `main` existujú 0171/0172 SQL súbory, ale pred postupom ďalej treba nezávisle overiť fyzickú produkčnú schému; PR #1451 pre **0173** je stále otvorené. **0174 preto zostáva v `pending-migrations`.**

## Opravená úplnosť ukladania (krok 6)

Pôvodný návrh z 5/6 pokrýval iba 6 redakčných polí zo 60-poľovej Notion workcopy. Pôvodné `managed_breeds.editorial_json` však ďalej uchováva 5 reálne používaných alebo historických hodnôt:

| Pôvodné pole | Nová 0174 tabuľka/stĺpec | Typ |
|---|---|---|
| `editorial.exerciseTip` | `breed_editorial_text.exercise_tip` | TEXT |
| `editorial.trainingTip` | `breed_editorial_text.training_tip` | TEXT |
| `editorial.healthTip` | `breed_editorial_text.health_tip` | TEXT |
| `editorial.coatTip` | `breed_editorial_text.coat_tip` | TEXT |
| `editorial.heroTraits` | `breed_editorial_text.hero_traits_json` | JSON array |

Nová tabuľka má **11 redakčných hodnôt**: 6 riadených cez Notion + 5 historických. `hero_traits_json` má CHECK JSON array; `lib/breed-sql-v2-backfill.mjs` kopíruje všetkých 11 z produkčného JSON pri vykonaní a postflight ich porovnáva; SQL bridge má explicitné mapovanie. **Nová verzia nesmie odstrániť pôvodný JSON ani jeho tipy pred cutoverom.**

`seo_og_image` je vo finálnom modeli (8 SEO polí), navyše sa v existujúcom priamom Notion writeri doplnila podpora `seo.ogImage`.

## Brána pred jediným SQL masterom

`lib/breed-sql-v2-cutover-gate.mjs` je read-only kontrola:
1. 0174 fyzicky prítomná, 5 backfill SQL dotazov úspešne dokončených, **347** FCI a redakčných, **344** numeric facts a ACTIVE mirrors.
2. Nulová odchýlka **všetkých** prenesených FCI, 11 editorial, SEO, 9 facts a SQL relácií od originálu.
3. Kontrola **3 už dnes používaných SQL scalarov**: `fciGroupSelect` ↔ `fci_group`, `fciSectionSelect` ↔ `fci_section_number`, `sizeSelect` ↔ `size`. **Žiadne automatické prepísanie existujúceho D1 scalaru** zo sidecaru. Null/not-selected nie je potvrdená zmena.
4. Aktuálna **živá Notion parita**, nie iba zhodné D1 sidecar stĺpce. Novší per-field zápis v Notione aj Admine musí byť vyriešený podľa LWW.
5. Overené všetky verejné čítačky a editory: public detail, index, filtre, porovnávač, FCI, SEO/sitemap a Admin detail/zoznamy.
6. **Atómové per-field SQL+JSON zapisovanie** aj pre Admin full save, direct dirty, quick intro, Notion webhook, 12 kontrolovaných polí a relácie. Bez toho by sa údaje po backfille okamžite rozchádzali.

Ak jeden bod nemá dôkaz, `assessBreedSqlV2Cutover` vráti `ready:false`, s konkrétnymi dôvodmi. Tento kód **nikdy nedovoľuje mazanie starých JSON**; to potrebuje samostatný bezpečnostný audit až po stabilnom produkčnom cutovere.

## Upozornenie – čo ešte chýba, aby bolo možné tvrdiť „6/6 hotové v produkcii“

- PR #1451 (0173) merge + produkčný audit a schema install; následne oprávnené schema-only nasadenie 0174.
- Pred importom zmraziť alebo atomicky verziovať konkurentné zmeny v Admine/Notione. Päť krokov backfillu nie je jedna transakcia.
- Dokončiť fyzicky transakčné writer adaptéry a SQL-primary čítačky naprieč celým webom, vrátane indexu a SEO.
- Spustiť owner-only `AUDIT-BREEDS-V2-344-347`, až potom podľa výsledku `APPLY-BREEDS-V2-344-347` po 0174; následne fyzicky skontrolovať paritu.
- Až po nezávislých úspešných overeniach zapnúť cez explicitnú bránu SQL-primary; pôvodný JSON nevymazávať v tomto PR.

**Zakázané skratky:** nepresunúť 0174 do `drizzle/` pred riadne nasadenou 0173, neodstraňovať hodnoty `editorial_json`, `fci_standard_json`, `seo_json`, `related_breeds_json`, neaktivovať SQL-primary iba kvôli zelenému CI, neoznačiť `344` zrkadiel za dokončený 90-poľový Notion transfer.

## Offline testy

```bash
node --test tests/breed-sql-v2-cutover-gate.test.mjs tests/breed-sql-v2-backfill.test.mjs tests/breed-sql-v2-bridge.test.mjs tests/breed-sql-0174-foundation.test.mjs
npm run db:check-migrations
```

**Záver:** v6 schema, úplnosť backfillu a cutover brána sú pripravené v kóde. **Produkčný SQL cutover ani 0174 backfill zatiaľ vykonaný nie je.**
