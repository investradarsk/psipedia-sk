# Pomoc psom – kontrolovaný SQL backfill, krok 3/6

**Stav:** implementácia a testy pripravené v **tom istom PR #1463**. Produkčné údaje neboli zmenené. Žiadna nová migrácia D1 a žiadny ďalší PR.

## Záver auditu pred prenosom

- Všeobecné prípady už majú SQL vlastníka `help_cases`; ich duplicitná plošná migrácia je nesprávna.
- Útulky/organizácie používajú `help_organizations` a súvisiace tabuľky. Staré `help_cases.category='utulky'` sú historické záznamy.
- Adopcie používajú `adoption_dogs`. Import `0038_adoption_staging_data.sql` už riešil konkrétnu historickú kohortu so zdrojom `help_cases.category='adopcia'`. Opakovanie importu alebo vloženie nových adopcií iba podľa názvu by bolo nebezpečné.
- Stratené a nájdené psy používajú `lost_found_dog_reports` s explicitným typom `LOST/FOUND`; starý spoločný kategóriový slug nie je dostatočný dôkaz identity. **Žiadny automatický backfill pre lost-found.**
- `gallery_json` a image display JSON sú v SQL technické štruktúry a nestrácajú sa. `source_data_json` u organizácií obsahuje okrem iného galérie; nie je súhlas s jeho odstránením.

## 1. Existujúca chránená read-only D1 inventúra rozšírená

`scripts/production-editorial-storage-readonly.mjs` teraz k pôvodnému `report.json` dopĺňa:

- `helpLegacyCoverage` – súhrn počtov legacy adopcií/útulkov spárovaných podľa slugu s kanonickou tabuľkou a počtu bez zhody.
- `helpLegacyFieldCandidates` – **šesť agregovaných polí** pre `adoptions` a `organizations`: počet spárovaných dvojíc, koľko legacy hodnôt je neprázdnych pri prázdnom kanonickom poli, a koľko neprázdnych hodnôt sa líši.

Tieto výstupy obsahujú len **počty, názov agendy a názov poľa**. Neobsahujú názvy profilov, ID, Notion page ID, URL obrázkov, kontakty, zdrojové texty ani súkromné PII. Chýbajúca tabuľka dá `missing_table`, nie falošnú nulu.

**Dôležité:** Prázdny SQL stĺpec môže znamenať úmyselné vymazanie. Agregát preto nie je autorizácia backfillu ani skutočné porovnanie s živým Notionom. Nevyhodnocuje dôkazy o tom, kto pole naposledy zmenil.

Workflow ostáva `Psipedia – D1 canonical inventory (Services, Help, Events)` s ručným, read-only spustením na aktuálnom `main` po overení a merge. V tomto kroku nebol spustený na produkcii.

## 2. Explicitne schválený backfill iba jednej hodnoty

Nový `lib/help-sql-reviewed-backfill.mjs` **iba číta** SQL a vracia predpripravený, parameterizovaný `UPDATE`; žiadnu operáciu `run()`/remote D1 nevykonáva.

Povoľuje len šesť bezpečne mapovateľných verejných polí **v presne schválených historických kohortách**:

| Kanonická tabuľka | Cieľové SQL pole | Historické SQL pole v `help_cases` |
| --- | --- | --- |
| `adoption_dogs` | `main_image` | `image_url` |
| `adoption_dogs` | `short_description` | `excerpt` |
| `adoption_dogs` | `description` | `description` |
| `help_organizations` | `image_url` | `image_url` |
| `help_organizations` | `short_description` | `excerpt` |
| `help_organizations` | `description` | `description` |

Nie je dovolený automatický prenos kontaktov, adries, SEO, stavov, publikovania, galerijných URL, súkromných údajov či iných kategórií.

Každý návrh vyžaduje **manuálne potvrdený receipt** s presným `sourceId`, `targetId`, `slug`, agendou, poľom, revíziami `updated_at` oboch riadkov, SHA-256 konkrétnej zdrojovej hodnoty a výslovne potvrdeným stavom kanonického poľa `NULL` alebo `EMPTY`. Samotný počet nálezov žiadny receipt nesmie generovať.

Planner kontroluje:

1. Presne jeden starý záznam kategórie+slug a presne jeden kanonický záznam rovnakého slugu.
2. Presné identifikačné ID z oboch strán, povolený lifecycle a správny pôvod: `adoption-staging-import:v1` alebo `help-org:{slug}`.
3. Zhoda zdrojovej revízie a hash hodnoty so schváleným snapshotom.
4. Žiadne prepísanie existujúcej neprázdnej hodnoty; nulové a úmyselne vymazané hodnoty sa odlišujú.
5. Zhoda kanonickej revízie aj presného prázdneho stavu; po úspešnom vykonaní by ďalší rovnaký návrh vrátil `ALREADY_APPLIED`.
6. Vygenerovaný `UPDATE` obsahuje opakované SQL ochrany identity, pôvodu, oboch revízií, hodnoty zdroja, publikovania a prázdneho cieľa. Úprava medzi plánom a vykonaním znamená **0 zmien**, nie prepísanie novšej hodnoty.

Pri príprave sa neexportuje zdrojový text; objekt `statement.binds` je privátny a **nesmie sa logovať ani ukladať do verejného GitHub artefaktu**.

## 3. Testy a CI

- `tests/help-sql-reviewed-backfill.test.mjs` – presná identita, idempotencia, prázdne hodnoty, súbežné zmeny medzi plánom a zápisom, ochrana aktuálnych textov, chýbajúci review, nesprávny pôvod, slug kolízie, neprípustné polia, nulové agregáty.
- `npm run test:help-sql-backfill`, zapojené do `npm run test:foundation`.
- Existujúci `.github/workflows/production-editorial-storage-readonly.yml` spúšťa tieto testy offline v PR; chránené produkčné spustenie naďalej obsahuje **iba SELECT**.

## Nevyhnutné podmienky pred vykonaním v kroku 6

- Skutočné produkčné hodnoty a typy schém overené read-only Action; chýbajúce/konfliktné identity vyriešené.
- Potvrdené Notion ↔ Admin/D1 správanie, najmä odkontrolované profily, partner prevzatie, novšie zmeny a zámerné vymazania.
- Odobrený **konkrétny** receipt pre každú skutočne chýbajúcu hodnotu (alebo výsledok „nič na prenos“). Nevykonávať hromadné predpoklady z prázdnych hodnôt.
- Existuje zabezpečený workflow, kontrola schémy a revízií, záloha/recovery bookmark, postflight a rollback. Pri `UPDATE` s 0 zmenami zastaviť bez success tvrdenia.
- Žiadne vymazanie historických riadkov, deaktivácia Notion mapovania či legacy fallbacku v kroku 3.

**Výsledok 3/6:** pripravený a testovaný kontrolovaný mechanizmus prenosu + jeho bezpečné read-only vyhodnotenie, **nie uskutočnený produkčný import**. Následný krok 4/6 rieši zjednotenie editovacích ciest a synchronizačných invariánt. 
