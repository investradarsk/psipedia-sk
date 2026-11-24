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

## 03 – NPM konsolidácia

Jednotný vstup pre vývojára: `npm run test:ci -- <group>`. Bez argumentu vypíše skupiny; `--plan` ukáže plán bez spustenia. Osem skupín: `code-quality`, `build`, `database`, `public`, `admin`, `partner`, `integrations`, `seo-performance`. Existujúce príkazy ostávajú kompatibilné; nové skupiny zatiaľ nie sú náhrada úplného CI ani záruka pokrytia workflow-only testov. Niektoré skupiny sa ešte prekrývajú, najmä admin, preto sa nesmú bez ďalšej deduplikácie používať ako jediný agregovaný gate.

Odstránené štyri opakované referencie: tri z priameho zoznamu `test:admin-pwa` (zostávajú vo vnorených step7/step8) a jedna z `npm test` (zostáva v `test:perf-fastpaths`). Rozdielne loader kontexty ponechané. Statická kontrola všetkých pôvodných testovacích príkazov potvrdila rovnaké množiny súbor + Node flags a ostatných príkazov. Poradie troch PWA súborov sa presunulo do existujúcich podskupín; ide o samostatné read-only testovacie procesy. Žiadne workflowy ani testovacie súbory sa neodstraňujú.

Pridaný regresný kontrakt `npm run test:ci:contract`. Pred merge overiť reálne CI, npm test a admin PWA. Statická parita nenahrádza vykonanie. Po migrácii workflowov v ďalších etapách zmenšiť počet verejných aliasov; teraz bolo 110 zachovaných a pridané dva vstupy.

## 04 – Zdieľaný build a artefakty

Pilot: REVIEWS-2A + REVIEWS-2B. Pri prekrývajúcom sa PR pôvodne bežali štyri buildy (dva štandardné a dva s lokálnym bootstrapom). Nová orchestrácia v `profile-review-submission-ci.yml` vytvorí dva artefakty v jednom behu: standard a local-e2e. Reviewer-auth workflow sa volá ako reusable workflow, samostatný workflow_dispatch zostáva. Trigger PR je zjednotením oboch pôvodných path filtrov plus súbory build kontraktu. Pri PR zasiahnutom iba jedným starým filtrom sa môžu spustiť aj súvisiace testy druhého workflowu; presné zúženie patrí do kroku 05. Manuálne spustenie submission workflowu zachová vlastné testy; manuálny author workflow si buduje vlastné artefakty ako doteraz.

Dôvod dvoch profilov: `vite.config.ts` číta PSIPEDIA_E2E_LOCAL_BOOTSTRAP a mení lokálnu auth konfiguráciu; nesmie sa zamieňať s produkčným buildom. Každý artefakt obsahuje dist, generovaný component registry a identitu SHA, Node verzie, lockfile hash, registry hash, dist fingerprint a počet súborov. Validácia používa existujúci validatePreparedDeployArtifact. Download iba v rovnakom workflow rune (bez cross-run tokenov), pred lokálnymi fixtures. Chýbajúci/nesprávny artefakt zlyhá; žiadny tichý fallback. PII .dev.vars, lokálne D1 migrácie, fixtures a E2E zostávajú izolované po joboch. Admin interaction v hlavnom CI navyše overuje existujúci stiahnutý build pred migráciami, rovnako ako search a full breed E2E.

Zachované oba povinné check contexts, existujúce produkčné workflowy, lokálna bezpečnosť a rozsahy testov. Nezlučujeme REVIEWS-3 (odlišné .dev.vars pred buildom), Partner, DS-0B (odlišná revízia PR HEAD) ani produkčné operácie. Ďalšie skupiny až po kontrole profilu a úspešnej pilotnej runtime validácii. Teoretické zníženie 4 -> 2 buildy pri prekryve; reálny čas a úspešné CI zatiaľ neoverené. Artefakt kontrakt je pridaný do hlavného povinného workflowu.

## 05 – Inteligentný výber testov

Rozšírený existujúci ci-scope (v8), nie druhá konkurenčná implementácia. Vlastníctvo sa overuje po jednotlivých súboroch: neznámy súbor v zmiešanom PR aktivuje existujúci full-core režim namiesto bounded. Nové scope pre homepage, verejný obsah, SEO/výkon a Facebook; rozšírené bezpečnostné a vizuálne závislosti vrátane premium-foundation.css. Spoločná build infraštruktúra a auth guardy ostávajú full-core. Git diff používa --no-renames, aby sa kontrolovali obe cesty premenovania. Verejné texty a executable MDX sa nepovažujú automaticky za dokumentáciu.

Osem skupín z kroku 03 sa vypisuje v JSON/GitHub output ako transition plan. Tento plán zatiaľ nepreberá zodpovednosť za legacy workflow-only testy; full-core znamená existujúci npm test + súvisiace povinné kontrakty, nie všetkých 999 súborov a 113 E2E. Zachované pôvodné gate a manuálne/plánované behy.

Pilot recenzií: canonical REVIEW_PR_PATHS je union pôvodných 2A/2B filtrov a spoločných build/scope súborov. Interný scope job bez npm install rozlíši auth-only, submission-only, obidva. Neznámy rozsah alebo nejednoznačnosť spustí obidva. Manuálny submission dispatch ostáva submission-only, standalone auth dispatch nezmenený. Dva build profily sú závislé od scope, lokálne D1 fixtures nezmenené.

Nové dependency-free regresie v povinnom CI: neznámy zmiešaný súbor, kritické zmeny, docs, vizuály, premenovania, review ownership a zhoda filtrov s YAML podmienkami. Povinný gate spúšťa aj NPM parity test z kroku 03. Reálne GitHub CI zatiaľ neoverené; ďalšie skupiny migrovať až po preukázanej parite.

## 06 – Unit a integračné testy

Tri skupiny z kroku 03 majú odstránené opakovania na úrovni explicitného súboru a rovnakých Node flags/loaders:

| Skupina | Pred | Po |
| --- | ---: | ---: |
| admin | 79 | 59 |
| database | 45 | 44 |
| seo-performance | 25 | 24 |

Admin stabilita už spúšťa celý PWA balík; skupina admin pridáva iba jeho performance-specific súbory cez existujúce step1/steps2-9 a nový tail alias. Pôvodný standalone performance príkaz naďalej zahŕňa PWA. Databázová skupina spúšťa lifecycle migráciu v migration-safety; nový lifecycle-core alias obsahuje zvyšné kontroly. Standalone record-lifecycle stále spúšťa migráciu aj core (migrácia teraz samostatne pred core). SEO skupina a aktívny entity workflow už nespúšťajú totožný structured-data súbor dvakrát; standalone test:seo-structured-data zostáva funkčný. Odlišný loader admin-global-search sa zachováva. Žiadny testovací súbor sa neodstraňuje. Neznáme príkazy, E2E, fixtures a produkčné operácie sa nekonsolidujú automaticky.

Statická parita všetkých existujúcich npm príkazov a všetkých ôsmich skupín bola porovnaná. Nový dependency-free test overuje živé aliasy, presné loader kontexty, multiplicitu a poradie opaque príkazov a zachovanie SEO testu v aktívnom workflow; zapojený do povinného CI. 22 odstránených opakovaných explicitných spustení v skupinách (nie počet vymazaných testov ani garantovaná úspora na každom PR). Ďalšie workflow-only testy a cross-workflow duplicity zostávajú do úplnej klasifikácie; skupiny zatiaľ nie sú náhradou kompletného CI. Runtime CI a porovnateľný čas ešte neoverené.

## 02 – Doplnenie úplného source auditu po kroku 06

- Preskúmaných všetkých 156 YAML zdrojov na revízii 6d4e59f, 156/156 blob SHA sa zhoduje s aktuálnou vetvou, 203 staticky identifikovaných jobov. Žiadny záznam už nie je len odhad podľa názvu.
- [Súhrn source auditu, overlap a historické kandidáty](ci-v2-workflow-audit/summary.json) a 10 batch JSON súborov obsahujú konkrétne triggery, joby, kroky, príkazy, referencie testov a skriptov, bezpečnostné indikátory a odporúčaný disposition pre každý workflow.
- 111 PR triggerov, 116 manual triggerov, 1 reusable trigger, 4 scheduled a 2 push; kategórie sa prekrývajú. 54 explicitných zmienok npm build, 31 lint a 45 Playwright/Chromium (vrátane zmienok v podmienkach/komentároch).
- 452 statických kontextov Node súbor + rovnaké flags v rôznych workflowoch a 85 kandidátov opakovania v jednom jobe; 301 explicitne spustených Node súborov bez priamej referencie v npm. Výsledky sú konzervatívne kandidáty; dynamické/glob/multiline príkazy a podmienky sa nesmú automaticky zahodiť.
- 36 špecifických historických manuálnych operácií na posúdenie archivácie v kroku 08. Žiadny nie je bez dôkazu označený za bezpečne odstrániteľný. Povinné checky, vizuálne dôkazy, scheduled/live audity, produkčný migrátor a mixed offline + produkčné joby zostávajú chránené.
- [Časový baseline](ci-v2-workflow-audit/timing.json): 100 úspešných PR workflow behov, 14 detailných behov s reálnymi started_at/completed_at jobov a krokov. Napr. tri admin-performance joby 77/72/75 s; admin stability build 26/32/23 s; Notion article build 36/24/39 s; MAP-1E build 41 s; organization profile build 27 s; admin PWA build 22 s. Vzorka ukazuje variabilitu, nie garantovanú úsporu ani účet runner minút.
- Porovnanie pred/po rovnakých workloadov, opakovaných meraní na rovnakom profile runnera, fixture, revízii a scope patrí do finálneho kroku 10; tento audit poskytuje reálny referenčný baseline. Nevykonané produkčné operácie, nezmenené aktívne workflowy.


## Plán

- [x] CI-V2-01 – baseline inventár sledovaných súborov a npm príkazov, ochrana main, reprodukovateľný scanner.
- [x] CI-V2-02 – kompletný statický source audit 156 workflowov, historické kandidáty, overlap a reálne časové vzorky; kontrolovaný before/after benchmark v kroku 10.
- [x] CI-V2-03 – spoločný NPM vstup, zachované aliasy, odstránené potvrdené duplicitné invokácie; runtime CI ešte overiť.
- [x] CI-V2-04 – pilot zdieľania dvoch oddelených build profilov v review CI, verifikácia existujúceho admin artefaktu; runtime CI a ďalšie skupiny otvorené.
- [x] CI-V2-05 – fail-closed per-file scope, report 8 skupín, selektívny pilot reviews, regresné kontrakty; reálne CI ešte overiť.
- [x] CI-V2-06 – deduplikácia troch skupín a aktívneho entity CI, parity kontrakt; ďalšie workflow-only testy a runtime CI otvorené.
- [ ] CI-V2-07 – Playwright, izolované fixtures a diagnostika.
- [ ] CI-V2-08 – bezpečná archivácia historických workflowov až po dokázaní náhrady.
- [ ] CI-V2-09 – výsledné CI a zachovanie povinných kontextov.
- [ ] CI-V2-10 – overenie parity, výkonu, spoľahlivosti; kontrola vlastníkom pred merge.

## Zásady

Jedna spoločná tematická vetva/PR. Žiadne znižovanie pokrytia, zmena produkčných operácií, potláčanie chýb alebo vypínanie testov za účelom zeleného CI. Pred pokračovaním po paralelných PR zosúladiť baseline s aktuálnym main.
