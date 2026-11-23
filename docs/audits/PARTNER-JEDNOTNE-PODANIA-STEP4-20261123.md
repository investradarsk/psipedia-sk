# Psipedia.sk — Partner podania — krok 4/8 (vlastníctvo a prevzatie)

Dátum: 23. 11. 2026. PR #1566 (Draft). Stojí na krokoch 1/8–3/8.

## 1. Nové profily: bez duplikátov a bez ručného claimu

Existujúci approval v lib/partner-canonical-workflow.ts používa jednu transakciu:
- Publikuje už založený kanonický D1 draft, nevytvára druhý profil.
- DIRECTORY_PROFILE, HELP_ORGANIZATION a MANAGED_EVENT: vloží partner_resources + rolu OWNER do partner_memberships pre pôvodné submitter_ref/accountId.
- ADOPTION_DOG, LOST_FOUND_DOG a HELP_CASE: vloží schválený partner_help_claims pre pôvodné accountId, kanonické ID a typ.
- Schválenie a pridelenie oprávnenia sú spolu v extraStatements volania applyAtomicModerationTransition; pri chybe sa nepotvrdí jedno bez druhého.
- Unikátne schválené help claims v 0172 zaručujú len jedného aktívneho externého správcu každého profilu; konflikty neprepisujú iného správcu.
- Serverové editory kontrolujú reálne OWNER oprávnenia a aktívny účet; zrušenie schváleného claimu ruší prístup, nie profil.

Krok 4 nemení tento fungujúci model ani nepridáva migráciu. Dopĺňa regresnú kontrolu zdrojových kontraktov a existujúcich D1 unikátnych indexov.

## 2. Staré hlásenia: bezpečné manuálne prevzatie

Existujúce hlásenie bez Partner účtu (napríklad Mia) má stále svoj kanonický lost_found_dog_reports riadok, PRIVATE údaje vo lost_found_dog_private_details a historické moderation_submissions. Tieto údaje sa NEPRENÁŠAJÚ ani NEPREPISUJÚ.

**Žiadosť vlastníka:**
1. Na aktívnom verejnom detaile je odkaz "Spravujete toto hlásenie? Požiadať o správu" s presným ID hlásenia.
2. Prihlásenie/registrácia zachová URL konkrétneho hlásenia.
3. Existujúci schválený OWNER sa pri kliknutí na rovnaký link presmeruje priamo do svojho Partner editora, bez novej žiadosti.
4. Inak Partner odošle existujúci claim. Formulár mu pripomína, že môže uviesť spôsob overenia, ale nesmie posielať heslá ani doklady.
5. Admin otvorí /admin/partners/claims/[id], odtiaľ má priamy odkaz na pôvodný /admin/stratene-najdene/[id] a súkromný chat účtu.
6. Ak je pôvodný zdroj reportu presne "Používateľské hlásenie", Admin musí pred schválením potvrdiť, že oprávnenie žiadateľa overil (napr. cez pôvodný súkromný kontakt); server vyžaduje boolean reporterIdentityVerified === true. Toto nie je automatické schválenie na základe emailu. Bez potvrdenia vracia 422, neudeľuje oprávnenie a ponechá PENDING.
7. Rozhodnutie je auditované v partner_audit_events s údajom o vykonanom overení (bez kopírovania súkromného kontaktu do auditu). Žiadosť možno zamietnuť bez overenia a schválenú správu neskôr odobrať; nič sa nemaže.

Všetky iné help claims (nový/organizáciou vytvorený záznam, adopcia a Pomoc psom) používajú pôvodné schvaľovanie. Mimoriadne potvrdenie je iba pre historické anonymné LOST_FOUND_DOG; nepridáva plošný ďalší krok do všetkých procesov.

## 3. Žiadna paralelná databáza ani automatické priradenie

- Neporovnáva sa len registračný email s historickým súkromným emailom: rovnaký údaj nie je dostatočný dôkaz vlastníctva.
- Nie je žiadna jednorazová DB migrácia starých záznamov na cudzie Partner účty.
- Pôvodné fotografie, public URL, private contacts, Admin editácia, Notion sync/review lock a open PENDING hlásenia ostávajú nezmenené.
- Verejný detail nečíta Partner session ani privátne údaje, takže bezpečná public cache zostáva funkčná.
- Odobratie oprávnenia zruší editor permission, nie verejný profil.

## 4. Regresné testy

- tests/partner-intake-step4.test.mjs: reálna lokálna SQLite/D1-like fixture s historickým a redakčným LOST/FOUND; admin source flag, žiadny únik PII, odmietnutie schválenia bez overenia, vlastník na rovnakej kanonickej entite, verejný CTA a Admin komunikácia.
- tests/e2e/lost-found-dogs.spec.ts: oba verejné detaily ukazujú CTA na presné kanonické ID 910001 alebo 910002 a nezobrazujú súkromné údaje.
- Zachované tests/partner-help-claims-step3.test.mjs a tests/partner-canonical-step4.test.mjs (single-owner index, aktívny účet, atomic publication).
- .github/workflows/partner-auth-ci.yml má explicitný krok na tri testy step2, step3, step4 s existujúcim cloudflare/admin-events loaderom. Workflows na Draft PR môžu bezpečnostné joby preskočiť; nezamieňať skip za pass.

Pre overenie v prostredí repozitára:
node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/partner-intake-step2.test.mjs tests/partner-intake-step3.test.mjs tests/partner-intake-step4.test.mjs

## Ďalšie fázy

5/8 — partnerská editácia a akcia "Pes sa našiel" (status lifecycle), vrátane bezpečného Notion mirror a cache.
6/8 — presné a deduplikované notifikácie o prijatí, schválení, vrátení, zamietnutí a správe.
7/8 — kompaktný jednotný Admin Podania a dopyty s prepojeniami do originálnych sekcií.
8/8 — full CI/E2E, D1 a Notion preflight, obmedzený bezpečný produkčný cutover.

PR #1566 zostáva Draft a nie je nasadený; pred merge prebehnú izolované E2E a produkčný preflight.