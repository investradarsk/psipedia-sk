# PSIPEDIA.SK — Bod 4: Filtre, tabuľky, stránkovanie a výber

**PR:** #1056 · nadväzuje na audit bodu 1, body 2–3 a existujúci merged #1040.  
**Rozsah:** iba zrušenie duplicitných implementácií so zhodným kontraktom.

## Implementované zjednotenie

| Kde | Pôvodná duplicita | Spoločný kontrakt | Zachované správanie |
| --- | --- | --- | --- |
| Adopcie + Stratené/nájdené | Rovnaký algoritmus sedemstranového numerického pagination okna a vlastné JSX | `AdminNumberedPagination` v existujúcom `components/admin-pagination.tsx`, čisté `adminNumberedPageWindow` v `lib/admin-list-query.ts` | Rovnaké čísla strán, šípky, `styles.pagination`, linky cez pôvodné `adminHref` / `href` |
| Adopcie + Stratené/nájdené + Pomoc psom (Help) | Opakované skladače `URLSearchParams` s prevádzkovou redundanciou | `adminFilteredListHref` — serializácia neprázdnych hodnôt, stránka `page>1` | Rovnaký poriadok a názvy `q, status, freshness, breed, region, locality, sort, type`, rovnaké kódovanie URL a vynechanie defaultných hodnôt. Agendy naďalej určujú vlastné pravidlá |
| Adopcie + Stratené/nájdené | Opakované `<div className=... role="region" aria-label=... tabIndex={0}>` | `AdminDataTableRegion` | Rovnaké CSS, presne rovnaký výsledný HTML wrapper, klávesnicový scroll; stĺpce a práva editorov sa nemenia |
| Podujatia + Pomoc psom | Vlastný checkbox celej stránky vrátane opakovanej indeterminate/checked logiky | Existujúci `BulkSelectionCheckbox` z `admin-bulk-selection.tsx` | Rovnaké označené ID, povolenie/zakázanie, výber iba načítaných položiek, reset pri zmenách a presná serverová preflight kontrola |

## Čo sa NESPÁJA naslepo

- **Bulk selection:** `useAdminBulkSelection` má podporu `all-matching` a `sessionStorage`. Podujatia aj Help využívajú výhradne explicitný `Set<number>`, iné prevádzkové preflight endpointy a snímky verzií. Prevzatie celého shared hooku by zmenilo rozsah mutácií. Preto je zjednotený iba checkbox, **nie** doménové výberové stavy.
- **Filtre:** Podujatia používajú klientske filtre s asynchrónnym `/api/admin/events`, GET zoznamy adopcií/hlásení serverové query parametre. Nezjednocujú sa do jedného vykonávacieho mechanizmu.
- **SQL stránkovanie a diakritika:** `positiveInteger` v `lib/admin-event-pagination.ts` používa prísne číslice a horný limit 1 000 000, kým `boundedAdminPage` má iné pravidlá; podobne `foldSql` a `sqlFoldAdminText` používajú rôzne SQL kontrakty. Bez dôkazu rovnocennosti sa nemenia; toto **nie je otvorená duplicita spoločného UI komponentu**.
- **Tabuľky:** Rozličné stĺpce, lifecycle a riadkové akcie sú doménové a nemajú sa prevádzať na jednu univerzálnu schému. Štýl tabuľky už zdieľa `admin-data-table.module.css`.

## Akceptácia

Regresný test: `tests/admin-lists-unification-point-4.test.mjs`. Obsahuje ekvivalenciu starých stránkových okien pre 1–100 strán, GET URL kódovanie, zachovanie defaultov a parametrov, explicitný výber a zachovanie table region/accessibility. Spúšťať s Node 24:

```bash
node --experimental-strip-types --test tests/admin-lists-unification-point-4.test.mjs
```

Spoločné CI workflow je rozšírené o tento test. Neobsahuje žiadne runtime zmeny API ani D1/R2/Notion/Gemini.

**Plán:** 1–4 implementované vo vetve #1056; bod 5 (odstraňovanie nepoužitého kódu, finálna regresia a merge readiness) zostáva nezačatý. CI a konflikty voči `main` je nutné overiť na najnovšom head pred merge.
