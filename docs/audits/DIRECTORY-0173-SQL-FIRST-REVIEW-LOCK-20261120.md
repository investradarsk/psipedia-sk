# Adresár – bezpečný SQL-first zámok „Odkontrolované“ (20. 11. 2026)

## Stav
- Jednorazový import Notion → SQL D1 #44701314783: **1 829 / 1 829** spracovaných profilov.
- PR #1479: verejné detaily a Admin už pre hlavné editorial polia čítajú SQL 0173.
- PR #1482: podpisované Notion field eventy zapisujú SEO a kvalifikácie atómovo do SQL.
- Review stav **už má** SQL zrkadlo v `directory_profile_review_state` (0173), aktualizované v existujúcich Admin, Notion checkbox a partner schvaľovacích transakciách. **Historické SQL review riadky však stále nemajú preukázané úplné naplnenie**: chýbajúca SQL hodnota NESMIE znamenať odomknutie.

## Tento krok
`directoryProfileNotionSyncLocked` teraz vykonáva jeden read-only D1 SELECT nad kanonickým profilom + `directory_profile_review_state` + aktívnym partnerským členstvom + `admin_record_tombstones`.

Notion synchronizácia sa zablokuje, keď platí **ktorákoľvek** z podmienok:
1. Profil neexistuje alebo je archivovaný.
2. SQL `reviewed_at` je vyplnené.
3. SQL `unlock_pending=1`.
4. Historické `source_data_json` má `reviewed_at` alebo `unlock_pending=1` (ochrana starých profilov a prípadného rozporu).
5. Partner má aktívny `partner_memberships.revoked_at IS NULL`.
6. Existuje záznam o mazacom procese v `admin_record_tombstones`.

Tento krok je **SQL-first lock read, nie SQL-only cleanup**. Zámok sa nemôže uvoľniť pre prázdny alebo neúplný SQL záznam. Pri poškodenom JSON sa systém uzamkne chybou namiesto nekontrolovaného Notion zápisu. Neexistuje možnosť „prepisovať Notion podľa starého JSON“; JSON tu ostáva len bezpečnostná brzda proti strate review zámku.

## Prevádzka
- **Žiadna nová migrácia, žiadny SQL zápis, žiadny opakovaný import**.
- Nie sú zmenené služby Services V3, verejné profily ani pravidlá prideľovania partnerov.
- Regresné testy používajú skutočné SQLite a overujú: SQL reviewed, SQL pending, legacy-only reviewed/pending, chýbajúci SQL riadok, odvolané partnerstvo, tombstone, archive, poškodený JSON a explicitné bezpečné odomknutie.

## Zvyšok pred trvalým odstránením JSON
- Read-only produkčný audit SQL ↔ historického review stavu, vrátane všetkých chránených profilov a partnerov.
- Oprava chýbajúcich SQL review riadkov **iba po preukázanom audite**, nie odhadom.
- Prepnúť Admin UI review status, checkbox Notion sync a zvyšné reader/writer vetvy na SQL autoritu; zachovať kontrolu live partnerstva.
- Otestovať, že historické review kľúče sa už nikde nečítajú, až potom ich odstrániť.
- PR #1448 s cleanup starého JSON zatiaľ **nemergovať**.
