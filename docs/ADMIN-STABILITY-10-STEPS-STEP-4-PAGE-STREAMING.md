# Psipedia Admin – krok 4/10: hlavný obsah bez blokujúcich doplnkov

**PR:** #1318 · **Vetva:** `fix/admin-stability-10-steps-20261111`  
**Bezpečnosť:** bez zápisov do produkčnej D1, Notion, zmeny schémy, importu ani lifecycle API.

## Overené zistenia v kóde

1. `app/admin/organizacie/[id]/page.tsx` čakal na šesť čítaní naraz. Zlyhanie review, fundraisingu alebo návrhov automatizácie predtým zrušilo vykreslenie celého editora.
2. `app/admin/organizacie/page.tsx`, `app/admin/adopcie/page.tsx`, `app/admin/stratene-najdene/page.tsx`, `app/admin/pomoc-psom/page.tsx` a `app/admin/recenzie/page.tsx` čakali na zoznamy alebo summary ešte pred vytvorením `AdminShell`.
3. `app/admin/clanky/page.tsx` spájal hlavný zoznam článkov s číselníkom tém cez `Promise.all`; pomalý alebo chybný číselník blokoval články.
4. `app/admin/operations/page.tsx` spájal hlavný zoznam upozornení s voliteľnými Notion alertmi v jednej `Promise.all` hranici.
5. `/admin` homepage, `/admin/plemena`, `/admin/adresar`, `/admin/sluzby-pre-psov`, `/admin/podujatia` už používali streamovanie hlavných zoznamov. `/admin/nastavenia` neobsahuje zodpovedajúce serverové zoznamové dotazy. Tieto funkčné hranice sa bezdôvodne nemenili.

## Implementované zmeny

### Organizácie – detail (vrátane /admin/organizacie/128)

- **Povinný základ:** autorizácia, kanonický profil a potvrdené lokality. Tieto údaje sa nenačítajú ako prázdne pri chybe, aby pri uložení nehrozilo prepísanie reálnej adresy.
- **Nepovinné čítania:** samostatné `Suspense` pre redakčné overenie, kontrolu duplicít, fundraising a návrhy automatizácie.
- **Návrhy automatizácie:** React 19 `use(promise)` v izolovanom `AdminOrganizationSuggestions` pod `Suspense`. `onAccepted(updatedValues, updatedAt)` stále mení pôvodný formulár, nahrádza sa iba blokujúce čítanie.
- **Fundraising:** pri zlyhaní sa objaví oznámenie, ale neotvorí sa editovateľný prázdny zoznam. Existujúce metódy a ich zápisová cesta zostávajú nezmenené.
- **Redakčné overenie:** chyba neznamená „neoverené“; používateľ vidí nedostupný stav.
- **Duplicity:** výpadok čítania zobrazí informáciu, nie chybu celej stránky.

### Zoznamy – shell je viditeľný pred dátami

- `/admin/organizacie`: `OrganizationList` pod `Suspense`.
- `/admin/adopcie`: `AdoptionContent` pod `Suspense`.
- `/admin/stratene-najdene`: `LostFoundContent` pod `Suspense`. Výpadok počtov zobrazuje „—“ namiesto nuly; záznamy zostanú dostupné.
- `/admin/pomoc-psom`: `HelpTable` pod `Suspense`, kategórie a shell sa načítajú pred tabuľkou.
- `/admin/recenzie`: súhrnné agregáty cez `Promise.allSettled` až vo vnútri `ReviewOverview` pod `Suspense`; existujúca degradácia zostáva zachovaná.
- Vo všetkých zoznamoch s redakčným overením chyba overovania nevydáva neznámy stav za „neoverené“; ovládanie je pri chybe dočasne neprístupné.

### Články – tabuľka a témy oddelene

- Zoznam článkov sa načítava vlastným serverovým promise.
- Číselník tém sa posiela ako samostatný React 19 promise do klientského `SuspendedArticleTopics`; načítava sa len filter pod lokálnym `Suspense`.
- Po zlyhaní je filter tém **vypnutý**, nie naplnený falošným zoznamom. Publikované/konceptové počty, serverové filtre, tabuľka a editor zostávajú v pôvodnom kontrakte.

### Upozornenia – Notion neblokuje moderáciu

- `AdminOperationsContent` čaká len na hlavný `attentionPromise`.
- `AdminNotionAlertsPanel` čaká samostatne na `notionAlertsPromise`; hneď pri vytvorení je pripojený catch.
- Pri chybe upozornení sa nezobrazuje nepravdivý „0 problémov“. Hlavná moderácia ostáva viditeľná.

## Testy a verifikácia

- Aktualizované existujúce source-contract testy `tests/admin-editor-read-performance.test.mjs` a `tests/admin-operations-streaming.test.mjs`.
- Nový `tests/admin-page-streaming-step4.test.mjs`: overuje streaming shellu, chyby review/counts, izoláciu doplnkov a oddelenie tém/Notion.
- Nová regresia je pridaná do existujúceho `test:admin-pwa` skriptu; nepridali sa nové knižnice.

**Skutočné spustenie build/unit/Playwright:** ešte neprebehlo. Neuvádzajú sa namerané časy pred/po ani tvrdenie, že je odstránený každý pád. Potrebné sú skutočné browser a D1 merania a reprodukčné testy, najmä `/admin/organizacie/128`. To patrí do krokov 5, 9 a 10.

## Zostávajúce riziká / ďalší krok

- **Krok 5:** `EXPLAIN QUERY PLAN`, indexy, pomalé dotazy, N+1, duplicitné D1/API požiadavky, sekundárne chyby.
- **Krok 6:** klientské re-renderovanie, bundle, memory a veľké tabuľky.
- **Krok 7/8:** iOS/WebKit/PWA, recovery po chybe, CSS/pád na konkrétnom detaile.
- **Krok 9/10:** Playwright, merania, build/CI, konflikt s novším `main`, finálny rebase a regresná správa.

Do zmerania nepripisujeme konkrétne časové zrýchlenie. `Suspense` zlepšuje dostupnosť shellu a odolnosť voči doplnkovým výpadkom; nezaručuje automaticky kratšie trvanie SQL.
