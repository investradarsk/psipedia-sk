# PSIPEDIA.SK — Verejný vizuál, etapa 2 (PÄŤ BODOV)

Tento zoznam je **záväzné poradie** prác pre nové PR nadväzujúce na #1047. Nepridávať nové body ani nesúvisiace úpravy. Pri každom pokračovaní aktualizovať stav `[x]`/`[ ]` a oznámiť počet zostávajúcich bodov. Komponenty už zjednotené v #1047 používať, nevytvárať paralelný vizuálny systém.

- [x] **1. Detaily stránok** — zjednotiť vizuál nadpisov sekcií, údajových štítkov/hodnôt a rámov fotografií na detailoch článkov, plemien, profilov Adresára, podujatí a Pomoci psom. Jediný zdroj typografických a media tokenov v `app/design-system.css`. Zachovať rozloženie, čitateľnú šírku článkov, pomery fotografií, obsah, stavové a bezpečnostné upozornenia. **Implementované; akceptačné screenshoty sú zaznamenané nižšie.**
- [x] **2. Bannery a informačné hlášky** — kontextové, magazínové a článkové promo používajú spoločný `--ps-banner-border` a `--ps-banner-radius`; informačné hlášky používajú rovnaký rám a štyri rozlíšené sémantické farby (info, success, warning, error). Fotografické/urgentné bannery, vlastné varovania a ich CTA, farby a obrázky ostávajú zachované. **Kód hotový; vizuálna akceptácia je bod 5.**
- [x] **3. Filtre a vyhľadávanie** — spoločné odstrániteľné aktívne filtre a jasný reset v Adresári, Podujatiach, Pomoci psom a Plemenách; zachované GET a závislé parametre (FCI skupina→sekcia, kraj→okres/mesto), kanonické cesty a URL pri zmene typu podujatia. Mobilné disclosure Podujatí dostalo spoločný ovládací radius, min. 44 px a viditeľný focus; existujúci modal Adresára zostal zachovaný. **Implementované, finálna vizuálna akceptácia je bod 5.**
- [x] **4. Šírky, rozostupy a typografia** — jednotné tokeny pre nadpisy sekcií, medzery zoznamov a šírku vyhľadávacích panelov v Adresári, Pomoci psom, Podujatiach, Plemenách, Novinkách a prehľade článkov. Odstránené lokálne zúženie príbuzných Podujatí; automaticky používajú spoločnú responzívnu `.shell`. Bez zásahu do layoutu mapy, fotografií, SEO či údajov. **Kód hotový; screenshotová akceptácia je bod 5.**
- [x] **5. Vizuálna akceptácia celého webu** — manuálne porovnaných 8 hlavných verejných routov pri 1440/390/320 px a ich full-page snímok, vrátane skutočného detailu bieleho švajčiarskeho ovčiaka a izolovaného testovacieho článku. Každá z 24 kontrol v GitHub Actions na commite `754ed88f` vrátila HTTP 200, všetky mali 0 px vodorovného pretekania. Na porovnaných snímkach neboli zistené kritické vizuálne regresie.

**Stav:** všetkých **5/5 bodov** je kódovo a vizuálne spracovaných, **zostáva 0 bodov**. GitHub CI musí byť pred merge zelené na aktuálnom HEAD.

## Bezpečnosť a prevzatie

Len verejné prezentovanie; bez úprav API, D1, synchronizácie, adminu, textov a osobných údajov. Žiadna zmena zdroja a orezania fotografie. Existujúce detailové layouty ostávajú funkčne rovnaké. Zmeny v CSS kontrolovať regresnými testami; ak existujúce testy predpokladajú iný vizuál, aktualizovať ich podľa odsúhlaseného spoločného kontraktu, nie ich rušiť.

**Závislosť:** PR #1047 bol mergnutý. PR #1053 cieli `main`; finálne testy a stav merge treba overovať podľa posledného HEAD.

## Akceptačné dôkazy — 25. október 2026

**GitHub Actions:** [PR Visual Evidence — úspešný beh #40236117843](https://github.com/investradarsk/psipedia-sk/actions/runs/40236117843). Uložený artifact `psipedia-pr-visual-1053-40236117843` obsahuje `manifest.json`, 24 párov viewport/full-page PNG, `summary.md` a lokálny server log. Zachytený SHA je `754ed88f362fac6a8d5f736e127f2bf8f0aab626`.

- Desktop `1440×900`, mobil `390×844`, úzky mobil `320×720`.
- URL: `/plemena`, `/adresar`, `/podujatia`, `/pomoc-psom`, `/plemena/biely-svajciarsky-ovciak`, `/recenzie/e2e-testovacia-recenzia-krmiva`, `/mapa`, `/novinky`.
- **24/24** HTTP 200, **24/24** 0 px vodorovného dokumentového overflow, všetkých 48 PNG úspešne uložených. Manuálne prezreté prehľady 8 viewportov pri každej z 3 šírok; spoločné zarovnanie hero/vyhľadávania/nadpisov, žiadne viditeľné kritické zalomenia.
- Plemeno je deterministická lokálna fixture z existujúceho `bootstrap-breed-e2e.mjs` so skutočným obrazovým assetom; recenzný článok je izolovaný testovací záznam vytvorený `bootstrap-phase5-e2e.mjs full`. Žiadny zápis do produkčných D1, žiadne externé publikovanie.
- Cookie lišta sa v izolovanom kontexte odmieta pred vizuálnym zachytením, aby nezakrývala obsah. Dokumentový overflow je tvrdá testová chyba, nie iba informácia.
- Limit: ide o *izolovaný lokálny build*; mapa nemá produkčný Google Maps kľúč a niektoré reálne databázové výsledky a médiá nie sú prítomné. Akceptácia nepredstiera overenie živých produkčných dát, všetkých jednotlivých profilov alebo obsahových variantov.
- Ak sa po tomto dokumentačnom/testovom commite zmení vizuálny kód, treba zachytiť nové screenshoty. Pred merge vyžadovať posledné green CI.

