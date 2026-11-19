# Directory 0170 – postupné odstránenie kontaktov z historického JSON

Dátum: 19. 11. 2026. Fáza 1 – iba už migrované kontakty.

## Cieľ

Všetky verejne upraviteľné údaje Adresára postupne patria do kanonických
SQL stĺpcov alebo relačných tabuliek. Notion zostáva obojsmerným editorom.
Po potvrdenom backfille #1446 a produkčnom behu #44554647006 je v
SQL doplnených 3 596 chýbajúcich kontaktov.

Teraz odstránime iba top-level historické kľúče v source_data_json,
ktorých SQL vlastník má hodnotu (vrátane zámerného SQL prázdna).

## Ktoré historické kľúče

- SQL website_url: JSON Web, Webstránka
- SQL public_phone: JSON Telefón, Telefon, phone
- SQL public_email: JSON E-mail, Email, email
- SQL facebook_url: JSON Facebook
- SQL instagram_url: JSON Instagram

Každá skupina sa čistí nezávisle. Pre konkrétne pole musí SQL obsahovať
hodnotu IS NOT NULL. SQL prázdny reťazec je platné vedomé vymazanie,
preto z neho tiež možno bezpečne odstrániť zastaraný JSON alias.

SQL NULL znamená, že údaj zatiaľ nie je prenesený. Jeho pôvodný JSON
zostáva zachovaný. Prvá etapa sa nedotkne archivovaných a odkontrolovaných
profilov, profilov s čakajúcim odomknutím ani evidovaným tombstone.

## Bezpečnostný kontrakt

- Päť fixných idempotentných UPDATE dotazov.
- Mení sa výhradne source_data_json – nikdy SQL kontaktné hodnoty, aktualizačné
  časové značky, meno, popisy, adresy, kategórie ani Notion mapping.
- Z JSON sa odstraňujú len pomenované kontaktné aliasy na vrchnej úrovni.
  Galérie, filtre, kategórie, zdroje dát, vnorené objekty a technické
  metadáta zostávajú zachované.
- Starý JSON stĺpec zostáva fyzicky v databáze. Jeho iné hodnoty
  sa stále používajú a nesmú sa plošne vymazať.
- Read-only audit aj postflight hlásia súhrnné počty po kategóriách
  bez telefónov, e-mailov, webových adries a Notion identifikátorov.
- Chránený manuálny produkčný workflow vyžaduje aktuálny main,
  presný potvrdzovací text a obnovovací bookmark D1 pred zápisom.
  Bookmark nie je samostatná exportovaná záloha.

## Spustenie po zelenom CI a merge

Otvoriť GitHub Actions workflow:
.github/workflows/production-directory-contact-legacy-cleanup.yml

Najprv spustiť na main režim audit s potvrdením:
AUDIT-DIRECTORY-CONTACT-ALIASES-psipedia-sk-db

Z privátneho report.json overiť before.candidates.removable a
počty unmigrated a protected. Produkčný audit iba číta D1.

Až po overení spustiť režim apply s potvrdením:
APPLY-DIRECTORY-CONTACT-ALIASES-psipedia-sk-db

Očakávané: POSTFLIGHT, invariantsPassed=true, všetkých päť
after.candidates.removable=0, žiadne zmeny počtu profilov
či SQL kontaktov; hodnoty v SQL NULL a chránené profily zostanú
nedotknuté.

Samotný merge nevykoná žiadny produkčný zápis.

## Ďalšie samostatné etapy

1. Verejné fakty z importného JSON do directory_profile_public_facts;
   najprv overiť konflikt s filtrami a existujúcimi vzťahmi.
2. Ďalšie kategórie a filtre do existujúcich SQL relačných tabuliek;
   verejný web, Notion a Admin musia potom čítať kanonické vzťahy.
3. Services V3 oproti services_json, qualifications_json, SEO a
   zobrazovanie médií presunúť po oddelených schémach.
4. Po úplnom SQL cutovere bez posledných aktívnych JSON čítačov
   samostatne overiť fyzické odstránenie nepotrebných JSON stĺpcov.
