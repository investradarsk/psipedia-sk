# Adoption canonical cutover — safety preflight

Táto fáza nepridáva dátovú migráciu a nič nezapisuje do `adoption_dogs`. Checked-in manifest je deterministický prepis 36 riadkov `READY` z `psipedia_adopcie_slovensko_FINAL_2026-09-13.xlsx`; štyri `HOLD` slugy sú samostatný povinný denylist.

Preflight otvára lokálnu SQLite/D1 databázu iba na čítanie:

```bash
npm run preflight:adoptions -- --database /absolútna/cesta/d1.sqlite
```

Kontrola zlyhá, ak chýba ktorýkoľvek z 36 exact legacy párov `category='adopcia' + slug`, canonical organizácia podľa `import_key`, očakávaná canonical identita, distribúcia `16/9/7/4`, alebo ak už v `adoption_dogs` existuje cieľový slug. Import nesmie použiť upsert.

## Publishability alignment

Publikovateľnosť už nepovažuje veľkosť `UNKNOWN`, chýbajúci dlhý opis ani chýbajúcu hlavnú fotografiu za blokujúcu chybu. Ide o nepovinné údaje; detail ich vie bezpečne vynechať a SEO indexovateľnosť zostáva prísnejšia — `adoptionIsIndexable` naďalej vyžaduje `ACTIVE`, hlavnú fotografiu, opis aspoň 80 znakov a čerstvé overenie. Povinné zostávajú meno, slug, pohlavie, vek, kraj a mesto, organizácia, krátky opis a dátum overenia.

Transformácia vždy najprv preberie existujúci `help_cases.image_url` a pri Odinovi/Beky použije legacy opis iba vtedy, ak reálne existuje; nič nedopočítava ani nevymýšľa. Canonical numeric ID vzniká výhradne runtime lookupom stabilného `help_organizations.import_key`.

## Nasledujúci staging-data PR

Samostatný PR má po zelenom preflighte v staging databáze vygenerovať create-only SQL pre presne 36 payloadov so stavom `DRAFT` a `published_at = NULL`. Pred zápisom musí v jednej transakcii zopakovať exact legacy a canonical lookupy a nulový collision check; po zápise overiť 36 nových riadkov, distribúciu `16/9/7/4`, nulové invalid organization references, nulové HOLD slugy a nezmenený obsah `help_cases`. Až následný PR môže riešiť kontrolované publikovanie/read cutover; fyzický FK patrí až za validáciu nulových invalid references.
