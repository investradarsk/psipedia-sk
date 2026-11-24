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

## 02 – Duplicity a klasifikácia (24. 11. 2026)

[ci-v2-duplicate-analysis.json](ci-v2-duplicate-analysis.json) eviduje všetkých 156 workflowov, 110 rozbalených npm testovacích príkazov, zistené duplicity vrátane loaderov, a vzorku reálnych Actions behov. Baseline main sa od kroku 01 nezmenil.

### Klasifikácia (pracovný návrh, nie povolenie na odstránenie)

| Oblasť | Workflowy |
| --- | ---: |
| Admin | 22 |
| Integrácie | 25 |
| SEO a výkon | 11 |
| Verejný web | 16 |
| SQL a D1 | 11 |
| Partner, bezpečnosť a recenzie | 7 |
| Kvalita kódu | 3 |
| Hlavný povinný gate | 1 |
| PR vizuálne dôkazy | 1 |
| Produkčné/prevádzkové alebo zmiešané (chránené) | 59 |

42 YAML súborov bolo preskúmaných priamo; z nich 20 obsahuje explicitný `npm run build`. Zvyšných 114 má iba predbežnú klasifikáciu podľa názvu. Príznak build nepočíta implicitné buildy v npm test alebo pomocných skriptoch. Pred zmenou konkrétneho workflowu je nutná jeho úplná kontrola triggerov, jobov, prostredia, fixture a side effects.

### Potvrdené kandidáty na deduplikáciu

| Príkaz | Referencie na súbory po rozbalení | Unikátne súbory | Unikátne dvojice súbor + príkaz/loader |
| --- | ---: | ---: | ---: |
| npm test | 377 | 375 | 376 |
| test:foundation | 214 | 213 | 214 |
| test:admin-pwa | 23 | 20 | 20 |
| test:admin-performance-v2 | 31 | 28 | 28 |
| test:partner-auth | 23 | 23 | 23 |
| test:partner-platform | 17 | 17 | 17 |

- Identický explicitný kontext: `public-html-cache.test.mjs` (npm test), `admin-pwa.test.mjs`, `admin-mobile-document-navigation.test.mjs`, `admin-page-streaming-step4.test.mjs` (admin PWA a vnorené etapy). Pred zmenou overiť env a izoláciu; odstrániť len opakovanie, nie testy.
- `admin-attention-queue.test.mjs` sa spúšťa s loaderom aj bez neho. Nie je dokázaná ekvivalencia, oba kontexty ponechať.
- `test:partner-auth` a `test:partner-platform`: prekrývajúce sa testy, ale rôzne závislosti a rozsah; bezpečnostné scenáre zachovať.
- Štyri workflowy recenzií (author auth, submission, public read, admin) zdieľajú lint/build a časti D1/testov. Zachovať samostatné E2E scenáre.
- Admin PWA, stability, runtime a IA majú samostatné buildy; zjednotiť kompatibilné buildy a testy, nie výsledky bez kontroly.
- Notion sync: article/events/help/conflict/profile majú prekrývajúce sa testy a buildy. Zachovať presné sync, lock a atomicity kontrakty.
- SQL offline: 0173 foundation, SQL detail, review lock, atomic fields a canonical reads zoskupiť po overení SQLite/loaderov. Zmiešaný review-lock bridge obsahuje aj historický zápisový job; nepresúvať ho do PR CI. Rovnako Help legacy cleanup obsahuje offline safety aj mazanie historických riadkov.
- `services-v3-hourly-auto-sync.yml` má napriek názvu PR trigger; názov nie je dôkaz schedule ani produkčného spúšťania. `auto-update-automerge-prs.yml` má workflow_dispatch; zachovať mimo testovacej konsolidácie.
- `public-visual-screenshots.yml` zachytáva produkciu, `pr-visual-evidence.yml` overuje presný PR build. Nie sú zameniteľné.
- Historické migračné workflowy nie sú potvrdené ako zastarané len preto, že migrácia už prebehla; archivácia až po overení histórie, závislostí, produkčných receiptov a náhradného testu.

### Časový baseline (vzorka, nie benchmark)

Actions vzorky pre SHA 72c4369cc2769ce25ebab04fa30a61f56492c648 a f91e57bd124ca36b64e20743bcad83f8854f99d9 obsahujú 28 a 26 workflow behov. Záznamy sú uložené so stavom a časmi. Súčet elapsed intervalov ukončených success/failure behov je 1850 s a 1045 s pri zachytení vzorky; prvá vzorka mala 10 ešte aktívnych behov. Nejde o čas celej PR ani účtované runner-minúty. Job API vrátilo názvy a výsledky krokov, ale nie ich timestamps, takže presné trvanie buildov zatiaľ nie je dostupné.

### Podmienky ďalších krokov

Najprv konsolidovať iba dokázané rovnaké príkazy, zachovať aliasy a bezpečnostné pokrytie. Pred migráciou každej ďalšej skupiny doplniť úplný source audit; pred archiváciou mať pre každý workflow ekvivalentný náhradný gate alebo potvrdenú nepoužívanosť. Pred finálnym porovnaním doplniť ukončené reprezentatívne PR behy na rovnakých rozsahoch zmien.

Stav: analýza duplicít a predbežná klasifikácia všetkých workflowov uložená; úplná source kontrola 114 workflowov a porovnateľný výkonový baseline ostávajú otvorené. Žiadny test, workflow, trigger ani produkčná operácia nebola zmenená.

## Plán

- [x] CI-V2-01 – baseline inventár sledovaných súborov a npm príkazov, ochrana main, reprodukovateľný scanner.
- [ ] CI-V2-02 – analýza a predbežná klasifikácia uložená; otvorené: source audit 114 workflowov a porovnateľný časový baseline.
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
