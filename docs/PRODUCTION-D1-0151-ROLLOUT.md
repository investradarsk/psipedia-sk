# PSIPEDIA.SK – chránené produkčné nasadenie D1 migrácie 0151

**Rozsah:** zapnutie histórie zmien pre administrátorské sekcie a ich obrázkové hlavičky. Nemení služby, články, profily, Notion autoritu ani verejný mobilný vzhľad.

## Čo presne sa mení

- Existujúci súbor `drizzle/0151_admin_content_revision_history.sql` zostáva **bez úprav**.
- Pridá sa jedna tabuľka `admin_content_revision_history`, jeden index a šesť SQL triggerov.
- Triggery zachytávajú zmeny na `portal_section_settings` a `section_visuals`; zakazujú zmenu a mazanie auditných revízií.
- Migrácia neobsahuje `UPDATE`, `DELETE`, ani backfill existujúcich profilov či sekcií. História začne iba od nasadenia.
- Schválený SHA-256 súboru SQL: `fa660b6c0487118aed66b5e3a3c8e532e6a592e853013f318e588a2ceeb72cc4`.

## Bezpečnostné podmienky

- **GitHub PR merge NESPÚŠŤA produkčnú migráciu.** Nie je na to žiaden push/PR/scheduled trigger.
- Existujúce `Production D1 Migrate` GitHub Actions sa spúšťa **iba manuálne z `main`** a vyžaduje produkčné prostredie s chráneným tokenom.
- Operátor musí zvoliť presný SQL súbor a potvrdenie `APPLY-0151-psipedia-sk-db`.
- Preflight pred zápisom preukáže správny Cloudflare účet a kanonickú databázu `psipedia-sk-db`, presnú postupnosť uložených migrácií **cez `0150_gemini_import_review_notes.sql`**, neexistenciu čiastočných auditných objektov, správne stĺpce oboch zdrojových tabuliek a D1 Time Travel bookmark.
- Runner **pred jediným zápisom** zopakuje kontrolu databázovej histórie a schémy, aby neprepisoval cudzie súbežné zmeny.
- Postflight overí presné SQL objekty 0151, auditné triggery, nezmenenú historickú D1 postupnosť okrem pridania jedinej migrácie a existujúce migračné invariants.
- **Opakovaná produkčná aplikácia 0151 je zakázaná.** Ak už v histórii figuruje, preflight zlyhá namiesto ďalšieho zápisu.
- GitHub Actions produkčnú migráciu nespustí, ak `0150` ešte **nie je skutočne aplikovaná** alebo je databázový stav neočakávaný.

## Čo urobiť po úspešnom merge prípravného PR

1. Otvoriť [GitHub Actions – Production D1 Migrate](https://github.com/investradarsk/psipedia-sk/actions/workflows/production-d1-migrate.yml).
2. **Run workflow** → branch `main`.
3. Vybrať `target_migration` = `0151_admin_content_revision_history.sql`.
4. Do `confirmation` presne vložiť **`APPLY-0151-psipedia-sk-db`**.
5. Potvrdiť spustenie. Ak prostredie `production` vyžaduje approval, schváliť až po kontrole cieľa.
6. Skontrolovať zelený **Preflight → Apply → Verify**. Ak preflight nahlási chýbajúcu `0150` alebo schema drift, **neobchádzať ochranu** a nič ručne nevykonávať.
7. V administrácii `/admin/sekcie` a `/admin/sekcie/vizualy` otvoriť panel história. Po jednej skúšobnej úprave sekcie skontrolovať, že sa pridala revízia a funguje návrat **poslednej** nezmenenej úpravy. Nepoužiť na to ostrý obsah bez predchádzajúcej kontroly.

### Čo pred nasadením ešte nemôžeme potvrdiť

Tento PR a offline CI nečítajú živú produkčnú D1. Preto **nepotvrdzujú**, či je `0150` už v produkčnom migračnom denníku, či má D1 dostupný obnovovací bod ani či sa 0151 skutočne vykonala. To zisťuje chránený workflow pri spustení.

V prípade chyby preflight alebo verify **žiadne manuálne SQL ani Time Travel restore bez samostatného vyhodnotenia**. Požiadavka na obnovovací bod neznamená, že rollback celej D1 sa má vykonávať automaticky.

### Poznámka k dátam a Notion

D1 história sleduje iba sekcie a hlavičkové vizuály. Nemá žiadne zápisy do Notion, článkov, služieb, adopcií ani podujatí. Samotný audit nie je záloha databázy alebo médií v R2.
