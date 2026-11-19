# Adresár – krok 6/8: atómové dokončenie historického owner unlocku

## Problém
Po PR #1464 sú pri bežnom zaškrtnutí/odškrtnutí `Odkontrolované` Adminom aj pri zrkadlení checkboxu z Notionu `directory_profile_review_state` (SQL 0173) a historické `source_data_json` aktualizované v jednej D1 transakcii. **Historický výnimočný finalizátor** `completeDirectoryReviewedOwnerUnlock` však po potvrdenom zápise do Notionu odstraňoval z JSON `_psipedia_profile_review_unlock_pending` samostatným `UPDATE`, bez zrkadlenia 0173. SQL príznak tak mohol zostať v stave `unlock_pending=1` aj po úspešnom dokončení.

## Oprava
- Až po overení identity mapovania a kontrolného poľa `Odkontrolované=false` v aktuálnom Notione sa vykoná vlastný owner-authorized `writeProfileToNotion`.
- Potom sa zo staršieho aktuálneho D1 snapshotu odstráni **iba** `_psipedia_profile_review_unlock_pending`; ostatné zdrojové polia sa zachovajú.
- Jediná `D1.batch` obsahuje:
  1. Kanonický `UPDATE directory_profiles.source_data_json` s presným `id`, pôvodným `source_data_json` a `updated_at` (CAS).
  2. `directory0173ReviewCasGuardStatement`, ktorý pri nule aktualizovaných riadkov vyvolá SQL chybu a zruší celú transakciu.
  3. `directory0173ReviewSqlMirrorStatement`, ktorý pre **ten istý** schválený JSON a revíziu premietne `reviewed_at`, `reviewed_by` a `unlock_pending` do 0173.
- Neúspešný CAS nechá oba zámky nezmenené. SQL príznak nikdy nie je použitý ako dôvod na predčasné odomknutie.
- SQL `updated_at/updated_by` v revíznej projekcii zaznamená finalizáciu; kanonické `directory_profiles.updated_at` zostáva nezmenené, rovnako ako v pôvodnom finalizátore (nepredstierame ďalšiu redakčnú úpravu).

## Bezpečnostné hranice
Tento PR:
- Nevyvoláva `completeDirectoryReviewedOwnerUnlock` pre nové profily.
- Neobchádza zámok pri partnerovi a nemení prístupové práva.
- Neaktivuje SQL-only Notion lock ani čítanie, nemení `Odkontrolované` na klientovi.
- Nevykonáva hromadný backfill alebo mazanie JSON.
- Nevytvára ďalšiu migráciu (už nasadená SQL 0173).
- Nezavádza falošný `last-write-wins` zo všeobecného `updated_at` profilu; pri nejednoznačnom súbehu je stále bezpečný konflikt.

## Testy
`tests/directory-sql-0173-reviewed-lock.test.mjs` overuje:
- Zhodné SQL/JSON odomknutie po potvrdenom Notion writebacku.
- Zachovanie ostatných polí a nezávislého profilu.
- Stale CAS = rollback, ponechaný pending lock.
- Poradie krokov a prítomnosť oboch 0173 CAS/mirror príkazov v existujúcom finalizátore.

**Stav celkovej migrácie:** krok 6 je čiastkovo dopĺňaný; nezávislá per-field revízia zostáva potrebná pre automatické rozhodnutie dvoch súbežných zmien toho istého poľa. Pred ďalším SQL-only cutover musí existovať inventár D1 #1466 a pripravený plán bezpečného uplatnenia.
