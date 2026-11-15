# Psipedia – presná produkčná kontrola historických JSON polí v D1

Audit po merge PR #1384 a #1385. **Tento postup nemení ani jeden záznam.**

## Spustenie cez GitHub – bez terminálu

1. Po schválení a merge samostatného PR s týmto workflow otvor repozitár `investradarsk/psipedia-sk` → **Actions**.
2. Vľavo vyber **Psipedia Directory – production D1 legacy read-only audit**.
3. Klikni **Run workflow**, vyber vetvu **main** a do poľa confirmation presne napíš:
   `AUDIT-DIRECTORY-LEGACY-psipedia-sk-db`.
4. Spusti **raz**. Pokiaľ GitHub vyžaduje schválenie chráneného prostredia `production`, schváľ iba tento read-only job.
5. Po **Success** otvor run → **Summary**. V dolnej časti otvor **Artifacts** a stiahni `directory-legacy-readonly-<run-id>`.
6. Pošli v konverzácii `report.json` alebo jeho sumarizačnú tabuľku na ďalšiu analýzu.

**Nespúšťaj** `Production D1 Migrate`, `migrations apply`, `d1 export` ani žiadne opravy/úpravy.

## Ako audit funguje

Manuálne spustený job:
- používa rovnakú GitHub `production` ochranu a konkurentný zámok ako predchádzajúce read-only D1 audity;
- vyžaduje aktuálnu `main`, presné potvrdzovacie heslo, kanonický účet a D1 ID `psipedia-sk-db`;
- volá iba **dva statické príkazy SELECT**, nikdy `INSERT`, `UPDATE`, `DELETE`, `ALTER` ani migráciu;
- vracia súhrny podľa kategórie/stavu a nanajvýš **500 kandidátov** s číselným `psipedia_id`, typom problému a názvom poľa. Neobsahuje kontakty ani obsah textového JSON.

### Dôležité metriky
- `*_legacy_only`: hlavné pole chýba, historický alias ešte drží údaj – **nevypínať fallback**.
- `*_conflict`: historický a hlavný údaj sa líšia – pri kontrole má prednosť autoritatívny zdroj, nie automatický prepis.
- `explicit_clear_with_legacy`: hlavné pole bolo úmyselne prázdne a starý alias stále existuje – **nenapĺňať prázdne pole starou hodnotou**.
- `invalid_json`: chybný JSON na profile – prešetriť pred akýmkoľvek zásahom.
- `profiles_with_technical_json_dependencies`: závislosti na `_psipedia_*` – **neodstraňovať `source_data_json`**, inak by zmizli systémové hodnoty.

Súhrnná tabuľka pokrýva **celú D1 tabuľku**. Kandidátsky zoznam je len prvých 500; ak `candidateListMayBeTruncated=true`, potrebuje ďalší výber, **nula sa nedá predpokladať**.

## Čo po audite

1. Zoradiť kandidátov: najskôr neplatný JSON/konflikt/explicitné vymazanie, potom legacy-only.
2. Pri konkrétnom `psipedia_id` porovnať Admin, verejný profil, skutočný D1 zdroj a Notion.
3. Navrhnúť per-field prenos hodnoty iba tam, kde je fakticky správna a schválená.
4. Pred migráciou záloha a návratový plán; zvlášť otestovať kontakty, služby V3, väzby plemien a okresy.
5. **Starý fallback vypnúť až po potvrdenej parity a nulových závislostiach** daného poľa. Technické `_psipedia_*` zostanú.

**Čo tento audit negarantuje:** Stav synchronizácie v Notione nie je dôkazom rovnosti každej D1 hodnoty. Audit číta D1 bez prihláseného Adminu, takže úplnú paritu web ↔ Admin ↔ D1 ↔ Notion potvrdíme následnou vzorkovou kontrolou.
