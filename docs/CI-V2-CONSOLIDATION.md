# CI V2 – konsolidácia testovania

## 01 – Inventár (24. 11. 2026)

Baseline main: `39d42c72cf60ec41c4b18a114a966144449f1105`.

Presný zoznam sledovaných súborov, npm príkazov a ich priamych referencií je v [ci-v2-inventory-baseline.json](ci-v2-inventory-baseline.json). Inventár je snapshot, nie zoznam určený na mazanie.

| Metrika | Baseline |
| --- | ---: |
| Workflow YAML súbory | 156 |
| NPM príkazy celkom | 144 |
| NPM testovacie príkazy (test, test:*) | 110 |
| Súbory pod tests/ | 1200 |
| Súbory *.test.* | 999 |
| Súbory *.spec.* | 113 |
| Súbory pod tests/fixtures/ | 55 |
| Unikátne Node testy priamo uvedené v npm príkazoch | 424 |
| Node testy priamo uvedené vo viacerých npm príkazoch | 22 |
| Node testy bez priamej npm referencie | 575 |

### Overené prekrývanie a existujúca infraštruktúra

- `playwright-e2e.yml`: hlavný povinný build/lint/test, existujúci výber rozsahu cez `scripts/ci-scope.mjs`, artefakt `validated-build-${{ github.sha }}`.
- `partner-auth-ci.yml` a `profile-review-submission-ci.yml`: vlastné migrácie, lint, build aj desktop/mobile E2E. Kandidáti na zdieľanie kompatibilných krokov, nie na automatické odstránenie.
- `admin-pwa-ci.yml`: PWA zmluvy a browser kontroly.
- `production-d1-migrate.yml`: manuálna produkčná operácia, bez rušenia bežiacej migrácie. Nie je bežným PR testom.
- `test:foundation`, `test:partner-auth`, `test:partner-platform` a `test:admin-pwa` obsahujú vnorené npm príkazy; jednoduchý počet priamych referencií podhodnocuje opakované vykonania.
- Playwright má existujúce projekty desktop-chromium a mobile-chromium. Zachovať izoláciu, seed dát a diagnostické artefakty.

### Ochrana main

Aktívny ruleset 23739696 vyžaduje presné kontexty:

- Build, lint and unit/integration tests
- Breed CI bootstrap, all-breed regression and Playwright

Zachovať názvy a funkčnosť povinných kontrol počas prechodu. Nezmeniť ruleset, produkčné secrets, D1, R2 ani nasadzovanie bez osobitného súhlasu.

### Reprodukovateľný audit

Z čistého checkoutu:

```sh
node scripts/ci-v2-inventory.mjs > /tmp/psipedia-ci-inventory.json
```

Skript bez nových závislostí číta sledované YAML súbory, npm referencie (vrátane vnorených príkazov), testy, raw trigger/concurrency bloky a príznaky buildov, lint, migrácií či Playwright. Nevykonáva testy ani workflowy. Statická analýza nie je interpretácia YAML/GitHub Actions: dynamické príkazy, globy, reusable workflowy a pomocné skripty vyžadujú kontrolu.

Stav: úplný inventár názvov a npm príkazov uložený. Detailné spúšťacie podmienky všetkých 156 YAML a reálne časy behov ešte neboli overené; scanner je pripravený, ale v tomto kroku nebol spustený na plnom checkoute. Pred odstránením workflowov treba doplniť per-workflow klasifikáciu, mapu pokrytia vrátane nepriameho spúšťania a časový baseline z Actions. 575 súborov bez priamej npm referencie nie je 575 nepoužívaných testov.

## Plán

- [x] CI-V2-01 – baseline inventár sledovaných súborov a npm príkazov, ochrana main, reprodukovateľný scanner.
- [ ] CI-V2-02 – kompletná klasifikácia workflowov, duplicity, historické kontroly, meranie baseline.
- [ ] CI-V2-03 – konsolidácia npm testovacích príkazov s kompatibilnými aliasmi.
- [ ] CI-V2-04 – zdieľanie kompatibilných build artefaktov.
- [ ] CI-V2-05 – rozšírenie existujúceho ci-scope, fail-closed pri neznámych zmenách.
- [ ] CI-V2-06 – unit/integration: deduplikácia bez straty loaderov a kontraktov.
- [ ] CI-V2-07 – Playwright, izolované fixtures a diagnostika.
- [ ] CI-V2-08 – bezpečná archivácia historických workflowov až po dokázaní náhrady.
- [ ] CI-V2-09 – výsledné CI a zachovanie povinných kontextov.
- [ ] CI-V2-10 – overenie parity, výkonu, spoľahlivosti; kontrola vlastníkom pred merge.

## Zásady

Jedna spoločná tematická vetva/PR. Žiadne znižovanie pokrytia, zmena produkčných operácií, potláčanie chýb alebo vypínanie testov za účelom zeleného CI. Pred pokračovaním po paralelných PR zosúladiť baseline s aktuálnym main.
