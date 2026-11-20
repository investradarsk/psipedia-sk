# Adresár – Notion field event → SQL 0173 (20. 11. 2026)

## Prečo
Po importe 1 829 profilov z Notionu do Cloudflare D1 a po SQL-first prepnutí detailov/Adminu (PR #1479) ostal jeden nesúlad:
`saveBreederEditorialValue` vo `lib/notion-directory-sync.ts` pri prichádzajúcom podpísanom Notion field-evente prepisoval **len** `seo_json` alebo `qualifications_json`. Nové SQL-first čítanie však už berie `directory_profile_seo` / `directory_profile_qualifications`. Čerstvá úprava z Notionu by tak bola neviditeľná a ďalší Admin save by ju mohol prepísať.

## Úprava
- V **existujúcej** exact-field synchronizácii sa podpísaná zmena kvalifikácií/SEO, vrátane `noindex=false` a výslovného vymazania kvalifikácií, uloží do D1 spolu s kompatibilnou hodnotou v **jedinej D1 `batch` transakcii**.
- Znovu sa používa existujúci `planDirectory0173EditorialSqlMirror` a identita `profile_id + updated_at + updated_by`; nevzniká ďalší nový systém, migrácia ani externý backfill.
- Pri zmene **jediného SEO poľa** sa do sidecaru prenesie kompletný aktuálny SQL-first SEO snapshot s upraveným jedným poľom, aby sa nezmazali ostatné polia. Notion nezískava prednosť nad novšou D1 revíziou.
- Neúspešné `updated_at` CAS zruší celú transakciu (zámerne fail-closed kontrola `changes()=1`) – SQL a kompatibilný JSON sa nemôžu rozísť.
- Kontakty, adresy, služby Services V3, galérie, chránené a archivované profily zostávajú bez zmeny.
- Testuje sa **reálna SQLite transakcia**, oba SQL sidecary, explicitné clear, `noindex=false`, zachovanie SEO a spätný rollback pri zastaranom Notion evente; plus existujúce testy vo všetkých 10 kategóriách.

## Nasledujúce zostávajúce kroky
Toto **ešte nie je odstránenie starého JSON**. `source_data_json` stále drží časť interných metadát vrátane reviewed/partner kompatibility, trénerov a niektorých verejných faktov; čítania zoznamov/filterov a niektoré synchronizačné vetvy majú fallback. Pred SQL-only odstránením treba kompletne overiť všetkých writerov/readerov a explicitne prázdne hodnoty.

Nezapínať mazanie JSON ani nespúšťať jednorazový import opäť. PR nepotrebuje žiadny manuálny SQL príkaz v Cloudflare Console.
