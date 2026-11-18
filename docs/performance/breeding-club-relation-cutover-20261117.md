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

## Kritický krok: samostatné migrácie a nezmenený ledger
**PR NEZLUČOVAŤ**, kým nie je overená a vytvorená nová SQL tabuľka. Aplikácia
ju načítava priamo a pri predčasnom deployi hrozí HTTP 500.

Podľa výpisu vlastníka produkčná `d1_migrations` končí na 0162.
**To nie je dôkaz, že migrácie 0163–0168 neboli fyzicky nasadené.**
Projekt má samostatné, owner-dispatched rollout nástroje pre 0163, 0164,
0165, 0166, 0167 a 0168; niektoré z nich zámerne neaktualizujú
`d1_migrations`. Ich reálny stav sa overuje na fyzickej schéme.

**Neaplikovať naslepo 0163–0168 a nezapisovať falošné ledger riadky.**
Novú 0169 možno pripraviť analogicky ako samostatnú owner-dispatched,
pinned schema-only operáciu. Podmienkou je nový nezávislý audit/guard,
schválený proces a overenie cieľovej databázy. Nie je potrebné aktivovať
nesúvisiace analytické, kontaktné ani ďalšie migrácie iba kvôli klubom.

## Overený postup
1. Vytvoriť a overiť obnoviteľný D1 Time Travel bookmark / zálohu.
2. Spustiť **read-only** `scripts/d1-0163-0169-schema-readonly-audit.sql`.
   `PRESENT_WITHOUT_LEDGER_CHECK_ISOLATED` znamená, že objekty existujú,
   ale ledger ich nezaznamenal; treba preveriť ich DDL vlastným 0163–0168
   guardom, nie opakovať migráciu. `PARTIAL_OR_INCONSISTENT_STOP` blokuje
   nasadenie dotknutej schémy do manuálneho vyriešenia.
3. Pre 0169 pripraviť a overiť samostatný, chránený owner-dispatched proces:
   presne pripnuté SQL, kontrola kanonického Cloudflare account/D1 ID,
   manuálne potvrdenie, zámka production-d1-migration,
   preflight objektov/indexov, Time Travel bookmark a postflight.
   Tento nezávislý rollout je pripravený v samostatnom
   [PR #1415](https://github.com/investradarsk/psipedia-sk/pull/1415).
   **Najprv zlúčiť iba #1415**, potom vykonať chránený AUDIT a po schválení
   osobitný APPLY 0169 cez GitHub Actions na main. #1414 zostáva Draft.
4. Až po schválenom nasadení prázdnej
   `directory_breeder_club_relations` (bez jediného starého klubu)
   a po overení DDL pokračovať s jednorazovým čistením existujúcich
   `breed_directory_relations` pre profily chovateľských staníc/klubov.
   Čistenie je **samostatný manuálny krok** `scripts/d1-breeder-club-links-reset.sql`
   vyžadujúci výslovný súhlas a zálohu; nevykoná sa merge ani migráciou 0169.
5. Po resete read-only `scripts/d1-breeder-club-links-postflight.sql`:
   `station_club_table_exists=1`, `station_club_links=0`,
   `station_breed_links=0`, `club_breed_links=0`.
6. **Notion anti-replay:** staré hodnoty `Prepojené plemená` a
   `Prepojené kluby` môžu pri editácii znovu obnoviť vzťahy. Pred
   aktiváciou obojsmerného syncu ich kontrolovane zjednotiť alebo
   vyprázdniť iba pre príslušné profily a polia, nie iné údaje.
7. Potom CI, Notion a D1 regresie, zmena Draft → Ready for review, Merge,
   a overenie Admin ↔ D1 ↔ Notion ↔ verejný web.
8. Vlastník začne vytvárať nové väzby ručne. Jednorazový reset sa
   po začatí editovania nových vzťahov už nesmie spustiť.

## Bez zásahov do iných dát
Žiadne plošné vymazanie `source_data_json`, profilov, plemien, SEO,
galérií alebo Notion záznamov. Nezapínať automatické prepojenia podľa
historického poľa `Klub`, `Plemeno`, `Plemená`.
Výber nových vzťahov je explicitný cez Admin a len po tom sa mirrorizuje
do Notionu.

## Produkčný cutover: skutočný stav 18.11.2026
- 0169 úspešne fyzicky nasadená: #44194911141.
- D1 audit #44252717336: 535 staníc, 84 klubov, 223 starých väzieb, 619 mapovaní.
- Freeze #44255765355: všetkých 6 triggerov aktívnych, stav väzieb nezmenený.
- Notion: vyčistených 32 textových polí na 25 profiloch; kontrola view všetkých 619 profilov potvrdila 0 vyplnených polí Prepojené plemená/Prepojené kluby. Iné polia sa nemenili.
- Reset #44256747818: RESET_POSTFLIGHT, 0 starých väzieb, 0 nových station-club, rovnaké počty a mapovania, 6 ochranných triggerov ostáva. Záloha/bod obnovy zaznamenaný vo workflow.
- Starší text vyššie je historický postup. 0169 ani reset nespúšťať znovu.
- Po zelenom CI zlúčiť #1414, overiť skutočný produkčný deploy a načítanie Admin/verejných profilov a opätovne overiť Notion textové polia, zatvoriť staré editorové karty.
- Až po tomto overení manuálny cutover režim release s odtlačkom prázdneho snapshotu, potvrdením NOTION-RELATION-FIELDS-VERIFIED-EMPTY a NEW-1414-RUNTIME-VERIFIED. Odstráni iba šesť konkrétnych dočasných triggerov. Ostatné údaje ostanú nedotknuté. Pri čiastočnom zlyhaní nepovoľovať editácie; audit a kontrolovaný release môže pokračovať iba pokiaľ je rozsah stále prázdny.
- Až po RELEASE_POSTFLIGHT ručne vytvoriť prvú novú väzbu a overiť jej zrkadlenie a zobrazenie.
