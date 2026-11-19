# Directory: doplnenie chýbajúcich SQL kontaktov z historického JSON

## Rozhodnutie vlastníka (19. 11. 2026)

Ak je SQL kontakt nemigrovaný (presne NULL), ale historické
source_data_json má neprázdnu hodnotu, doplniť kontakt do kanonického
SQL stĺpca. Ak je SQL už vyplnené, údaj z JSON ignorovať a nič
neprepisovať. Rozdielne existujúce hodnoty nie sú predmetom tejto etapy.

SQL prázdny reťazec ('') **nie je NULL**: podľa platného kontraktu PR
#1444 znamená vedomé vymazanie. Backfill ho nesmie zmeniť, aby
nevzkriesil už odstránenú kontaktnú hodnotu.

## Rozsah

Päť kanonických stĺpcov directory_profiles:
- website_url: Web, Webstránka
- public_phone: Telefón, Telefon, phone
- public_email: E-mail, Email, email
- facebook_url: Facebook
- instagram_url: Instagram

Prvá neprázdna legacy hodnota v existujúcom poradí čítania sa uloží
do SQL len vtedy, keď je príslušný SQL stĺpec NULL. Bez formátovej
validácie e-mailu, URL či telefónu (čistý text). Prázdne aliasy,
neplatné JSON alebo hodnoty typu objekt/pole sa ignorujú.

Chránené: publikované a koncepty sú oprávnené; **archivované**,
**Odkontrolované** a profily s neukončeným či evidovaným zámerom
mazania (tombstone) sa bez ručného postupu neprepíšu.
Nemodifikuje sa source_data_json, other SQL fields, updated_at,
updated_by, Notion ani administračná synchronizácia.

## Prečo

Produkčný SELECT-only audit #44543009095 prešiel 1 846 profilov,
stabilné agregáty, a našiel nasledujúce hodnoty len v JSON a
nemigrovanom SQL:
- public_phone 1 466
- public_email 1 269
- facebook_url 639
- instagram_url 244

Čísla sú **informatívne**, nie záväzný plán zápisu. Kandidáti
pre aplikáciu sa rátajú z aktuálnej D1. Rozdielne obsadené SQL
hodnoty zostanú platné.

## Bezpečný postup

1. Po úspešnom CI zlúčiť PR do main. Žiadne zápisy z PR.
2. Otvoriť GitHub Actions > Directory SQL NULL contacts – controlled backfill.
3. Manuálne na main spustiť mode=audit s potvrdením
   AUDIT-DIRECTORY-NULL-CONTACTS-psipedia-sk-db.
   Výstup: counts byCategory, kandidáti podľa piatich stĺpcov,
   bez osobných hodnôt.
4. Po kontrole počtov manuálne spustiť mode=apply s potvrdením
   APPLY-DIRECTORY-NULL-CONTACTS-psipedia-sk-db.
   Protected environment production, presne aktuálny main,
   záložný D1 time-travel bookmark, kontrola nemennosti počtu profilov,
   source_data_json a id; päť fixných idempotentných UPDATE dotazov.
   Každý UPDATE znova kontroluje SQL IS NULL, stav, lock a tombstone.
5. Skontrolovať postflight v Actions a privátny artifact report.json.
   Očakávané afterCandidates.totals = 0 pre oprávnené profily.

Workflow používa izolovaný Wrangler config, nie generické
migrations apply, nepridáva schému a nemení d1_migrations.
Pri čiastočnom zlyhaní sú všetky dokončené kroky opakovateľné;
report uchová zoznam dokončených stĺpcov a recovery bookmark.
Bookmark **nie je samostatná exportovaná záloha**. Obnovenie
D1 time-travel by bolo osobitné rozhodnutie s ďalšími rizikami.

## Čo tento krok nerobí

Nemaže staré JSON aliasy. Tie sa môžu odstrániť až po overení,
že SQL naozaj číta celý verejný web, admin, Notion a partnerstvo.
Nedopĺňa ďalšie kategórie, filtrovanie ani voľné redakčné fakty;
tie sa mapujú do iných SQL tabuliek a vyžadujú zvláštnu etapu.
Nespúšťa partnerské migrácie 0171 ani 0172.
