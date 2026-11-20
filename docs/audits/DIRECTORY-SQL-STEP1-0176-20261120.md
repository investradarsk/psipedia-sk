# Psipedia Adresár – krok 1/4: úplná SQL štruktúra podľa Adminu

Dátum: 20. novembra 2026. **Iba štruktúra + testy. Žiadny produkčný presun, žiadne zmazanie JSON.**

## Čo už existovalo v D1

| Pole v Admine | Existujúce SQL úložisko |
| --- | --- |
| Názov, URL slug, kategória, stav, perex, popis, mesto, okres, kraj, adresa, PSČ, ulica, číslo, cena | `directory_profiles` |
| Web, telefón, e-mail, Facebook, Instagram, hlavný obrázok a jeho R2 kľúč, interný e-mail, overené/odporúčané | `directory_profiles` |
| Druhé kategórie | `directory_profile_additional_categories` |
| Výbery kategóriových filtrov | `directory_profile_filter_values` |
| Schválené textové verejné fakty | `directory_profile_public_facts` |
| Kvalifikácie | `directory_profile_qualifications` |
| Otváracie hodiny | `directory_profile_opening_hours` |
| Fotogaléria | `directory_profile_media` |
| SEO, OG, noindex | `directory_profile_seo` |
| Odkontrolované, požiadavka o odomknutie | `directory_profile_review_state` |
| Výsledky kontroly kvality | `directory_profile_quality_resolutions` |
| Katalóg Služby V3, výber plemien a klubov, partnerstvo a adresa Google Place | Samostatné existujúce relácie |

## Čo dopĺňa izolovaná SQL schéma

| Nové úložisko | Účel |
| --- | --- |
| `directory_profile_extra_fields` | Samostatný text/číslo/NULL pre redakčné a technické hodnoty bez existujúceho SQL poľa, napr. Zdroj dát, Zameranie alebo historický údaj kategórie |
| `directory_profile_extra_list_state` | Potvrdenie existencie zoznamu aj pri explicitnom `[]` |
| `directory_profile_extra_list_items` | Jednotlivé položky historických zoznamov, usporiadané poradím; žiadne JSON reťazce ako nové úložisko |
| `directory_profile_service_texts` | Pôvodný voľný text služieb, nezamieňať s nezávislým katalógom Služby V3 |
| `directory_profile_image_display_settings` | Samostatné `mode`, `x`, `y`, `zoom` pre miniatúru a detail |
| `directory_profile_sql_cutover_state` | Kontrolný záznam pre STAGED → VERIFIED → SQL_ONLY; žiadny profil nesmie byť SQL_ONLY bez overenia |

Zoznam v `lib/directory-admin-sql-field-owners.mjs` mapuje každé trvalé pole typu `ManagedDirectoryProfileInput` na SQL cieľ; pri pridaní nového Admin poľa test zlyhá, kým sa nenamapuje.

## Čo zámerne **nerobíme** v kroku 1

- **Žiadne produkčné D1 apply ani migrácia pri PR merge.** Nový SQL súbor existuje iba v GitHube, kým ho v kroku 2 nespustíme vlastným kontrolovaným postupom.
- Nevykonávame ani opakovaný import starých redakčných snapshotov; cieľom kroku 2 sú aktuálne redakčné údaje z Notionu a naň nenaviazané technické údaje z Adminu/D1.
- Neprepisujeme poslednú úpravu partnera alebo odkontrolovaného profilu. Všetky aktuálne SQL hodnoty a zámky zostanú nedotknuté.
- Nevypíname žiadne doteraz aktívne JSON čítacie alebo zápisové cesty. Zmiznú až po SQL writer/read cutover a produkčnej verifikácii.
- Štruktúra nesmie vytvoriť druhú autoritu pre SEO, kontakty, plemená, kluby alebo Služby V3. Nové `extra` tabuľky sú iba pre polia bez existujúceho kanonického vlastníka.

## Ďalšie tri kroky

**2/4 – Presun:** vytvoriť jeden kontrolovaný, opakovateľný Notion+Admin → SQL import. Pre každý profil overiť identitu, aktuálny zdroj, last-write-wins a ochranné zámky. Počet doplnených/nezodpovedaných polí sa zaznamená v `directory_profile_sql_cutover_state`. Čas zmeny z Notionu môže byť dostupný iba na úrovni stránky – nesmie sa automaticky považovať za presný čas zmeny každého poľa.

**3/4 – Prepnutie:** všetky verejné/administrátorské/partnerské čítania a zápisy aj Notion synchronizácia používajú SQL. Zmiešané publikovanie je zakázané, kým nie sú dokončené profily alebo bezpečný kompatibilný režim.

**4/4 – Overenie a čistenie:** porovnať hodnoty profilov, verejné vyhľadávanie a filtre, druhé kategórie, SEO a ochranné zámky. Až potom vypnúť staré cesty a odstrániť nepotrebné JSON stĺpce/kód. Rozlíšiť historické JSON od technických JSON v ostatných agendách.

## Testovanie

SQLite kontrakt v `tests/directory-0176-sql-schema.test.mjs` kontroluje schému, cudzie kľúče, atomické zoznamy a explicitné `[]`, typované image nastavenia, znemožnenie falošného SQL_ONLY a pokrytie všetkých `ManagedDirectoryProfileInput` polí. Nepristupuje k produkčnej D1 ani k Notionu.
