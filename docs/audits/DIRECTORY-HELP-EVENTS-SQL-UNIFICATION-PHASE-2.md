# Psipedia – SQL zjednotenie Služby / Pomoc psom / Podujatia – fáza 2/4

Dátum: 17. november 2026. Stav: **návrh SQL modelu + automatické testy**, nie produkčný cutover.

## Čo overenie kódu potvrdilo

- **Služby pre psov:** všetkých desať aktuálnych kategórií má jedno hlavné
  úložisko directory_profiles. Primárna kategória je stĺpec category,
  ďalšie kategórie sa dnes uchovávajú v source_data_json.
- **E-shopy:** managed_eshops už je samostatná kanonická SQL tabuľka,
  prepojená cez eshop_notion_sync; focus_tags_json je štruktúrovaný
  zoznam, nie druhá databáza.
- **Podujatia:** managed_events má bežné údaje (názov, čas, miesto,
  kontakty atď.) ako SQL stĺpce. seo_json a obrazové nastavenia sú
  štruktúrované hodnoty; nevzniká druhá tabuľka podujatí.
- **Pomoc psom:** help_cases, help_organizations, adoption_dogs a
  lost_found_dog_reports sú rôzne typy záznamov so samostatnými
  SQL tabuľkami. Názov obrazovej galérie s príponou JSON neznamená
  historický zdroj, ktorý sa môže bezpečne vymazať.
- Existujúce synchronizačné väzby (directory_notion_sync,
  event_notion_sync, notion_agenda_sync, eshop_notion_sync) zostávajú
  neporušené. Sú to vzťahy medzi D1 ID a Notion stránkou, nie
  konkurenčné obsahové databázy.

## Navrhnuté konkrétne SQL zmeny adresára

Súbor docs/proposals/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-2-DRAFT.sql
je **nezaradený návrh**. Nie je v aktívnom reťazci drizzle migrácií
a nesmie sa spúšťať proti produkčnej D1 bez samostatného schválenia.

| Dnes | Navrhnutý jediný SQL vlastník |
| --- | --- |
| Telefón, e-mail, Facebook, Instagram v source_data_json | štyri nové, voliteľné stĺpce directory_profiles |
| Druhá alebo ďalšia kategória profilu v _psipedia_additional_categories | directory_profile_additional_categories (1 profil → viac kategórií) |
| Kategóriové redakčné textové fakty | directory_profile_public_facts (profile_id + field_key) |
| 21 kategóriových select filtrov v JSON | directory_profile_filter_values (profile_id + filter_id) |

Toto je normalizované **SQL v tej istej Cloudflare D1**, nie nová databáza.
Pri faktoch a filtroch vzniká jeden riadok na hodnotu, pretože rôzne
kategórie majú odlišné polia. Neexistuje dôvod kopírovať každú
kategóriu do vlastnej tabuľky ani vyrábať 21 takmer prázdnych stĺpcov
pre všetkých veterinárov, trénerov a chovateľov.

## Pravidlá, ktoré musí cutover dodržať

1. Pri nových kontaktných stĺpcoch platí NULL = zatiaľ bez overeného
   kanonického prenosu, prázdny text = výslovne vymazané.
2. Pri tabuľkách faktov/filtrov je chýbajúci riadok bez prenesenej
   hodnoty. Prázdna hodnota faktu je legitímne vymazanie. Filter
   s hodnotou unknown je iný ako chýbajúci riadok.
3. Ak sa napríklad Notion „Pohotovosť“ používa ako filter áno/nie
   aj ako pôvodný voľný text, záznam sa označí na kontrolu; nie je
   dovolené vytvoriť dva konkurenčné SQL zdroje pre tú istú vlastnosť.
4. Väzby na plemená/kluby, Services V3, galérie, potvrdené Google miesto,
   súkromné kontakty a redakčné rozhodnutia ostávajú vo svojich
   existujúcich kanonických tabuľkách/pravidlách, nie v novej textovej kópii.
5. Návrh zámerne **neobsahuje** automatické kopírovanie z historického
   JSON, DROP, DELETE ani prepis publikovaných profilov.
6. Podujatia a všetky agendy Pomoci psom si ponechávajú súčasné SQL
   tabuľky; pri nich ďalšia fáza preverí rozdiely v čítacích a
   ukladacích cestách, nie vytvorenie ďalšej tabuľky.

## Blokátory aktivácie

- Otvorené PR #1414 obsahuje návrh migrácie 0169 pre vzťahy
  chovateľských klubov. Nebudeme paralelne obsadzovať rovnaké číslo.
  Návrh tejto fázy sa musí zaradiť za skutočne zlúčený migračný reťazec.
- Produkčný audit fázy 1/4 zatiaľ nemá potvrdené počty z D1.
  Bez nich nie je známy počet profilov závislých na historických
  filtroch, kategóriách či prázdnych kontaktoch.
- Pred prípadným produkčným apply musí nasledovať záloha, pred/po
  preflight, izolovaný reálny test každej kategórie, verifikácia
  Notion, Admin a verejného profilu a rollback plán.

## Hotové testy v PR

tests/directory-sql-unification-phase2.test.mjs skúša návrh schémy v
izolovanej SQLite databáze:
- kontakty NULL verzus výslovné vymazanie;
- druhá kategória bez klonovania profilu, validáciu kategórie a FK;
- fakty/filtrovanie, chýbajúce hodnoty a zákazy duplicít;
- 10 kategórií a 21 registrovaných Notion filtrov;
- konflikt zdieľaného Notion názvu s historickým textovým poľom;
- zachovanie existujúcich SQL agend Pomoci psom, Podujatí, E-shopov a
  katalógu Services V3.

**Výsledok fázy 2 je pripravený návrh cieľovej schémy, nie už
nasadené zjednotené produkčné údaje.** Po green CI a produkčnom
read-only audite je ďalším krokom pripraviť číslovanú migráciu,
overené prenesenie každého konkrétneho poľa a riadený cutover.
