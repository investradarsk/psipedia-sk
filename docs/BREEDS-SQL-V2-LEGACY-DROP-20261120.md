# Plemená: dokončenie SQL-only a odstránenie štyroch historických JSON objektov

20. 11. 2026 bol používateľom potvrdený živý test Admin → Notion → Admin a
odstránenie testovacieho textu. PR #1480 a #1481 už aktivovali produkčné
SQL-only čítanie a zápis. Posledný SQL integrity audit skončil
`SQL_ONLY_HEALTHY` (347 plemien, 344 ACTIVE Notion prepojení).

Tento PR **sám nikdy nepúšťa DROP v produkcii**. Mení SQL-only vytvorenie
plemena tak, aby bolo kompatibilné s D1 pred aj po odstránení štyroch
NOT NULL legacy stĺpcov. SQL-only FCI import preview nečíta starý
`editorial_json`. Fyzické odstránenie sa spúšťa výhradne cez jeden
owner-only GitHub Actions workflow `Production D1 Breeds legacy 0175 (manual)`.

## Po zelenom CI a produkčnom deployi z main

GitHub Actions → Production D1 Breeds legacy 0175 (manual) → Run workflow:
- `mode=apply`
- `confirmation=APPLY-BREEDS-0175-FOUR`

Ten istý beh najprv vykoná aktuálny SQL integrity audit, fyzický preflight
4 legacy stĺpcov, overí počty, FK a SQL polia, vyžiada D1 Time Travel
bookmark, vykoná **len** štyri `DROP COLUMN` z 0175 a overí postflight.

Odstraňujeme: `fci_standard_json`, `editorial_json`,
`related_breeds_json`, `seo_json` z `managed_breeds`.

Zachovávame: `gallery_json`, `sports_json`, `health_risks_json`,
`good_for_json`, `consider_json`, `sources_json` a ďalšie skutočné
zoznamy; SQL tabuľky, 347 záznamov, 344 Notion prepojení, tri ďalšie
plemená a per-field LWW synchronizáciu.

Nie sú potrebné žiadne generické migrácie, jednorazový import z Notion,
ďalší backfill ani mazanie záznamov. Po DROP sú staré off/shadow fallback
režimy iba historická testovacia cesta a v produkcii sa nesmú zapínať.
