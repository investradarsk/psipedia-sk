# D1 0170 – chránené vytvorenie schémy Adresára

**Stav:** PR pripravuje samostatný owner-only workflow. Merge kódu **nespustí**
migráciu. `0170` je v bežnom migračnom runneri evidovaná ako
`UNACTIVATED_PRODUCTION_TARGETS` a toto PR ten zákaz neodstraňuje.

## Rozsah

Nové SQL: 4 nullable textové kontakty v `directory_profiles` a 3
prázdne relačné tabuľky s indexmi: ďalšie kategórie, redakčné fakty,
kategóriové filtre.

Bez backfillu z JSON/Notion, bez zmeny existujúcich hodnôt, bez čítacích
alebo zápisových zmien v Admin, Notion, partnerských profiloch či verejnom
webe. Podujatia a Pomoc psom zostávajú nedotknuté.

## Bezpečnostné bariéry

- Načítanie len z `main` a `workflow_dispatch`, environment `production`.
- Fixný git blob `a528e8d8474363639896bb88b8ce65aecfd82065`,
  presne 10 dovolených aditívnych SQL príkazov.
- Kanonický Cloudflare účet, D1 názov, ID a binding kontrolovaný.
- Overené existujúce tabuľky aj `directory_breeder_club_relations`,
  aktuálny fyzický stav nových stĺpcov a indexov.
- Kontrola histórie: fyzické objekty 0163–0169 nie sú úplne evidované
  v `d1_migrations`; preto sa nepokúšame doplniť ledger ani replay.
  Nečakaná zmena histórie okamžite zablokuje apply.
- Ak čo len jeden z 10 objektov už čiastočne existuje, workflow zlyhá,
  nič nedopĺňa naslepo.
- Pred zápisom povinný D1 Time Travel bookmark, opakované preflight
  a porovnanie kontrolných súčtov počtov profilov/JSON a bázy schémy.
- **Jediný povolený produkčný zápis:** spustenie presného súboru
  `drizzle/0170_directory_canonical_sql_slots.sql`.
  Nevytvára sa žiadna záznamová migrácia v `d1_migrations`.
- Postflight kontroluje prítomnosť schémy, 0 riadkov vo všetkých nových
  tabuľkách a nemenné počty existujúcich hlavných tabuliek a JSON.
- Ak je schéma kompletná, ďalší apply neprepisuje tabuľky a hlási
  `ALREADY_INSTALLED`. Ak je čiastočná alebo poškodená, zlyhá.
- Receipt sa uloží ako súkromný artefakt GitHub Actions vrátane
  recovery bookmarku; neobsahuje žiadne hodnoty kontaktov.

## Prevádzkový postup po zelenom CI a merge

1. Manuálny audit:
   [Production D1 Directory Canonical 0170](https://github.com/investradarsk/psipedia-sk/actions/workflows/production-d1-directory-0170.yml)
   → vetva `main`, režim `audit`, potvrdenie
   `AUDIT-0170-psipedia-sk-db`.
2. Z výstupu vyžadovať `phase=AUDIT, installed=false`, správne
   cieľové D1 a existujúce počty. Ak je `installed=true`,
   netreba apply. Pri chybe vyhodnotiť ručne, nie preskakovať ochrany.
3. Manuálny apply v tom istom workflow (režim `apply`, potvrdenie
   `APPLY-0170-psipedia-sk-db`). Výstup musí byť
   `POSTFLIGHT`, `applied=true`.
4. Nevykonávať obvyklý `Production D1 Migrate`,
   `wrangler d1 migrations apply`, žiadny ručný SQL backfill,
   ani opakovanie starších migračných súborov.

Až **po úspešnom postflighte** pripraviť samostatný presun hodnôt zo
starého JSON a Notion s per-field poslednou zmenou, explicitne
vymazanými hodnotami a kontrolou parity. Staré JSON sa nemaže.
