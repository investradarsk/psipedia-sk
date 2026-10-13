# ADDRESS-ADMIN-D1-3 — additive adresné polia

Base main: `32051ddbd07343e395d97e035b9805d873eba1e5`.
Migrácia: [0123_event_organization_structured_address.sql](../../drizzle/0123_event_organization_structured_address.sql).

## Schéma a kompatibilita

| Tabuľka | Nové stĺpce |
|---|---|
| managed_events | district, postal_code, street, house_number, address_format |
| organization_locations | postal_code, street, house_number, address_format |

Všetkých deväť stĺpcov je `TEXT NOT NULL DEFAULT ''`, podľa existujúcej directory
konvencie. Prázdny text znamená chýbajúcu hodnotu; interný kontrakt ho mapuje na
null. PSČ a číslo domu ostávajú text (`034 84`, `1127/21`, `12/A`).
`address_format` povoľuje iba `''`, `STREET`, `MUNICIPALITY_NUMBER`, rovnako ako
adresár. Drizzle schémy majú zodpovedajúce stĺpce a enum CHECK.

Migrácia obsahuje iba deväť ALTER ADD COLUMN statements. Žiadne UPDATE, INSERT,
DROP, rename, backfill, nové indexy, nový GEO systém alebo druhá adresa v
help_organizations. Prázdne defaults neodvodzujú technickú adresu z venue ani
verejného textu. Nezmení ID, role, primary, foreign keys, adresár, Google ID,
súradnice, fingerprinty, status, timestamps alebo privacy.

Režim ONLINE/PHYSICAL/SERVICE_AREA nedostáva nový preventívny stĺpec:
Online zostáva existujúci event region/city marker a SERVICE_AREA rola lokality.
Nové polia starého online eventu sú prázdne. Mode, confirmation a completeness
zostávajú odlišné pojmy; databázový ADD neznamená Google confirmation.

[db/schema.ts](../../db/schema.ts) a
[db/help-organization-schema.ts](../../db/help-organization-schema.ts) opisujú cieľovú
schému. Existujúce runtime queries/mappers, API, interné adaptéry fázy 2 a všetky
verejné komponenty zostali nezmenené. Nové fields sa zatiaľ nevystavujú do public
DTO ani nevkladajú do Notion, Google alebo editorových zápisov. Runtime používa
existujúce SQL a nie nové Drizzle select-all; migrácia nie je požiadavkou na
fungovanie dnešných readerov. Aktiváciu zápisov riešia ďalšie fázy.

## Migračné nástroje a deploy

Repo používa hybridnú D1 SQL históriu: nové reviewed SQL súbory sa pripájajú
kontinuálne, Drizzle journal/snapshoty zostávajú zmrazené na 0023 podľa
[MIGRATION-SAFETY-SK](../MIGRATION-SAFETY-SK.md). Negenerovať Drizzle meta a
nemeniť historical SQL. V aktuálnom main bol posledný SQL index 0122; nový je 0123.
Pred merge znova skontrolovať kolíziu čísla pri paralelných PR.

**Podľa kontrolovaného kódu sa produkčné migrácie po merge automaticky neaplikujú.**
[deploy-cloudflare-safe](../../scripts/deploy-cloudflare-safe.mjs) v Workers Builds
vetve iba deployuje pripravený artifact; manuálna vetva má build/read-only audit/deploy.
Ani jedna nevolá remote migrations apply. Workflow
[Production D1 Migrate](../../.github/workflows/production-d1-migrate.yml) používa
workflow_dispatch, production environment a explicitnú confirmation. CI apply
v ostatných workflowoch je `--local`; nejde o produkciu.
Skutočné nastavenia Cloudflare dashboardu/secrets a živá migration history neboli
načítané, preto ide o potvrdenie repository pipeline, nie live konfigurácie.

0123 je zámerne iba **prepared**, nie production-activated:
[production-d1-migrate](../../scripts/production-d1-migrate.mjs) uvádza nový
`PREPARED_PRODUCTION_TARGETS`; existujúci `SUPPORTED_PRODUCTION_TARGETS` ani
workflow choices nemeníme. `prepareScopedMigration` pre 0123 explicitne zlyhá
pred konfiguráciou či provider requestom. Existujúce migration safety testy
účtujú aj prepared súbory, ale testujú, že prepared nie je supported.
Tým sa drží požiadavka nemeniť CI a nespustiť produkčnú migráciu.

Raw príkaz `wrangler d1 migrations apply --remote` nad celým drizzle adresárom
by napriek tomu zahrnul aj 0123 a prípadné staršie pending SQL. Taký príkaz nie
je odporúčaný postup a v tejto fáze sa nevykonal. Raw ALTER opakovane zlyhá na
existujúcom stĺpci; jednorazové apply riadi ledger `d1_migrations`. Pri čiastočne
aplikovanej schéme nepokračovať slepým replayom.

## Lokálne overenie

[test fixture](../../tests/address-admin-d1.test.mjs) používa existujúce repository
migrácie pre event/directory/organization/location/GEO a izolovanú in-memory SQLite
s foreign_keys ON. Nie je to kópia produkčných dát ani tvrdenie o celej produkčnej
histórii. Obsahuje physical a online event, štyri role lokalít, primary a Google/GEO
fixtures. Osem testov overuje:

1. Všetky pôvodné hodnoty, ID, FK, role, primary, indexy a celé GEO riadky identické.
2. Prázdne TEXT defaults, bez vymyslenej adresy z venue.
3. Postcode/house number text roundtrip bez zmeny public address alebo GEO.
4. Enum, NOT NULL, FK a primary constraints.
5. Staré SQL insert/update bez nových fields a presne deväť pridaných stĺpcov.
6. Skutočné existujúce event/location runtime readers pred/po vracajú identický kontrakt.
7. Drizzle defaults/columns/CHECK a absenciu duplicitných directory/parent polí.
8. Iba additive statements a odmietnutie raw replayu bez ledgeru.

Cielený beh spolu s migration-safety, production-d1-migration a deploy-safety:
**107/107 prešlo**. `npm run db:check-migrations`: SQL 0000–0123 konzistentná,
meta stále frozen 0023. Lint zmenených TS/MJS súborov prešiel.
`npm run build` prešiel vrátane artifact validation a jeho dvoch vstavaných
breed test skupín (14 testov). Plné npm test/E2E, remote D1/Notion/provider volania,
ručný deploy a produkčné migrácie neboli spustené. Živá schéma zostáva neoverená.

## Kontroly pred merge a pred fázou 5

Pred merge: skontrolovať diff deviatich fields, nové číslo migrácie, nulové zmeny
CI/public/runtime zápisov a zachovanie prepared-only stavu. Merge tejto fázy
sám neaktivuje nové adresné zápisy ani repository remote migration workflow.

Pred zavedením write cesty vo fáze 5 je potrebný osobitne autorizovaný rollout:

- Read-only inventár deployment SHA, D1 migration ledger a existujúcich stĺpcov;
  detekovať partial/manual drift a overiť presnú históriu cez 0122.
- Pripraviť existujúcim production migračným systémom preflight/postflight pre
  0123: všetkých deväť TEXT defaults, enum constraints, bez zmeny existujúcich
  rows/ID/FK/primary/GEO. Až v osobitnom rollout zadaní pridať supported target
  a workflow choice/confirmation. Nesmie sa oslabiť guard iba kvôli apply.
- Backup/recovery postup, bounded staging rehearsal a explicitná autorizácia
  produkčného apply. Aplikáciu a verifikáciu nevykonáva tento PR.
- Nová runtime write cesta musí mať schema gate a guarded server snapshot,
  potvrdenie Google, privacy/manual ochrany a recoverable source→GEO zápis podľa
  fázy 2; samotná prítomnosť stĺpcov nestačí.
- Fáza 4 Notion môže pokračovať nezávisle. Bez spoločného write ownership/schema
  kontraktu nezapájať nové fields do synchronizácie. Neštartovať ďalšie fázy automaticky.

## Rollback

Pred apply stačí neaktivovať prepared target. Po additive apply rollback používa
starý kompatibilný runtime a vypnutie prípadnej budúcej novej write cesty v
samostatne autorizovanom deployi; stĺpce ponechať. Nevykonať DROP, obnovu tabuliek
ani vymazanie migration ledgeru. V tomto PR nová runtime write cesta neexistuje,
preto rollback aplikácie nemusí meniť dáta. Ak budú neskôr v poliach nové hodnoty,
ponechať ich a riešiť prípadnú opravu osobitným auditovaným patchom, nie backfillom.

## Aktualizácia po CI a posune main

Vetva bola synchronizovaná s `4c742c27af86ea5b06e304943fd93d7689375093`
(merged Notion fáza 4, PR #789); jej dokumentácia zostala zachovaná.
Pôvodné CI D1/clean-chain/build kontroly prešli, všeobecný npm regression krok
zlyhal. Detailný GitHub job log bol z prostredia neprístupný (HTTP 403).

Lokálne sa reprodukovalo zlyhanie v `tests/event-listing.test.mjs`: po konci
fixture podujatí 2026-10-12 predvolené správne radenie minulých udalostí zmenilo
poradie ID, hoci pagination test očakával stále vzostupné poradie. Test teraz
používa explicitné `najblizsie` radenie a overuje rovnakú pagination/calendar
fixture pri hodinách 2026-10-11, 2026-10-13 a 2027-01-01. Runtime ani verejné
radenie sa nemení; samostatný default-order test stále kontroluje pôvodné pravidlá.

Po synchronizácii prešli regresné testové skupiny z npm test spustené postupne
bez opakovania už overeného buildu, vrátane opraveného event-listing testu;
107 migračných/deploy kontrol tiež prešlo znova. Artifact validation a lint
opraveného testu prešli. Nové CI sa nečaká a produkčné apply/deploy sa nevykonáva.
