# 0170 – Prvý reálny krok zjednotenia SQL polí adresára

Stav: pripravená **aditívna** migrácia a testy; produkčné D1 vykonanie, presun
hodnôt a prepnutie čítania/zápisu **nie sú** súčasťou tohto PR.

## Prečo práve adresár

Audit 18. 11. 2026 potvrdil všetkých 7 kanonických hlavných tabuliek a 2 539
existujúcich záznamov so zodpovedajúcimi Notion mapovaniami. `managed_events`,
`help_cases`, `help_organizations`, `adoption_dogs`,
`lost_found_dog_reports` a `managed_eshops` už majú zodpovedajúce SQL
tabuľky. Nevytvárať kópie ani ich nemigrovať len kvôli názvu kategórie.

`directory_profiles` už obsahuje spoločné profilové SQL polia, ale
`source_data_json` stále slúži pre štyri verejné kontakty, druhé kategórie,
vybrané textové fakty a 21 kategóriových select filtrov.

## Čo pridáva 0170

- Nullable kontakty `public_phone`, `public_email`, `facebook_url`,
  `instagram_url` v existujúcej `directory_profiles`.
  Sú to neobmedzené texty (bez URL/e-mail/telefón validácie).
- `directory_profile_additional_categories`: viac kategórií pre ten istý
  profil bez vytvorenia duplicít. Primárna kategória zostáva v
  `directory_profiles.category`.
- `directory_profile_public_facts`: jeden riadok na schválené redakčné
  textové pole a profil, bez plemien/klubov/Services V3.
- `directory_profile_filter_values`: jeden riadok na filter a profil;
  validné kategórie a jedinečnosť v SQL, presné filter ID/hodnoty v registri.

Všetky tri nové tabuľky pri prázdnej databáze aj produkčnom prechode začínajú
prázdne. **NULL alebo chýbajúci riadok znamená nemigrované / nezistené;**
`''` znamená zámerne vymazané a nesmie ho obnoviť historický JSON.

## Čo zostáva nezmenené

- Karty, filtre, vyhľadávanie, verejné profily, Admin aj Notion pokračujú
  v doterajšom čítaní/zápise – zatiaľ **bez zmeny správania**.
- `source_data_json`, Services V3, adresy, galérie a vzťahy na plemená/kluby
  sa nevymazávajú.
- Podujatia, Pomoc psom, e-shopy a ich Notion mapovania sa nemenia.
- Štyri osirelé organizačné Notion väzby sa týmto PR neriešia a
  neobnovujú ich kanonické organizácie.

## Produkčné nasadenie je blokované, kým neexistuje vlastný bezpečný postup

Migrácia `0169_directory_breeder_club_relations.sql` bola na produkcii
aplikovaná samostatným chráneným postupom. Staršie objekty `0163–0168`
existujú, ale história `d1_migrations` neodpovedá plnému súboru objektov.
**Nespúšťať štandardné `wrangler d1 migrations apply` ani všeobecný
Production D1 Migrate pre 0170**: mohol by sa pokúsiť prehrať už existujúce
schémy. Nevypĺňať chýbajúcu históriu naslepo.

Pre 0170 treba samostatný chránený workflow s fyzickým preflightom
schémy a histórie, presne pripnutým SHA SQL, recovery bookmarkom,
jednorazovým vykonaním len 0170 a read-only postflightom. Až potom
schváliť riadený backfill s rozlíšením chýbajúcej vs. explicitne
vymazanej hodnoty; následne zapojiť všetky Admin/Notion/partner zápisy,
verejné čítanie a E2E všetkých desiatich kategórií.

Tento PR je krok **SQL štruktúra**, nie kompletná produkčná unifikácia.
