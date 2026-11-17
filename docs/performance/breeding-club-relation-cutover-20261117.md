# Chovateľské kluby – nový SQL model bez migrácie starých väzieb

## Rozhodnutie vlastníka
**Nevykonávať žiadny backfill zo starého JSON ani z textových hodnôt Notionu.**
Existujúce prepojenia si vlastník želá vytvoriť nanovo po nasadení.
Preflight 17. novembra 2026: 535 staníc, 84 klubov, 7 historických stanica→klub ID,
38 už existujúcich klub→plemeno SQL vzťahov a 0 SQL vzťahov trénerov.
Tieto čísla sú iba inventúra, nie povinné dáta na prenos.

## Cieľový model
- Plemená: `managed_breeds` (nezmeniť ani jedno plemeno).
- Stanica ↔ plemeno a chovateľský klub ↔ plemeno: jednotná `breed_directory_relations`.
- Stanica ↔ chovateľský klub: nová `directory_breeder_club_relations`.
- Tréneri: mimo prepojení na plemená a chovateľské kluby, služby zachovať.
- Pri prvej aktivácii **začať bez starých väzieb**. Žiadny automatický import starých názvov alebo JSON ID.

## Kritický krok: migračná história
**PR NEZLUČOVAŤ**, kým neexistuje správna nová tabuľka. Aplikácia ju načítava priamo
a predčasný deploy môže spôsobiť HTTP 500.
Produkčná `d1_migrations` podľa výpisu vlastníka končí na 0162;
0163–0168 sú teda zatiaľ nepotvrdené. Migračná konfigurácia ich označuje ako
neaktivované. Neaplikovať 0169 mimo schválenej sekvenčnej migration chain.
Nevkladať falošné zápisy do `d1_migrations`, neobchádzať ochrany.

## Overený postup
1. Vytvoriť a overiť obnoviteľnú zálohu produkčnej D1. Bez zálohy STOP.
2. V Cloudflare D1 Console spustiť **iba read-only** `scripts/d1-0163-0169-schema-readonly-audit.sql`. Výstup po jednom riadku pre 0163–0169 ukáže `history_recorded`, `present_objects`, `missing_objects` a `status`. SQL je jeden SELECT/CTE bez komentárov pred úvodným WITH, aby ho Cloudflare Console nevyhodnotil ako komentár. Počíta tabuľky, indexy, triggery, pohľad aj stĺpce bez akéhokoľvek zápisu.
   `NOT_APPLIED` znamená chýbajúcu migráciu, `SCHEMA_PRESENT_WITHOUT_HISTORY` alebo
   `PARTIAL_OR_INCONSISTENT_STOP` znamená drift, pri ktorom sa nesmie bez
   analýzy nič aplikovať. Chýbajúce migrácie nasadzovať iba cez existujúci
   chránený, postupný owner-authorized migračný proces. Nevytvárať migrácie
   iba pomocou zápisu do `d1_migrations`. Ak je fyzická schéma v nezhode, STOP.
3. Po schválenom prechode cez 0168 vykonať migráciu
   `drizzle/0169_directory_breeder_club_relations.sql` cez chránený proces.
   Nová `directory_breeder_club_relations` musí byť **prázdna**.
4. **Staré väzby sa NEIMPORTUJÚ**. Pred vytváraním nových väzieb vykonať presne
   raz manuálny SQL reset `scripts/d1-breeder-club-links-reset.sql` po výslovnom
   schválení resetu a po zálohe. Reset sa týka iba
   `breed_directory_relations` záznamov, kde profil je
   `chovatelske-stanice` alebo `chovatelske-kluby`;
   žiadne profily, plemená ani ostatné polia sa nemažú.
5. Spustiť read-only `scripts/d1-breeder-club-links-postflight.sql`:
   `station_club_table_exists=1` a všetky 3 počty prepojení = 0.
   Výsledok zafixovať ako cutover baseline.
6. **Notion anti-replay:** pred znovuzapnutím zrkadlenia vzťahov overiť a
   zjednotiť `Prepojené plemená` a `Prepojené kluby` v existujúcej
   Notion databáze Adresár. Staré textové hodnoty môžu pri explicitnom
   webhook edite obnoviť väzby. Reset Notion vzťahových textov musí byť
   presne ohraničený (len tieto polia pre stanice/kluby), kontrolovaný
   a bez zásahu do ostatných profilových údajov. Prázdne texty nepoužívať
   ako signál hromadného prepísania unrelated polí.
7. Až po CI, overení D1/Notion a po manuálnych kontrolách zmeniť PR z Draft
   na Ready for review, zlúčiť a overiť editovanie nových väzieb
   Admin ↔ D1 ↔ Notion ↔ verejný web.
8. Následne môže vlastník vyberať konkrétne prepojenia nanovo.
   Reset skript sa už **nikdy nesmie znovu spustiť**.

## Bez zásahov do iných dát
Žiadne plošné vymazanie `source_data_json`, profilov, plemien, SEO,
galérií alebo Notion záznamov. Nezapínať automatické prepojenia podľa
historického poľa `Klub`, `Plemeno`, `Plemená`.
Výber nových vzťahov je explicitný cez Admin a len po tom sa mirrorizuje
do Notionu.
