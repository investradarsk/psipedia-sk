# Adresár – krok 3/4: bezpečné zosúladenie po STAGED importe

Dátum: 2026-11-20. Súvisiace PR: #1489 (schéma) a #1491 (STAGED import).

## Produkčný stav z čítacieho SQL (poskytol vlastník)

- 1 847 profilov v `directory_profiles`.
- 1 842 `STAGED`, 0 `VERIFIED`, 0 `SQL_ONLY`.
- Bez SQL receipt: #75 (archived), #565 a #568 (tombstone), #1723 (aktívny), #1818 (archived/unknown podľa auditu, pred rozhodnutím ešte overiť).
- `source_revision` nesedí pri profiloch #118 a #231 – novší D1 zapisovač po prvotnom importe.
- Pri 755 profiloch prvotný import zaznamenal `needs_parity_review`; nie je to 755 potvrdených chýb.

## Čo rieši tento PR

**Bez zmeny produkčných Admin/verejných/partnerských/Notion čítaní či zapisovačov** poskytuje:

1. Jeden read-only owner-dispatched audit, ktorý porovná aktuálne D1 identity, stav receiptov a revízie s Notion. Výstup je agregovaný a obsahuje maximálne 30 interných ID v každej skupine, nie súkromné hodnoty.
2. Jedno owner-dispatched doplnenie iba aktívnych profilov **bez receipt** (očakávaný #1723), s kontrolou aktuálnej Notion revízie, D1 CAS, zámkov `Odkontrolované`, aktívneho partnera a tombstone. Zápis je výhradne aditívny do nových SQL sidecar tabuliek a `STAGED` receiptu; D1 canonical row ani Notion sa nemenia.
3. Prísny limit 30 aktívnych chýbajúcich profilov; keď sa rozsah medzičasom zmení, operácia odmietne náhodný full re-import.
4. Dva existujúce profily #118 a #231 sa *zámerne* neprepisujú starým snapshotom. Označujú sa ako `changedInD1` a vyžadujú verifikáciu skutočnej aktuálnej SQL/Notion hodnoty pri ďalšom safe writer cutover.

## Manuálny beh po zelenom CI a schválenom merge

GitHub Actions / `Directory SQL step 3 of 4 (reconciliation)`, vetva `main`.

- `mode=audit`, potvrdenie `AUDIT-DIRECTORY-SQL-STEP3-psipedia-sk-db`. Iba SELECT.
- Po kontrole reportu: `mode=repair`, potvrdenie `REPAIR-DIRECTORY-SQL-STEP3-psipedia-sk-db`. Má produkčný zápis do nových SQL tabuliek a vytvorí D1 time-travel bookmark.
- Znovu `audit`, kontrola `missingActive` a revízií.
- Pre prepnutie runtime je stále nutný field-by-field parity dôkaz, ochrana súčasných Admin/Notion/partner writerov a explicitný `VERIFIED` cutover. Toto nie je `SQL_ONLY` prepnutie.

## Čo zostáva

- Audit mapovania všetkých pôvodne označených 755 prípadov, pričom treba rozlíšiť chýbajúce voliteľné Notion polia, skutočný rozdiel služieb, chybné image-display údaje a zmeny počas behu.
- SQL-only obojsmerné služby, filtre, public cards, vyhľadávanie a úpravy v Admin/partner/Notion runtime; žiadne prepísanie novších polí starým JSON.
- Posun receiptov do `VERIFIED` len po kompletnom porovnaní a do `SQL_ONLY` len po overenom cutoveri.
- Až v kroku 4/4 odstránenie historických JSON fallbackov vrátane starého návrhu PR #1448. **Nespúšťať teraz.**
