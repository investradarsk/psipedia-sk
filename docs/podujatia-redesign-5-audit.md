# PODUJATIA-REDESIGN-5/5 — FINÁLNY VÝSLEDOK

Dátum: 2026-10-11. Vetva: `feat/podujatia-redesign-5-final-polish`.
Base main: `cfb433f69e0b9aa4683346ec533e60ec8a45c34f`. Head identifikuje commit tohto reportu a PR.

## Výsledok a audit

Audit podľa product-design:audit začal screenshotmi skutočných verejných rout, pred úpravami. Referenciou bola homepage a zadanie; samostatný schválený mockup nebol dostupný. Akceptované screenshoty pochádzajú z lokálneho produkčného buildu cez Wrangler, nie z náhradnej stránky. Chybné prvé snímky s vývojovým overlayom alebo nedočítanými obrázkami boli vyradené.

| Krok používateľa | Zistenie / oprava | Výsledok |
|---|---|---|
| 1. Hero → hľadanie | Homepage typografia, farby, šírka a fotografia sú konzistentné. Jedno H1 a jedno viditeľné lokálne vyhľadávanie. | VERIFIED |
| 2. Mesiac → deň | Kalendár, legenda, viaceré typy, veľké počty a viacdňové udalosti zostali čitateľné; počty sú nezávislé od 12 kariet stránky. | VERIFIED |
| 3. Organizátor → pridanie | Banner bol príliš vysoký pre vnorený padding spoločného komponentu. Opravený iba v Podujatiach: približne 230 → 130 px desktop, CTA vedľa textu. Existujúca cieľová URL zachovaná. | DONE / VERIFIED |
| 4. Filtre → výsledky → ďalšia stránka | Dátumové čipy nemali zrozumiteľný kontext; pridané názvy filtrov. GET formuláre smerujú na #events-list, kotvy majú odstup od sticky hlavičky, prvky explicitný focus. Native mobilné details už správne skrývalo formulár pred klávesnicou. | DONE / VERIFIED |
| 5. Karta → detail → návrat | Zachované filtre, kategória, stránka aj vybraný deň. Obrázky sú responzívne. V detaili odhalená staršia kolízia mriežky súvisiacich kariet, ktorá zväčšovala fotografie; doplnený chýbajúci obrazový stĺpec pre desktop aj mobil. | DONE / VERIFIED |

Pôvodných šesť ilustrácií a ich farby sa nemenili. Pridané sú iba 640×400 a 960×600 WebP varianty; pôvodné 1280×800 zostávajú dostupné. Reálne fotografie používajú existujúci responsiveMediaSrcSet pre podporované médiá; režimy auto/contain/cover a fallback pri chybe ostávajú zachované. Nepoužívaný neutralMedia štýl odstránený. Žiadna nová závislosť, globálna CSS úprava, zmena administrácie, schémy, migrácií, Notion alebo Gemini.

## Vizuálne dôkazy a mobil

Overené viewporty: **320×700, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080 a landscape 700×320**. Bez horizontálneho overflow a JS page errors. Kontrola 1/2/3 stĺpcov, dlhého názvu, Online, chýbajúceho miesta, date/status badge, čitateľnosti kalendára, otvorenia/zatvorenia filtrov dotykom a klávesnicou, skrytých polí mimo focus a výsledkov pod sticky hlavičkou.

Lokálne dôkazy v ignorovanom `outputs/redesign5/{baseline,final}/`: `landing-WIDTH.png`, `homepage-desktop.png`, `hero.png`, `calendar.png`, `banner.png`, `sidebar-grid.png`, `filtered-desktop.png`, `mobile-open-filters.png`, `desktop-detail-{real,fallback}.png`, `mobile-detail-{real,fallback}.png`, `audit.json`, `performance.json`, `sql.json`. `final/viewport-matrix.png` sumarizuje viewporty. Súbory sú dostupné v pracovnom prostredí; nie sú súčasťou git commitu. CI archivuje screenshoty skutočných rout a testové dôkazy v `events-final-route-evidence`.

Fotografia psa na šírku a tmavší obrázok boli skutočné existujúce médiá. Portrét a svetlý plagát boli syntetické SVG rozmerové fixtures, nie fotografie reálneho portrétu psa; testujú rozloženie a contain/auto. Vizuálne snímky nútene dočítali lazy obrázky; výkonnostné merania túto zmenu nepoužívajú.

## Funkčné overenie

- Vyhľadávanie, normalizácia lokality, kombinácie filtrov a GET bez JavaScriptu.
- Presne 12 kariet na plnej stránke, správny celkový počet a posledná stránka pri 601 zhodách; kalendár nepočíta iba aktuálnu stránku.
- Zmena filtra resetuje stránkovanie, radenie a URL stav ostávajú zachované. Dátumy Od/Do sú označené; obrátený rozsah ukáže validáciu a prázdny stav.
- Kalendárny deň, mesačná navigácia, viacdňová udalosť, kategórie a počty podľa všetkých zodpovedajúcich publikovaných udalostí.
- Návrat z detailu na hlavnú stránku 2, kategóriu strany 2 aj vybraný deň zachová pathname a query.
- Vlastný obrázok má prioritu; všetkých šesť typov fallbacku, chyba fotografie, súvisiace karty, zrušené a ukončené udalosti.
- Canonical zostáva čistý; filtrované výsledky noindex. Axe bez serious/critical porušení, bez vypínania pravidiel.

## Performance: pred / po

Tri merania na viewport, medián; skutočný lokálny produkčný build, Chromium, vypnutá cache, bez simulovaného CPU alebo siete, rovnaká query 601 výsledkov. Prenosy JS/obrázkov merané cez CDP encodedDataLength; HTML cez Navigation Timing encodedBodySize. Pôvodný build mal runtime fáz 1–4 z main. Baseline bežal aj počas snímkovania: časové hodnoty sú pozorovania s lokálnym šumom, nie dôkaz zrýchlenia servera alebo produkčné Core Web Vitals.

| Metrika | 390 px pred | 390 px po | 1440 px pred | 1440 px po |
|---|---:|---:|---:|---:|
| TTFB ms | 150.5 | 92.8 | 169 | 85 |
| LCP ms | 388 | 304 | 576 | 324 |
| CLS | 0 | 0 | 0 | 0 |
| HTML bytes | 17899 | 18333 | 17899 | 18333 |
| JS transfer bytes | 132031 | 132738 | 132007 | 132757 |
| Image transfer bytes | 94063 | 94063 | 1128315 | 440534 |
| Network requests | 26 | 27 | 38 | 39 |

Spoľahlivý prínos: desktop preniesol **o 60.96 % menej obrazových dát**. Mobile nad prvým viewportom preniesol rovnaké dáta vďaka lazy loading; úsporu tam netvrdíme. HTML/JS mierne narástli o responzívne atribúty a stav filtrov. Počet requestov mierne narástol, nie klesol. INP a poľné CWV sú **UNVERIFIED**: krátka lokálna relácia nenahrádza reálne používateľské dáta.

SQL read-only profil používal skutočné listing/calendar funkcie nad lokálnym SQLite s 629 fixtures. Bez vybraného dňa 3 dotazy; s náhľadom dňa 4. COUNT vracia jeden riadok, listing a náhľad najviac 12, kalendár agregované day/type riadky (horná hranica 31×6), bez N+1 a bez neobmedzeného načítania eventov do JS. Medián celkovej lokálnej operácie pred/po: bez hľadania 5.57/4.11 ms; hľadanie 39.80/45.01 ms; hľadanie+mesto 68.96/51.25 ms. SQL sa nemenilo; rozdiely sú šum. Normalizované hľadanie má drahšie SQL, ale na tomto datasete neodôvodnilo zmenu architektúry. Výkon vzdialeného D1 a väčších produkčných dát **UNVERIFIED / OPEN**.

Reprodukcia: explicitný `PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 node tests/helpers/events-final-local-fixtures.mjs` iba proti lokálnemu D1; `node tests/helpers/events-performance-audit.mjs final http://localhost:5175`; `node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs tests/helpers/events-listing-profile.mjs final`. Profil je read-only. Lokálne fixtures sú vlastnícky označené a po audite odstránené; produkčné dáta neboli upravované.

## Validácia a stav

**VERIFIED:** 50 cielených unit/integration testov; všetkých 30 prípadov skutočných rout desktop/mobile (27 v prvom behu, tri po oprave testového čakania alebo nesprávnej testovej URL; následné cielené reruny); 6 artwork browser testov. Následná oprava banneru overená dvoma viewport-matrix prípadmi, oprava súvisiacich kariet dvoma detail-return prípadmi s kontrolou rozmerov. Žiadny test nebol odstránený. Existujúci test DOM poradia teraz čaká na dokončenie navigácie.

**VERIFIED:** lint zmenených súborov, produkčný build, deploy artifact, diff whitespace a CI scope guard. TypeScript: 1866 existujúcich diagnostík na clean main aj vetve, **0 nových** po normalizácii pozícií a poradia union typov. Celá staršia TS báza preto nie je zelená. Artefakt: 659 súborov, SHA256 `774516f2daa48aced55544808a76ac0b21a75820164d8509ec8c8fbaef4623f1`.

**DONE:** cielená events workflow vrátane skutočných rout a screenshotových artefaktov; bootstrap existujúcej schémy a fixtures iba v izolovanom lokálnom D1, overený aj na prázdnom SQLite. Široký existujúci Playwright workflow dostal rovnaký fixture bootstrap, aby nové cases fungovali aj pri jeho oprávnenom spustení. CI scope guard pre 50 workflows zachoval required checks. Kompletný npm test nebol spustený.

**UNVERIFIED:** GitHub CI výsledok — podľa zadania sa kontroluje iba začiatok, bez čakania. Produkčné read-only HTTP overenie z tohto prostredia skončilo **403 na prístupovej vrstve**, preto nepotvrdzuje nasadený commit ani produkčné správanie. Produkcia nebola menená.

**OPEN:** produkčné CWV/INP a vzdialený D1 profil vyžadujú prístup a poľné dáta. PR sa nemerguje a auto-merge sa nezapína.

## Zmenené súbory

- `components/event-card.tsx`, `event-detail.tsx`, `event-image.tsx`, `event-listing-results.tsx`, `events-public.module.css`.
- `lib/event-type-presentation.ts`.
- `public/images/events/defaults/{vystavy,preteky,seminare,treningy,stretnutia,ostatne}-{640,960}.webp` (12 súborov).
- `tests/event-fallback-images.test.mjs`, `tests/events-phase3.test.mjs`.
- `tests/e2e/events-calendar-redesign.spec.ts`, `tests/e2e/events-listing-redesign.spec.ts`.
- `tests/helpers/events-final-local-fixtures.mjs`, `events-listing-profile.mjs`, `events-performance-audit.mjs`.
- `.github/workflows/events-fallback-images.yml`, `.github/workflows/playwright-e2e.yml`.
- `docs/podujatia-redesign-5-audit.md`.

Cleanup overený: obe lokálne databázy 629 → 0 vlastných auditných fixtures; žiadny produkčný zápis.
