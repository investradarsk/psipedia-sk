# Plemená – krok 3: produkčný postflight po 344/344 baselines

## Čo je pripravené
- Po inicializácii 344 nezávislých SHADOW receiptov v Admin → Plemená sa jednorazový zapisovač znovu vypne (`NOTION_BREED_WORKCOPY_BASELINE_ENABLED=false`).
- Nový synchronizátor (`NOTION_BREED_WORKCOPY_SYNC_ENABLED=false`) a aktivácia (`NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED=false`) zostávajú vypnuté; pôvodný synchronizátor zostáva zapnutý.
- `.github/workflows/production-breed-workcopy-postflight.yml` je **výlučne manuálny**, viazaný na produkčný environment a vetvu `main`. Používa rovnaké chránené Cloudflare/Notion tajomstvá ako overený Step 1 audit.
- **Žiadne zápisy** do Notionu, D1, public profilov, originálnych receipts, synchronizačných nastavení ani automatizácií.
- Prehliadka každého z 344 záznamov kontroluje identitu (Psipedia ID, FCI, slug), staré aj nové Notion page IDs, zdrojové databázy, hodnoty `SHADOW`, kompatibilitu oboch nezávislých per-field snapshotov a zaznamenanú revíziu pracovnej kópie.
- Rozdiely medzi snapshotmi Notion a Admin sa **neopravujú automaticky**. Ich počet je iba diagnostika; nejde o 20 640-bunkovú paritu medzi starým a novým Notionom.

## Spustenie po merge a nasadení

GitHub → Actions → **Production Breed Workcopy Step 3 Postflight (read-only)** → **Run workflow** na `main`:

```
confirmation = AUDIT-BREED-BASELINES-344
```

Počkaj na skutočné ukončenie jobu, potom zdieľaj link na run. Výsledok nájdeš aj v jeho JSON reporte `production-breed-workcopy-postflight-<run_id>`.

**Očakávanie:** `independentReceiptsCompatible=344`, `originalLinkIdentityMatches=344`, `workLinkIdentityMatches=344`, `savedNotionRevisions=344`, `activeOrVerifiedRows=0`, `rowsWithErrors=0`.

Dôležité upozornenie: pôvodná 109-poľová synchronizácia stále beží, preto sa jej `content_hash` alebo `last_synced_at` môže medzi krokom 1 a 3 legitímne zmeniť. Audit rozdiely **reportuje**, ale neprepisuje pôvodný historický snapshot ani nové baselines. Zmena revízie pracovnej Notion stránky po vytvorení baseline sa tiež iba nahlási. Pri ľubovoľnom drifte bude `readyForSeparateCutoverReview=false`; jeho príčina sa musí vyriešiť pred samostatnou aktiváciou.

**Nikdy nezamieňať `readyForSeparateCutoverReview` s `cutoverReady`: druhá hodnota v tomto audite zostáva vždy `false`.**

## Nasledujúci krok (len po vyhodnotení postflight)

Pripraviť bezpečný E2E test Notion → Admin a Admin → Notion pre jeden explicitne vybraný profil, izolovane a bez súčasného fungovania dvoch synchronizátorov. Osobitne preveriť médiá, vzťahy, športy a agregované JSON, ktoré starý 109-poľový model drží aj mimo 60-poľovej pracovnej kópie. Neprepínať naslepo produkčný data source a neobnovovať obe redakčné automatizácie pred cutover/rollback schválením.
