# Adresár – posledné historické zámky „Odkontrolované“

## Overený východiskový stav

Produkčný read-only audit [44735023558](https://github.com/investradarsk/psipedia-sk/actions/runs/44735023558) potvrdil **1 847 profilov** a 8 výskytov `review:legacy_only_unverified`, t. j. starý platný zámok bez SQL 0173 záznamu. Po PR [#1484](https://github.com/investradarsk/psipedia-sk/pull/1484) existuje fail-closed SQL + legacy + partner + deletion lock, po PR #1486 sa SQL review zobrazuje aj v Admin detaile a zozname.

## Čo robí tento krok

Pri jedinom ručnom schválenom produkčnom spustení prenesie **len explicitne existujúce historické zámky** z `directory_profiles.source_data_json` do `directory_profile_review_state`, a to iba tam, kde SQL review riadok ešte neexistuje. **Vykoná presne jeden `INSERT ... SELECT`**:

- maximálne 8 nových riadkov – ak by sa kandidátov našlo viac, SQL príkaz nič nezapíše;
- `ON CONFLICT(profile_id) DO NOTHING` – nikdy neprepíše novší SQL zámok alebo odomknutie;
- originálny `reviewed_at` a `reviewed_by` sa prevezmú presne z existujúceho Admin stavu; pri `unlock_pending` sa nevymýšľa neexistujúci autor či čas;
- archivované a nepodložené profily sa neprepisujú;
- pred a po operácii sa overí počet profilov, validita JSON, počet nevyriešených SQL review zámkov a konflikty. V prípade nečakaného stavu operácia skončí chybou.

## Čo sa nikdy nemení

Nemení sa `directory_profiles` (žiadne profilové údaje ani JSON), Notion, kontakt, služba, SEO, verejný web, história zmien ani schéma. Nepotrebuje žiadnu migráciu. Pri jednom úspešnom spustení je operácia idempotentná a ďalší beh vloží nula riadkov.

## Po Merge

V GitHub Actions otvor `Directory – eight historical SQL review locks (owner only)`, stlač `Run workflow` na `main` a zadaj `APPLY-DIRECTORY-REVIEW-0173-psipedia-sk-db`.

Po úspešnom behu overiť `status=POSTFLIGHT`, `after.missingLocks=0`, `after.mismatches=0`, `before.profiles=after.profiles`.

## Poctivá hranica

Toto **nie je** úplné vymazanie `source_data_json`. Auditu stále zostáva napr. **1 318 neoverených historických faktov** a **133 filtrov**, ktoré nie je bezpečné presúvať späť na SQL bez posledného dátumu zmeny a potvrdenia z Notionu. Dôležité je nevypnúť ich verejnú prezentáciu ani nevrátiť zastaraný obsah. Stará ochranná JSON vetva zostáva dovtedy, kým nebude potvrdená jej úplná SQL náhrada.
