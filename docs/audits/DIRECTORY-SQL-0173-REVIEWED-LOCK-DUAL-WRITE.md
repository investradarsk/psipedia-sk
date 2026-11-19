# Adresár — krok 3/8: `Odkontrolované` a bezpečný SQL 0173 review lock

## Prečo iba prechodný SQL zápis
Migrácia `0173_directory_structured_sql_foundation.sql` je už nasadená; `directory_profile_review_state` dnes ešte nie je naplnená historickými review stavmi. Prípadné `NULL` / chýbajúci riadok preto **nesmie znamenať odomknutie**.

**Existujúca `source_data_json` review kontrola a kontrola aktívneho partnerského účtu naďalej rozhodujú o tom, či Notion smie písať.** Tento PR nespína SQL-only čítanie, nevymazáva staré review kľúče a nespúšťa hromadný backfill.

## Transakcie

- **Admin checkbox:** `setManagedDirectoryProfileReviewed` najprv CAS aktualizuje existujúce `directory_profiles.source_data_json`, `updated_at`, `updated_by`. V **rovnakej D1 batch transakcii** sa projektuje nový `directory_profile_review_state` riadok. Výslovné odškrtnutie zapíše `reviewed_at=NULL` a `unlock_pending=0` v oboch projekciách, ale zostáva zakázané počas aktívneho partnera.
- **Notion checkbox mirror:** `saveReviewedAndBaseline` ukladá iba aktuálny baseline (a ak je naozaj schválené zmenu review stavu z Notion, daný review stav); zrkadlo číta **nový** JSON po CAS. Neprebíja stav Adminu zastaranou Notion hodnotou. Staršie nechcené `unlock_pending=1` zostáva uzamknuté.
- **Partnerské prevzatie:** oba schvaľovacie priechody (vytvorenie profilu aj priradenie existujúceho) zapisujú `partnerDirectoryReviewLockStatement` a následne SQL 0173 mirror **v tom istom** chránenom moderation batchi po vytvorení členstva. Existujúce manuálne `reviewed_at`/`reviewed_by` sa nenahrádzajú novými.
- **CAS fail-closed:** medzi kanonickým UPDATE a SQL mirrorom je databázová kontrola `changes()=1`. Ak CAS neaktualizoval presne jeden riadok, úmyselne zlyhá SQL príkaz a celá `D1.batch` transakcia sa vráti späť.
- **Idempotencia a presnosť:** SQL mirror číta fixné JSON kľúče z práve aktualizovaného kanonického D1 riadku. Admin/Notion mirror vyžaduje zhodu `profile_id`, presného JSON textu a `updated_at`; partner mirror vyžaduje aktívne členstvo konkrétneho schváleného účtu.
- `unlock_requested_at` a `unlock_requested_by` zostávajú `NULL`, pretože historický `unlock_pending` má iba príznak bez overiteľného času a aktéra. Žiadne falošné dátumy.

## Prevádzková bezpečnosť
- **Žiadne nové SQL migrácie.** 0171/0172 patria partnerským účtom a 0173 je už nasadená.
- **Žiadna zmena verejných alebo Admin čítačiek.** `rowToManagedProfile` a `directoryProfileNotionSyncLocked` zostávajú podľa predchádzajúcej autority.
- **Žiadny automatický produkčný cleanup, SQL backfill ani prechod na nové čítanie.**
- Existujúce staršie odkontrolované profily bez SQL 0173 záznamu zostávajú bezpečne uzamknuté. Pred konečným SQL-only cutover musí byť samostatný read-only audit a spätné naplnenie po skupinách.

## Kontrola po merge
1. Zaškrtnúť v Admin `Odkontrolované` na testovacom profile bez aktívneho partnera. Review SQL a legacy JSON majú rovnaký `reviewed_at` a `reviewed_by`.
2. Zmeniť v Notione ľubovoľné redakčné pole; odmietnutie musí zostať ako doteraz.
3. Odškrtnúť v Admin. SQL `reviewed_at` sa zmení na `NULL`, `unlock_pending=0`; Notion checkbox mirror zostáva izolovaný.
4. Pri aktívnom partnerovi odškrtnutie v Admin musí skončiť konfliktom bez SQL/JSON zmeny.
5. Staršie profily bez SQL záznamu musia byť stále kontrolované podľa JSON/partnera.
6. V schválenom partnerskom návrhu overiť review SQL, legacy JSON a existujúce členstvo v rovnakej transakcii; bez schváleného člena sa SQL záznam nevytvorí.

**Krok 3 znamená pripravené a pokryté SQL prechodné zápisy, nie úplné odstránenie review JSON.** PR #1448 zostáva odložený do záverečného auditu krokov 7–8.
