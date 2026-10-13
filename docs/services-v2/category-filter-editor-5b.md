# PSIPEDIA-SERVICES-V2 / 5B — Kategóriový editor filtrov

Samostatná UI a čistá adaptačná vrstva; nie je pripojená k živým zápisovým formulárom, verejným filtrom, D1 ani Notion.

## Vstupno-výstupný kontrakt

- `DirectoryCategoryFilterFields({category, originalValues, reviewStates?, changes, onChange, disabled?, idPrefix?})`.
- `originalValues` je nemenný baseline; kľúče sú ID z registra, napr. `veterinari.emergency`, nie D1 kľúče.
- `reviewStates` je voliteľný zoznam stavov `conflict` / `invalid` zo zmierovania 5A.
- `changes` obsahuje LEN používateľom explicitne zvolené stavy. Prázdny objekt znamená bez zmien.
- `onChange(nextChanges, patch)` je callback; nevykonáva API požiadavku.
- `patch = { category, contractVersion: 1, updates: { "veterinari.emergency": "yes" } }`.

## Význam stavov

- Pôvodne chýbajúce dáta: select zobrazuje „Nevyplnené – ponechať bez zmeny“, žiadna hodnota sa nezapisuje.
- Explicitne zvolené `unknown`: zapisuje sa, aj keď pôvodná hodnota chýbala.
- Pôvodné explicitné `unknown` a `no`: zostávajú bez zmeny, ak sa používateľ nedotkne poľa.
- Konflikt/neplatná hodnota: zobrazí sa varovanie, pôvodné dáta sa neupravujú bez explicitného rozhodnutia.
- Výber prázdnej položky obnoví pôvodný stav (vrátane konfliktu).
- Prepnutie kategórie používa `scopeDirectoryCategoryFilterChanges`; patch builder odmietne cudzie ID.

## Integračný bod: administrácia (až po 5A)

V `components/admin-directory-editor.tsx` vložiť komponent do vlastnej sekcie (napr. vedľa Obsah/Kontakty), zachovať existujúce `category` a výstupnú revíziu profilu. Zo schváleného `source_data_json` cez `readDirectoryCategoryFilterOriginals(category, sourceDataJson)` extrahovať baseline. Pridať `reviewStates` z 5A. Ukladať `changes` ako samostatný React state viazaný na ID profilu a aktuálnu kategóriu. Pri submit vytvoriť `buildDirectoryCategoryFilterPatch` z najnovšieho draftu; až server po autorizácii, validácii kategórie/verzie/revízie môže cez `mergeDirectoryFilterValues` bezpečne zlúčiť ID aktualizácie. **Neprepísať celý importData ani ostatné kategórie.**

## Integračný bod: partner účet (až po 5A)

V `components/partner-profile-edit-form.tsx` vykresliť rovnaký komponent iba pri `resourceType === "DIRECTORY_PROFILE"`. Baseline a príznaky konfliktu musí dodať server/5A. Oddeliť `changes` od existujúcej konverzie checkboxov cez `apiValue`: boolean coercion by stratil stav missing/unknown. Pridať nové facet ID iba do budúceho schváleného kontraktu moderovaných návrhov `/api/partner/profile-changes`, po serverovej validácii ID, kategórie, revízie a práv. Tento PR endpoint nemení.

## Riziká a testovanie

Komponent je úmyselne controlled: host musí poskytovať nové `changes` po `onChange` a pri zmene profilu resetovať návrh; nie je určený na priame čítanie neúplných importov bez vyhodnotenia 5A. `readDirectoryCategoryFilterOriginals` odmieta neplatný JSON (fail closed). Čisté helpery chránia patch, server musí aj tak zopakovať validáciu. UI nepoužíva fetch, iba HTML select/label a prístupné hinty.

CI: existujúci ľahký paths-scoped `services-v2-filter-contract-ci.yml`; Node type stripping, bez npm install a bez nových širokých GitHub jobov.

Lokálne: `node --experimental-strip-types --experimental-loader ./tests/directory-category-filter-editor-loader.mjs --test tests/directory-category-filter-editor.test.mjs`.