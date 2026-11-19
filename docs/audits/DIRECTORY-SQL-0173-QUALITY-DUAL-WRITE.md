# Adresár – krok 4/8: kvalita údajov do SQL 0173

Tento dokument rozširuje PR #1461, ktorý pôvodne riešil krok 2/8 (otváracie hodiny).

## SQL tabuľka
Používa už nasadenú `directory_profile_quality_resolutions`, vytvorenú migráciou `0173`. Žiadne nové DDL, žiadny automatický backfill, žiadne prepnutie verejných/administrátorských čítaní.

## Podporovaný zápis
- Päť pevne definovaných položiek: `phone`, `email`, `website`, `image`, `address`.
- Stavy: `DOES_NOT_EXIST`, `NOT_PUBLIC`, `NOT_APPLICABLE`, `NOT_FOUND`.
- Canonical `createManagedDirectoryProfile` a `updateManagedDirectoryProfile` sú spoločné pre Admin a existujúcu Notion synchronizáciu; v tej istej D1 batch transakcii ako úprava `directory_profiles` aktualizujú **iba dotknuté** položky kvality.
- Status a per-field `checked_at` sa čítajú z hodnoty `source_data_json` už zapísanej primárnou D1 transakciou; nedochádza k duplicitnému spúšťaniu normalizácie ani k odlišným časom medzi projekciami.
- Výslovné zrušenie statusu alebo doplnenie súvisiaceho verejného kontaktu odstráni SQL výsledok len konkrétneho poľa. Chýbajúce pole nie je vymazanie.
- Explicitná revízia dátumu kontroly zrkadlí pre daný profil schválené statusy s aktuálnymi dátumami. Neexistujúci alebo neplatný stav sa do 0173 nevkladá.
- Predstaviteľská identita/revízia `id + updated_at + updated_by` alebo `category + slug + updated_at + updated_by` chráni SQL sidecar pred starším/zamietnutým zápisom.
- Rozlíšenie Notion lock/„Odkontrolované“ sa **nemení** – pri jeho aktívnom stave sa Notion inbound naďalej zablokuje pred volaním týchto zápisov.

## Zámerné obmedzenia
- Kým nebude krok 7/8, interný prehľad kvality a Notion outbound stále používajú existujúcu kompatibilnú JSON projekciu; SQL je teraz iba prechodné zrkadlo.
- Neexistuje hromadné vymazanie `_psipedia_quality_*` ani migrácia starších záznamov.
- Partneri tieto interné redakčné statusy nemajú medzi povolenými editovateľnými poľami.
- Na bezstratové odstránenie JSON treba ešte dokončiť SQL-only čítanie, rozlišovanie doteraz nemigrovaných a výslovne vymazaných stavov a validovať reálny Notion/Admin workflow.

## Kontrolné scenáre
1. Označiť pri profile „Kvalita · Telefón = Nedohľadateľné“ → jeden SQL riadok s `quality_field=phone`, `resolution_status=NOT_FOUND`, zodpovedajúcim `checked_at`.
2. Zmeniť iba popis profilu → SQL stavy kvality ostatných polí bez zmeny.
3. Doplniť telefón a uložiť → príslušný starý status kvality sa vymaže zo SQL aj kompatibilnej JSON projekcie, iné hodnoty kvality ostanú.
4. Výslovne vymazať „Kvalita · Web“ → nula riadkov pre daný profil a `website`.
5. Podpísaná Notion úprava kontrolného stavu → rovnaké SQL zrkadlo; pre odkontrolovaný profil sa neobíde Notion lock.
6. Zmena s nesprávnou revíziou/aktérom → nijaký delete/insert na SQL zrkadle.

**Bezpečnostná hranica:** tento PR nie je hotový SQL-only cutover a neoprávňuje na spustenie PR #1448 ani odstránenie `source_data_json`.
