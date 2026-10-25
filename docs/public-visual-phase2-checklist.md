# PSIPEDIA.SK — Verejný vizuál, etapa 2 (PÄŤ BODOV)

Tento zoznam je **záväzné poradie** prác pre nové PR nadväzujúce na #1047. Nepridávať nové body ani nesúvisiace úpravy. Pri každom pokračovaní aktualizovať stav `[x]`/`[ ]` a oznámiť počet zostávajúcich bodov. Komponenty už zjednotené v #1047 používať, nevytvárať paralelný vizuálny systém.

- [x] **1. Detaily stránok** — zjednotiť vizuál nadpisov sekcií, údajových štítkov/hodnôt a rámov fotografií na detailoch článkov, plemien, profilov Adresára, podujatí a Pomoci psom. Jediný zdroj typografických a media tokenov v `app/design-system.css`. Zachovať rozloženie, čitateľnú šírku článkov, pomery fotografií, obsah, stavové a bezpečnostné upozornenia. **Implementované v tejto vetve; CI a screenshotová akceptácia ešte prebieha / čaká na vykonanie.**
- [ ] **2. Bannery a informačné hlášky** — rovnaký vzhľad pre rovnaký účel, zachovať odlišné warning/urgent významy.
- [ ] **3. Filtre a vyhľadávanie** — reset, aktívne stavy, mobilné dialógy a jednotné ovládanie naprieč sekciami, bez zmeny URL/GET logiky.
- [ ] **4. Šírky, rozostupy a typografia** — zvyšné stránky, ktoré sa nezhodujú v zarovnaní, šírke, medzerách a mobilnom správaní.
- [ ] **5. Vizuálna akceptácia celého webu** — screenshoty na 1440/390/320 px, detaily so seedovanými dátami; opraviť identifikované odchýlky.

**Stav:** bod 1 kódovo dokončený, **zostávajú 4 body**. Finálne vizuálne schválenie bodu 1 je súčasťou bodu 5.

## Bezpečnosť a prevzatie

Len verejné prezentovanie; bez úprav API, D1, synchronizácie, adminu, textov a osobných údajov. Žiadna zmena zdroja a orezania fotografie. Existujúce detailové layouty ostávajú funkčne rovnaké. Zmeny v CSS kontrolovať regresnými testami; ak existujúce testy predpokladajú iný vizuál, aktualizovať ich podľa odsúhlaseného spoločného kontraktu, nie ich rušiť.

**Závislosť:** PR #1047 v čase vytvorenia tejto vetvy ešte **nebol mergnutý**. Toto je dočasne nadväzujúce (stacked) Draft PR voči `codex/public-visual-consistency-20261025`. Po mergnutí #1047 je potrebné prepnúť base na `main` a preveriť CI/diff; neprepájať bez overenia.
