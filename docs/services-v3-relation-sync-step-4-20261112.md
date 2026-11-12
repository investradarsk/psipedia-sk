# Služby V3 – obojsmerné pridávanie a odoberanie relácií (krok 4/6)

Dátum: 12. 11. 2026. Existujúci PR #1319, bez novej D1/Notion databázy, migrácie alebo produkčných zásahov.

## Pravidlo

Každá kanonická služba (nemenné `svc.*` alebo `svc.admin.*` ID) je samostatná voľba Áno/Neznáme (v D1 môže existovať aj explicitné Nie). Notion relácia `Služby z katalógu` vyjadruje vybrané Áno podľa ID. **Chýbajúce ID po potvrdenej zmene znamená odškrtnuté/Neznáme**, nie automaticky Nie.

Zmena služby neprepisuje ostatné služby ani iné polia profilu.

### Admin → Notion

1. Po výslovnom uložení checkboxu v Admine sa zapíše D1 voľba pomocou CAS a auditu.
2. Reconciler číta aktuálny Notion profil s potvrdeným vlastníctvom a reláciu; upraví iba vlastnosť `Služby z katalógu` a spätne overí výsledok.
3. Pri prvom prepojení bez uloženého baseline môže tento smer inicializovať reláciu **iba** explicitná zmena v Admine (`adminChoiceSave`). Hodinový beh nesmie automaticky vrátiť službu, ktorú možno niekto práve odškrtol v Notione.

### Notion → Admin

1. Podpísaný webhook potvrdí presnú zmenenú Notion vlastnosť a mapovanie profilu.
2. Po načítaní úplnej relácie sa ID prevedú priamo na existujúce kanonické služby. Nepoužíva sa názov ani voľný text ako identifikátor.
3. Ak existuje potvrdený baseline, vymazané ID resetuje príslušnú D1 voľbu Áno na **Neznáme** (CAS + audit). Pôvodne uložená voľba Nie a nesúvisiace služby zostanú nedotknuté.
4. Pri neexistujúcom baseline je dovolené bezpečné pridanie. Chýbajúce ID je neoverené odstránenie: označí sa `SERVICES_RELATION_UNVERIFIED_DELETE` na kontrolu, nie na hádanie alebo tichú obnovu.

### Súbežné zmeny

- Per-ID three-way plán vychádza z posledného potvrdeného spoločného stavu `directory_service_notion_relation_sync` (existujúca migrácia 0140).
- Ak sa v Admine zmení služba A a v Notione služba B, výsledok zachová obe nezávislé úpravy (`merged`) bez konfliktu celého zoznamu.
- Pred zmenou D1 sa znovu overí Notion relácia aj aktuálny lokálny výber. Pred Notion PATCH sa opäť overí lokálny výber aj vzdialený stav; odpoveď Notion sa potvrdí následným GET.
- Baseline sa uloží až po overení konečnej Notion relácie. Pri zmene počas operácie je výsledok pending/review; kanonické už uložené údaje sa nestratia.
- Pri zmiešanom webhooku relácia + synchronizačné metadáta sa nespustí celoprofilový merge.

### Testy

- `tests/service-catalog-notion-relation-plan.test.mjs` — odstránenie jedného alebo všetkých ID s baseline; súbežné nezávislé zmeny, bezpečné priradenie bez baseline, konflikt bez baseline.
- `tests/service-catalog-admin-lifecycle.test.mjs` — reálne D1 SQL/Audit: reset jednej Áno na Neznáme, ponechanie ostatnej Áno i explicitnej Nie, opätovné priradenie a odmietnutie neznámeho ID.
- `tests/notion-directory-sync.test.mjs` — spojenie explicitného Admin ukladania, podpísaného Notion eventu, ochrany identity a kontroly, že celoprofilový merge zostáva mimo čistých relation eventov.

## Čo zostáva

Krok 5 rieši existujúce chyby synchronizácie, chýbajúce baseline a záznamy bez stabilného mapovania. Krok 6 overí celú cestu v kontexte verejného profilu, filtrov a mapy. Tento krok nerobí hromadné automatické opravy starých konfliktov ani nelikviduje historický voľný text.
