# Psipedia.sk — jednotná obojsmerná synchronizácia adresára (10 krokov)

Dátum: 12. 11. 2026. Jeden PR pre celú existujúcu databázu **Adresár** v Notione a existujúce profily v D1. Žiadna nová Notion databáza, žiadne automatické zlučovanie PR, žiadne produkčné zápisy v rámci PR.

## Referenčná implementácia

Chovateľské stanice sú manuálne otestovaný model: podpísaný webhook `page.properties_updated` v Notione, okamžitý cielený import **len skutočne zmenených vlastností**, explicitné uloženie iba zmenených polí z Adminu do Notionu, okamžitý read-back, oddelená identita a technické metadáta. Prázdny explicitne upravený text je úmyselné vymazanie, nie chyba; chýbajúca vlastnosť v udalosti nie je príkaz vymazať ju.

**Všetkých 10 kategórií**: `chovatelske-stanice`, `treneri`, `chovatelske-kluby`, `kynologicke-kluby`, `veterinari`, `fyzioterapia`, `dalsie-sluzby`, `salony-a-sluzby`, `hotely-a-opatrovanie`, `vencenie`.

### Pevné invariatny

- Rovnaký webhook, overovanie HMAC, identita Notion page ID ↔ Psipedia ID ↔ kategória; žiadna kategória nie je mimo cieleného dispatchu.
- Každý editovateľný atribút má vlastný per-field prevod a samostatné uloženie. Chyba poľa A nesmie preventívne blokovať samostatný zápis poľa B; zlyhania však musia ostať dohľadateľné a nesmú byť označené za úspech.
- Nová hodnota, prázdna hodnota a odstránenie poľa sa rozlišujú; explicitné vymazanie sa šíri Notion → Admin aj Admin → Notion.
- Uloženie z Adminu posiela iba skutočne upravené polia. Needitované polia sa doplnia z najnovšieho D1 stavu, nie zo starej otvorenej formulárovej snímky.
- `Služby z katalógu` (V3) je samostatná kanonická relácia: per-ID CAS, oddelený potvrdený baseline, žiadne implicitné mazanie bez potvrdenej editácie. Textové `Služby` pri tréneroch sú **nezávislý textový atribút**, nie projekcia `services_json`. Ostatné pilotné kategórie nepoužívajú výsluhový text ako autoritu V3.
- Admin/D1 môže mať nárok na ochranu identity, publikácie, potvrdeného Google Place a technických ID; toto nie je oprávnenie blokovať iné redakčné polia.
- Bez úpravy produkčných dát, bez zmeny súčasného Notion data source, bez nových cronov a bez tajných kľúčov v logoch.
- `Sync stav` a `Posledný sync` sa označia za potvrdené až po úspešnom zápise/overení. Stará nesúvisiaca chyba sa nevymaže iba po úspechu jednej V3 relácie.

## Realizačné kroky (v tomto jedinom PR)

1. **Inventár a kontrakt (hotový).** Vymenovať 10 kategórií a overiť ich prijímanie webhookom, cestu Admin PUT a univerzálne mapovanie `Popis`, SEO, kontaktov a mazania. Zachovať red/regresné testy konkrétneho incidentu Tarabora #1826.
2. **Jeden register kategórií a polí (hotový základ).** Registrácia všetkých 10 kategórií je zjednotená v `DIRECTORY_FIELD_EVENT_CATEGORIES` a používa ju aj SQL whitelist okamžitého webhookového dispatchu. Existujúcu mapu bežných redakčných polí `BREEDER_NOTION_EDITORIAL_FIELDS` znovu používajú všetky kategórie; podrobné kategóriové adaptéry sa dopracujú v kroku 6. Regresné testy aktualizované.
3. **Notion → Admin, rovnaké cielené spracovanie.** Pre všetky kategórie podpísané udalosti konkrétnych ID vlastností; bez celoprofilového merge, hodinovej náhrady alebo blokovania nesúvisiacich polí.
4. **Admin → Notion, rovnaké ukladanie.** Dirty-field tracking, nezmenené hodnoty neprepisovať; jednotlivé zápisy s overením odpovede/GET a presnou spätnou väzbou.
5. **Vymazanie a prázdne hodnoty.** Správne šíriť `""`, vymazanie URL, e-mailu, textu a voliteľných hodnôt; name/identita ostávajú chránené.
6. **Kategóriové adaptéry.** Zjednotiť kontakt, lokalitu, SEO, výcvikové/veterinárne/facet polia a technické typy; každé skutočne editovateľné Admin pole má korektné Notion zrkadlo.
7. **Služby V3 a staré služby.** Zachovať samostatnú reláciu a per-ID zmeny; odstrániť vedľajšie prepísania medzi `Služby`, `services_json`, metadata textom a V3, bez automatického plošného mazania.
8. **Historické sync chyby a potvrdzovanie.** Rozlišovať staré `UNVERIFIED_DELETE` od aktuálnych eventov, opravovať iba bezpečne potvrdené stavy; chyba jednej časti nesmie vyradiť ostatné a úspech jednej časti nesmie falošne vymazať konflikt druhej.
9. **Odolnosť webhookov a diagnostika.** Preveriť inline dispatch, fallback inbox, retry, paused subscription, 401/403/503, frontu, prevádzkové pozorovanie a administrátorský prehľad na úrovni profilu.
10. **Akceptačné testy všetkých 10 kategórií.** Testovať u každej Notion → Admin i Admin → Notion: text, prázdna hodnota, SEO, kontakt, voliteľné hodnoty, súčasné zmeny, Services V3 a nulový dopad na iné polia; build a kontrola konfliktov s `main`. PR zostáva bez automatického merge.

## Reálny incident: Psia škola Tarabora #1826

- Notion stránka: `3fb793fc-1d18-81e1-be4c-fb9ef26700a6`; D1 mapping existuje, posledný mapping sync z 28. 10.
- Notion `Popis` končí `x`, textové `Služby` = `test`. Obsah Notion stránka prijala; prenos do D1 nebol používateľským testom potvrdený.
- `directory_service_notion_relation_sync` už obsahuje potvrdenie V3 z 12. 11. 2026 15:00:56 UTC, v Admin je 8 výberov; toto **nepotvrdzuje** redakčný webhook.
- `notion_profile_field_baselines` pre tento profil nie je, `_psipedia_trainer_services_text` v D1 je `NULL`, Notion zachováva historické `services:UNVERIFIED_DELETE`.
- `notion_webhook_inbox` pre túto Notion stránku je prázdny, ale inline-dispatch môže úspešnú alebo `metadata-only` udalosť obslúžiť bez inbox zápisu. **Nie je potvrdené**, či je subscription aktívna. Tieto údaje samy osebe neoprávňujú meniť obsah profilu ani umelo nastavovať baseline.

### Konkrétne akceptačné pozorovania

1. Pri zmene `Popis` v Notione sa rovnaká hodnota dostane do D1 profilu #1826 bez zmeny `services_json` alebo V3.
2. Pri zmene starého `Služby` v Notione sa uloží do `source_data_json._psipedia_trainer_services_text`, nie do `services_json`; V3 zostane rovnaká.
3. Po úspešnom jednotlivom editovanom poli sa potvrdí jeho prenos, ale nezávislý V3 / historický konflikt sa nesmie falošne oznámiť ako vyriešený.
4. Rovnako fungujú aspoň referenčné profily každej z 10 kategórií a spätný smer Admin → Notion.
5. Ak Notion webhook subscription zostáva `Paused`, produkčný test nemôže prejsť bez ownerom vykonaného obnovenia subscription; úpravy kódu ho samy neobnovia.

**Kroky 1–2 sú pripravené a zapísané do PR; zostávajúce kroky 3–10 ešte nie sú dokončené.**
