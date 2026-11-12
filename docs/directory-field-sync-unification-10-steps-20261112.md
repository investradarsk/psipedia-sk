# Psipedia.sk — jednotná obojsmerná synchronizácia adresára (10 krokov)

Dátum: 12. 11. 2026. Jeden PR pre celú existujúcu databázu **Adresár** v Notione a existujúce profily v D1. Žiadna nová Notion databáza, žiadne automatické zlučovanie PR, žiadne produkčné zápisy v rámci PR.

## Referenčná implementácia

Chovateľské stanice sú manuálne otestovaný model: podpísaný webhook `page.properties_updated` v Notione, okamžitý cielený import **len skutočne zmenených vlastností**, explicitné uloženie iba zmenených polí z Adminu do Notionu, okamžitý read-back, oddelená identita a technické metadáta. Prázdny explicitne upravený text je úmyselné vymazanie, nie chyba; chýbajúca vlastnosť v udalosti nie je príkaz vymazať ju.

**Všetkých 10 kategórií**: `chovatelske-stanice`, `treneri`, `chovatelske-kluby`, `kynologicke-kluby`, `veterinari`, `fyzioterapia`, `dalsie-sluzby`, `salony-a-sluzby`, `hotely-a-opatrovanie`, `vencenie`.

### Pevné invarianty

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
3. **Notion → Admin, rovnaké cielené spracovanie (hotové v kóde).** Pre všetkých 10 kategórií existujúci per-field runner používa presné Notion property ID. Opravená falošná úspešná odpoveď pri `page.properties_updated` bez platných changed-property ID: cielený dispatcher vráti `deferred`, aktívny D1 inbox uchová opakovanie/review a bez inboxu endpoint vráti retryable HTTP 503. Žiadny celoprofilový merge ani automatické prepisovanie údajov bez podpísaných polí. Regresné testy zahrňujú `Popis` a staré `Služby` pri Tarabore.
4. **Admin → Notion (zapracované).** Rýchla úprava v tabuľke používa spoločný prenos vo všetkých 10 kategóriách; každé zmenené pole má samostatný PATCH a echo/readback. Jedna zlá hodnota nesmie blokovať ostatné. Neúspešné polia zostanú čakajúce.
5. **Vymazanie (zapracované v existujúcej ceste).** Textové, kontaktné a SEO prázdne hodnoty sú explicitné zmeny. Pridané je vymazanie jedného Notion select do D1 aj opačne. Neexistujúca Notion vlastnosť nesmie potvrdiť vymazanie.
6. **Kategóriové adaptéry (kód pripravený, schéma otvorená).** Všetkých 21 kategóriových select filtrov používa jeden register a oddelené zápisy. Z reálneho Notion Adresára existuje 7 stĺpcov, 14 chýba. Pridaný idempotentný read-only plán ich vytvorenia v tej istej databáze; zatiaľ sa nič nepridávalo.
7. **Služby V3 a starý text (zapracované).** V3 ostáva nezávislá ID relácia s CAS a potvrdeným baseline. Staré Služby sa prenášajú iba v kategóriách, ktoré povoľujú voľný text, pri tréneroch do súkromného metadata kľúča; štyri V3-only pilotné kategórie starý text neprepisujú.
8. **Historické chyby (zapracované).** Úspešne potvrdený per-field prenos smie vymazať iba historickú chybu o konkrétnom prenesenom poli. Chyba services:UNVERIFIED_DELETE zostane aj po prenose iného Popis; iné konflikty a V3 chyby zostanú.
9. **Diagnostika a webhooky (zapracované).** Pri chybných/missing changed-property ID sa nevracia falošný úspech. Pribudlo value-free logovanie per-profile dispatchu a read-only diagnostika v každom editore Adresára: mapping, oba baselines, V3 count, inbox/retry a aktívne upozornenie. Stav Notion subscription sa overuje osobitne.
10. **Regresné testy a akceptácia (pripravené, live ešte otvorené).** Pridané kontrakty všetkých 10 kategórií, izolovaného writebacku, vymazávania, V3, historických chýb, diagnostiky a schéma plánu 14 stĺpcov. CI/build a produkčné testy oboma smermi zostávajú povinné pred merge. Bez automatického zlúčenia.

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

**Kódové kroky 1–9 sú zapracované. Krok 10 má pridané regresné testy, ale CI/build a živá produkčná akceptácia nie sú potvrdené. 14 chýbajúcich Notion select polí vyžaduje osobitné schválenie nasadenia.**


## Produkčná schéma (read-only overenie 12. 11. 2026)

V existujúcej Notion databáze Adresár (97 vlastností) je 7 z 21 výberových polí. Chýbajúcich 14 má bezpečný iba read-only plán v lib/directory-notion-facet-schema-plan.ts; návrhy ADD COLUMN sú idempotentné a viazané na presný Notion data source. Žiadna nová databáza ani živá schema zmena sa nevykonala.

Po merge treba jednotlivo otestovať Notion → Admin a Admin → Notion pre každú kategóriu: Popis, SEO, kontakty, prázdne hodnoty, select filtre, samostatné V3, zmazanie a súbežné editácie. Tarabora #1826 zostáva otvorený produkčný test (Popis končí x; staré Služby obsahujú test). Subscription môže byť Paused a jej stav nie je z D1 doložený.

## Stav CI a produkčnej akceptácie

Najnovší overený commit `40da6a5d3c4cfe65d0ac3be58ad6f871267311e3`: všetkých 9 GitHub workflowov dokončených (7 `success`, 2 `skipped`). Úspešné: NOTION-SYNC focused validation, Notion profile lossless sync (offline), NOTION-BIDIRECTIONAL events/help, Admin Stability Read-Only, Admin Performance V2 Read-Only, Admin Legacy Mutation CSRF, Playwright E2E and production smoke. Nejde o potvrdenie reálneho live webhooku zo zmeny Notion.

Krok 10: **CI/regresné testy úspešné, produkčná akceptácia otvorená**. Branch bol pri porovnaní 52 commitov za `main`, hoci GitHub `mergeable=true`. Pred merge treba aktualizovať vetvu proti aktuálnemu `main` a znova skontrolovať testy. Produkčné údaje neboli prepísané.

**Otvorené prevádzkové podmienky:**

- 14 chýbajúcich select stĺpcov v existujúcej Notion databáze Adresár: pripravený read-only schema plán, nie samotný schema zápis; ich použitie potrebuje samostatný ownerom schválený rollout.
- Overiť, či Notion webhook subscription je `Active`; `Paused` vyžaduje obnovenie v Notione.
- Živý test Notion → Admin a Admin → Notion aspoň jedného profilu v každej z 10 kategórií, vrátane explicitného clear a kontroly V3.
- Tarabora #1826: preukázať prenos zadaného `x` v `Popis` a `test` v starých `Služby` do D1; kontrolovať, že 8 V3 služieb ostalo nedotknutých.

