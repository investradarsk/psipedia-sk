# D1 0123/0124 — bezpečný preflight a odovzdanie

**Rozsah:** Migrácie `0123_event_organization_structured_address.sql` a `0124_gemini_notion_review_locks.sql`. Tento PR poskytuje iba read-only kontrolu. **Nevykonáva produkčný D1 zápis, migráciu ani aktiváciu prepared targetov.**

## Repo kontrakt

- 0123 je čisto additive: `managed_events` dostáva `district, postal_code, street, house_number, address_format`; `organization_locations` dostáva `postal_code, street, house_number, address_format`. Všetky nové polia `TEXT NOT NULL DEFAULT ''`, s explicitným CHECK na `address_format`. Žiadny backfill, Google/GEO mutation, public model change. Opakovaný raw ALTER by zlyhal.
- 0124 pridáva len `gemini_notion_review_locks` s `notion_page_id` TEXT primary key, `owner` a `created_at` TEXT NOT NULL. Samotné `IF NOT EXISTS` nie je dôvod manuálne manipulovať ledger.
- SQL sekvencia je 0000–0124, Drizzle journal a snapshoty zostávajú zmrazené na 0023 (MIG-0). Nemeniť Drizzle meta/generate.
- Produkčný runner `scripts/production-d1-migrate.mjs` a jeho chránený workflow zámerne podporujú len do 0122. Obe novšie SQL súbory sú **prepared, nie supported**. Runner zatiaľ nemá `schemaState`, `targetSchemaObjects` ani `assertTargetSchema` pravidlá pre 0123/0124; pridať ich do choices bez ďalších guardov je zakázané.
- 0124 nemá SQL závislosť na adresných poliach, ale má povinné číselné poradie až po 0123.

## Ako overiť živú D1 bez zápisu

Po **manuálnom merge** tohto PR v GitHub Actions spustiť **Production D1 0123-0124 Read-only Preflight**, branch `main`, confirmation `AUDIT-0123-0124-psipedia-sk-db`. Job používa chránený `production` environment, kanonické Cloudflare D1 ID, spoločný migračný concurrency lock a kontrolu aktuálneho SHA. Volá iba `wrangler d1 info` a `wrangler d1 execute --remote` so `SELECT` a `PRAGMA table_info`. Exportuje `.production-d1-0123-0124-preflight/report.json`. Chýbajúci token, nesprávna D1, poškodená schéma alebo história = explicitný STOP.

| Klasifikácia | Význam |
|---|---|
| `READY_0123` | História presne po 0122, nové adresné polia ani zámky nie sú |
| `READY_0124` | História presne po 0123, deväť adresných polí a obidva CHECKs sedí, lock tabuľka ešte nie je |
| `COMPLETE` | História presne po 0124 a obidve schémy sú úplné |
| `STOP_BACKLOG_BEFORE_0122` | Existujú staršie pending migrácie |
| `STOP_SCHEMA_HISTORY_DRIFT` | Nesúlad fyzickej schémy a ledgeru, čiastočné ALTER alebo zlé constraints |
| `STOP_HISTORY_DRIFT` | História nie je presný prefix repozitára |
| `STOP_FUTURE_HISTORY_REQUIRES_NEW_AUDIT` | Na produkcii už existujú novšie migrácie |
| `STOP_AUDIT_ERROR` | Nemožno dôveryhodne načítať živý stav |

Ručný read-only postup pre autorizovaného D1 operátora po overení kanonického ID:

```sql
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
PRAGMA table_info('managed_events');
PRAGMA table_info('organization_locations');
PRAGMA table_info('gemini_notion_review_locks');
SELECT name,sql FROM sqlite_schema
 WHERE type='table'
   AND name IN ('managed_events','organization_locations','gemini_notion_review_locks');
```

## Samostatný budúci rollout (nie súčasť PR)

1. Vyžiadať živý audit s výsledkom `READY_0123`, prípadne `READY_0124` alebo `COMPLETE`. Získať schválenie D1 operátora, zachytiť deployment SHA, kontrolu relevantných riadkov/počtov a D1 Time Travel recovery bookmark. Staršie pending migrácie alebo drift musia byť vyriešené osobitne.
2. Osobitný PR musí rozšíriť runner **súčasne** o supported targets, schema precondition/proof, partial detection, postflight invariants a chránené workflow choice/confirmation. Zachovať **scoped** migration directory; nedávať do apply celý `drizzle/`.
3. Na produkcii aplikovať **iba 0123** v schválenom procedurálnom okne. Hneď overiť ledger through 0123, typy/defaults/enum CHECK, počet a identitu eventov/lokalít, FK/primary a nezmenené GEO/privacy. Pri neúspechu STOP, nepokračovať na 0124.
4. Opakovať read-only preflight; požadovať `READY_0124`. Potom samostatne schváliť a aplikovať iba 0124. Overiť ledger through 0124, lock PK, `owner`, timestamp default.
5. Otestovať neškodný testovací Gemini koncept: read-only otvorenie, uloženie/reopen, zamietnutie/obnovenie, explicitné schválenie a až následne mapping/sync. Pre adresy najprv regresiu starých readerov, potom až v autorizovanej ďalšej fáze nové guarded writes.
6. Pri partial failure **nerobiť raw replay 0123, SQL history insert, DROP ani bulk delete zámkov**. Získať evidenciu, pozastaviť dotknuté zápisy a rozhodnúť o individuálnom remediation PR. Neistý Notion import: najprv skontrolovať Notion page a `directory_notion_sync`, potom prípadne odstrániť len konkrétny zámok s overeným ownerom podľa schváleného operator postupu.

**Recovery:** Additive polia je bezpečnejšie ponechať a vypnúť novú write cestu kompatibilným deployom než deštruktívne rollbackovať SQL. D1 Time Travel restore môže vrátiť **celú databázu**, takže vyžaduje samostatné schválenie a kontrolu všetkých medzičasových zápisov. Preflight `COMPLETE` potvrdzuje iba schému a ledger, nie plnú produkčnú funkčnosť.

Lokálne unit testy: `node --test tests/production-d1-0123-0124-preflight.test.mjs`.
