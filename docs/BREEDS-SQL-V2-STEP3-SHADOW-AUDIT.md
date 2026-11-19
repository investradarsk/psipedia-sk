# Plemená – krok 3/6: produkčný audit pred zapnutím shadow SQL

Záznam po merge PR #1460: v `main` je atómový dual writer, ale vo
`wrangler.jsonc` stále ostáva `BREED_SQL_V2_WRITE_MODE=off`.
Táto fáza **nerobí novú migráciu** ani neprepína verejné čítanie.

## Prečo nový workflow

Workflow `production-breed-sql-v2-backfill.yml` je striktne jednorazový.
Jeho audit správne vyžaduje **prázdne** cieľové tabuľky a po úspešnom
importe 5/5 ho preto nemožno znovu spúšťať ako kontrolu parity.

Nový `production-breed-sql-v2-shadow-audit.yml` kontroluje existujúce
naplnené tabuľky čisto cez `SELECT`:

- 347 parent plemien, 347 FCI a redakčných riadkov.
- 344 ACTIVE Notion D1 zrkadiel a 344 SQL `breed_public_facts`.
- Presné tri nezrkadlené IDs 5, 13, 14.
- 6 skupín legacy/SQL parity (FCI, editorial, SEO, facts, relations v oboch smeroch).
- 3 možné konflikty kontrolovaných FCI group/section/size proti aktuálnemu D1 parent.
- Čakajúce zápisy na Notion, chybné JSON zdroje a cudzie kľúče nových tabuliek.

## Spustenie

V GitHub Actions **Production D1 Breeds SQL v2 shadow parity (read-only)**:
branch `main`, confirmation `AUDIT-BREEDS-V2-SHADOW-347`.
Workflow sám končí `BLOCKED`, ak je čo i len jeden rozdiel. Sanitizovaný
report s počtami sa ukladá ako Actions artefakt; bez obsahu polí.

## Dôležité pravidlá

- Zelený audit je **nevyhnutný, nie postačujúci** na zapnutie flagu.
- GitHub audit číta D1 *zrkadlá* Notion, nie priamo živé Notion stránky.
  Pred spustením dual-write treba samostatne potvrdiť živé Notion synchronizácie,
  bezpečne pozastaviť konkurenčné úpravy a bezprostredne zopakovať parity audit.
- Keď `scalarParity` hlási rozdiely, **nevykonávať hromadný overwrite**.
  Zistiť najnovšiu zmenu každého konfliktového poľa; až potom opraviť.
- Až potom samostatný schválený PR/deploy mení presný flag na `shadow`.
  Následne produkčný CRUD test Admin, Notion a 12 controlled fields vrátane
  explicitných vymazaní a testu zastaraných verzií.
- Pri červenom výsledku **nezapínať shadow**. Pôvodný JSON a web fungujú ďalej.
- Krok 3/6 = dokončený až po produkčných testoch, nie po samotnom merge PR #1460.
- Krok 4/6 = verejné SQL čítanie; krok 5/6 = testy webu a SEO;
  krok 6/6 = kontrolované odstránenie nepotrebného starého JSON.
