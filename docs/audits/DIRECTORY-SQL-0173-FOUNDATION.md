# Directory SQL 0173 — štruktúra pred synchronizáciou Notion

**Dátum:** 19. november 2026  
**Stav:** SQL súbor je pripravený v aktívnom `drizzle/` migračnom reťazci a má Drizzle modely. **V produkčnej D1 ešte nebol spustený.**

Táto etapa implementuje architektonický kontrakt z PR #1450:
- Jeden SQL vlastník pre verejné aj samostatne editované údaje.
- Žiadne nové paralelné JSON polia.
- Existujúce SQL riešenia nezdvojovať.
- Obsahové historické hodnoty možno neskôr znovu vyplniť; identifikátory, funkcie a zámky nepoškodiť.

## Čo sa v D1 pripraví

| Nová tabuľka | Úloha | SQL model |
| --- | --- | --- |
| directory_profile_qualifications | Kvalifikácie/certifikáty; jeden riadok na položku, poradie | profile_id, item_order, qualification_text |
| directory_profile_opening_hours | Otváracie hodiny; 1 = pondelok, 7 = nedeľa, 0 = všeobecná/špeciálna poznámka | profile_id, day_of_week, hours_text |
| directory_profile_media | Galéria, R2 kľúč alebo URL, poradie, ALT, zdroj | profile_id, item_order, image_url, image_key, alt_text, attribution_text |
| directory_profile_seo | Samostatne upraviteľné SEO a OG polia | profile_id + SEO polia a noindex |
| directory_profile_review_state | Odkontrolované, zamknutie synchronizácie, odomykanie | profile_id, reviewed_at/by, unlock_pending, unlock_requested_at/by |
| directory_profile_quality_resolutions | Výsledky kontroly kvality po jednotlivých poliach | profile_id, quality_field, resolution_status, checked_at |

Všetky majú väzbu na directory_profiles(id) s ON DELETE CASCADE, zodpovedajúce indexy a tam, kde sú použité, databázové CHECK obmedzenia. Nepridávajú ďalší kanonický zdroj k tej istej hodnote: až nasledujúce PR ich zapoja do Admin/Notion/public.

## Čo už existuje a NEVYTVÁRAME znova

- directory_profile_additional_categories — viac kategórií profilu.
- directory_profile_public_facts — doplnkové textové fakty.
- directory_profile_filter_values — kategóriové filtrovanie.
- service_profile_option_choices a Services V3 katalóg — služby áno/nie.
- breed_directory_relations a directory_breeder_club_relations — plemenné/klubové vzťahy.
- directory_profiles — názvy, perexy, popisy, adresy, kontakty, základné statusy.

## Migrácie 0171 a 0172 sú už vyriešené

Partnerský systém #1437 má vyhradené migrácie:
- 0171_partner_single_manager.sql
- 0172_partner_help_claim_ownership.sql

Migrácie 0171 a 0172 sú už fyzicky nasadené v produkčnej D1 podľa úspešných, chránených GitHub Actions postflight behov z 19. 11. 2026. Ich SQL súbory sú na `main`, preto je možné 0173 zaradiť priamo do `drizzle/`. Neznamená to automatické nasadenie do D1.

**NESPÚŠŤAŤ 0173 na produkcii**, kým:
1. Nie je opätovne overená fyzická schéma a migračná história produkčnej D1, najmä neexistencia objektov 0173.
2. Nie je vytvorený samostatný **owner-dispatched** chránený preflight/audit/apply postup pre presne 0173 s obnovovacím bodom pred DDL.
3. Vlastník neschváli jeho manuálne spustenie.

PR #1437 môže zostať Draft; schéma 0173 nemá cudzie kľúče ani iné väzby na nové partnerské objekty.

Doterajší produkčný migračný ledger bol čiastočne nesúvislý; nepúšťať generické migrácie, ktoré by sa pokúšali automaticky prehrať staršie súbory. Pridanie 0173 do git main neznamená jeho nasadenie.

## Čo tento PR NEROBÍ

- Žiadne CREATE na produkčnej D1, žiadne zmazanie JSON ani starých SQL stĺpcov.
- Žiadna úprava čítania/zápisu verejného webu, Admin, Notion webhooku, partnera, Gemini alebo Quality automatizácie.
- Žiadny automatický import Notion → SQL.
- Žiadne zásahy do Odkontrolované: súčasný lock zostáva fungovať cez doterajšie mechanizmy.
- V existujúcich sql/JSON tabuľkách žiadny UPDATE/DELETE; žiadne zmeny identifikátorov.

## Najbližšie technické fázy

1. Samostatný chránený preflight a migrácia 0173; poradie 0171–0172 už bolo vyriešené.
2. Zapojenie Admin/Notion/partnera do nových SQL tabuliek a existujúcich SQL public_facts/filter/additional-categories; explicitná úprava/prazdná hodnota = platný zápis.
3. Vypnutie všetkých JSON fallbackov a ukladania do source_data_json, services_json, qualifications_json a seo_json.
4. Voliteľný jednorazový import Notion → SQL, kontrola funkčnosti oboch smerov a verejných stránok.
5. Samostatné finálne upratovanie; PR #1448 momentálne **Draft**, nie aktívna produkčná migrácia.

## Offline test

CI spustí node --test tests/directory-sql-0173-foundation.test.mjs na izolovanej SQLite databáze. Testuje tabuľky, obmedzenia, cudzie kľúče, duplicity, importné JSON hodnoty necháva bez zmeny a cascade vymazanie testovacieho profilu. Nie je potrebný Cloudflare token ani prístup k reálnej D1.
