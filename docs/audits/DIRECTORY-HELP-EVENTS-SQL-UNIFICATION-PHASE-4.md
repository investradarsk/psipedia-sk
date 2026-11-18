# Psipedia – zjednotenie SQL 4/4: záverečné overenie pred čistením

**Stav:** kontrolné nástroje záverečného čistenia pripravené v PR #1413.
**Produkčné SQL prepnutie ani mazanie historických dát NEPREBEHLO.**
Chýba schválená migrácia a dôkaz parity na skutočných produkčných dátach.

## Rozsah (iba tieto tri oblasti)

- **Služby pre psov:** desať aktívnych kategórií v directory_profiles,
  druhé kategórie, managed_eshops a Services V3 vzťahy.
- **Pomoc psom:** help_cases, help_organizations, adoption_dogs,
  lost_found_dog_reports, ich Notion mapovania.
- **Podujatia:** managed_events a ich Notion mapovania.

Plemená, články, recenzie, analytika, účty ani ďalšie úložiská
**nepatria do tejto operácie**.

## Nové overovacie nástroje

### 1. Fail-closed brána pred akýmkoľvek DROP/DELETE

Skript **scripts/production-editorial-cleanup-readiness.mjs** spotrebuje
iba agregovaný read-only report.json z fázy 1. Vytvorí
**cleanup-readiness.json** s počtami záznamov podľa kategórií a so
strojovo čitateľnými dôvodmi, pre ktoré sa nemôžu mazať JSON údaje či
SQL tabuľky. Rozpozná chýbajúce schémy, neplatné mapovania, neúplné
Notion pokrytie, poškodený/aktívny JSON a osirelé Notion väzby.

Ani nulový počet JSON záznamov **nie je automatické povolenie na
mazanie**. Agregované počty nie sú dôkazom zhody Adminu, Notion,
verejného webu, ani platnej obnoviteľnej zálohy.

### 2. Statický inventár spotrebiteľov historických údajov

Skript **scripts/editorial-legacy-reader-inventory.mjs** kontroluje
všetky zdrojové súbory pod app/, lib/, components/ a db/ a vytvorí
**source-readers.json**. V ňom je súbor a počet referencií na
historické Directory JSON polia, viacnásobné kategórie a filtre.
Nevypisuje žiadne kontakty ani hodnoty z produkcie.

Výsledok nie je zoznam na bezhlavé zmazanie. JSON stále môže
obsahovať technické metadáta, médiá či legitímne viacnásobné kategórie.

### 3. Chránené GitHub Actions

Workflow **Psipedia – D1 canonical inventory (Services, Help, Events)**
má teraz:

1. Izolované SQL testy všetkých štyroch fáz.
2. Statický audit existujúcich Directory JSON čítačov.
3. Read-only dotazy na produkčnú D1 a report.json.
4. Fail-closed cleanup-readiness.json bez ďalších D1 volaní.
5. Jeden artifact obsahujúci report.json, cleanup-readiness.json
   a source-readers.json. Bez zápisu do D1 a bez Notion operácií.

Manuálny dispatch na aktuálnom main používa potvrdenie:

    AUDIT-EDITORIAL-STORAGE-psipedia-sk-db

Pripravovaný návrh SQL je iba v docs/proposals/, nie v produkčnom
reťazci migrácií. Zlúčenie tohto PR nevykoná backfill ani čistenie.

## Blokátory skutočného produkčného čistenia

| Podmienka | Stav |
| --- | --- |
| Aktuálny report produkčnej D1 pre všetky agendy | Neoverené |
| Zlúčenie PR #1414 a rezervácia migrácie 0169 | Hotové; 0169 je na main |
| Číslovaná migrácia a idempotentný backfill SQL polí | Neaplikované |
| Reálna zhoda Admin vs D1 vs verejný web | Neoverené |
| Notion push/pull + režim Odkontrolované | Neoverené |
| E2E každej kategórie a všetkých agend Pomoc psom / Podujatia | Neoverené |
| Aktuálna záloha s overeným rollbackom | Neoverené |
| Nahradenie historických čítacích aj zápisových ciest | Neukončené |

## Poriadok aktivácie

Najprv uzavrieť migračnú kolíziu, potvrdiť read-only počty a vykonať
zálohu. Potom schváliť samostatnú číslovanú SQL migráciu a presný
per-field backfill vrátane zámerne prázdnych hodnôt. V jednom riadenom
cutoveri prepnúť Admin, Notion/partner zápisy aj všetky verejné
karty, filtre a detaily na ten istý SQL údaj. Overiť obojsmerné
prepojenia a 10 kategórií + 5 Pomoc psom agend + Podujatia.
**Len následne** odstraňovať konkrétne historické vetvy a nepotrebné
hodnoty v osobitne schválenom produkčnom kroku.

**Fáza 4 teda pripravila kontrolu pred čistením, nie už vykonané
produkčné zmazanie.** Žiadna deštruktívna SQL operácia nie je v PR #1413.
