# Podujatia: migrácia 0160 – kontrolný plán (zatiaľ bez APPLY)

**Stav:** review-only. Tento dokument nie je schválením produkčnej migrácie a PR #1237 žiadnu migráciu nespúšťa.

## Čo už existuje
- `drizzle/0160_event_contacts_admission.sql`: tri **aditívne** stĺpce `contact_phone TEXT`, `contact_email TEXT` a `admission_fee TEXT NOT NULL DEFAULT ''`.
- Admin editor a verejný detail už polia poznajú. `lib/event-store.ts` pred zápisom skontroluje fyzickú schému.
- Pred nasadením 0160 funguje zápis starých polí; pokus uložiť novú kontaktnú/vstupnú hodnotu sa odmietne s vysvetlením. Nikdy sa nesmie zahodiť bez upozornenia.

## Read-only preflight (vykoná vlastník v schválenom prostredí)
1. Skontrolovať správny Cloudflare D1 binding a databázu `psipedia-sk-db`.
2. Spustiť **iba SELECT/PRAGMA**:
   - `SELECT id, name, applied_at FROM d1_migrations ORDER BY id DESC LIMIT 20;`
   - `PRAGMA table_info('managed_events');`
   - `SELECT COUNT(*) AS total FROM managed_events;`
3. Preveriť, či migrácie `0158` a `0159` majú schválený a konzistentný stav. V `scripts/production-d1-migrate.mjs` sú `0158–0160` stále `UNACTIVATED_PRODUCTION_TARGETS`. Nie je dovolené preskočiť ani naslepo opakovať už aplikovanú migráciu.
4. Fyzické stĺpce musia byť **všetky tri prítomné** alebo **všetky tri neprítomné**. Čiastočný stav musí viesť k vyšetreniu, nie k ďalšiemu automatickému APPLY.
5. Záloha, kontrola migračnej histórie, SHA SQL a explicitné schválenie vlastníka sú podmienkou prípadného budúceho produkčného rollout-u.

## Budúci APPLY – osobitný úkon
Až po úspešnom preflighte a explicitnom súhlase vlastníka spustiť existujúci chránený produkčný postup. **Nepridávať** automatický `wrangler d1 execute`, `migrations apply` ani writeback do deploy pipeline len kvôli merge PR.

## Read-only postflight po schválenom deploy
- Overiť migračnú históriu a trojicu stĺpcov cez `PRAGMA table_info('managed_events');`.
- Overiť pôvodné záznamy: `admission_fee` má predvolenú hodnotu prázdny text, kontakty sú nullable.
- V izolovanom testovacom prostredí overiť vytvorenie konceptu, aktualizáciu a zobrazenie troch nových polí aj stiahnutie publikovaného podujatia do konceptu. Produkčné testovacie záznamy nevytvárať bez autorizácie.
- Podujatia aj služby používajú existujúce `PublicDetailLayout` a `DetailHeroActions`; kontaktné tlačidlá sú len doplnkom, nie novou šablónou.

**Regresie:** `node --experimental-strip-types --test tests/event-contacts-0160-compat.test.mjs` v lokálnej vývojovej kópii (nevyžaduje D1 ani produkčné poverenia).
