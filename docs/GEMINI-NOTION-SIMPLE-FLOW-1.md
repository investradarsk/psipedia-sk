# GEMINI-NOTION-SIMPLE-FLOW-1

Východisko: `main` `e05ea6d911a49d753750c5b276284639d25323b1` (znovu overené pred PR).
Samostatný opravný PR; bez merge, deploymentu, platených volaní, produkčných zápisov a migrácií.

## Zistené prekážky a oprava

- Worker vyžadoval dôkazy jednotlivých polí, presné zhody Google citácií, minimálne kontakty/texty a odmietal možné obchodné duplicity. Aktívna cesta teraz používa jeden schema-aware builder v existujúcom pomocnom module. Výskum, kategóriový prompt a odborný slovenský popis zostávajú úlohou Gemini; kvalitu posudzuje človek.
- Prístup k Notion výsledkom bol obmedzený na prvých 50. Úplný snapshot zdroja sa načíta cez kurzory; `search_notion` vracia explicitné `offset`, `has_more`, `next_offset`, `total_records` a najviac 100 výsledkov na odpoveď. Prázdny query sprístupní všetky záznamy. Odpadli opakované úplné prehľadávania pred každým zápisom. Poškodený/neúplný protokol stránkovania je naďalej technická chyba.
- Nepovinné polia sa zapisujú podľa typov získaných z Notion metadata. Neznáme select možnosti sa nevytvárajú. Neplatné voliteľné hodnoty sa vynechajú s upozornením; dátumy a časy sa môžu normalizovať bez doplnenia vymyslených údajov. Povinná zostáva identita názvu, kategórie/typu prípadu a bezpečný súkromný stav.
- Možná duplicita názvu/zdroja zostáva neverejným konceptom s poznámkou, bez zlúčenia. Odstránený je aj obchodný duplicate veto pred importom do Adresára. Opakovanie toho istého kandidáta v jednom behu vráti pôvodný výsledok bez druhého POST; nezvyšuje počet obchodných duplicít. Neistý POST sa neopakuje. Opätovné spustenie toho istého GitHub workflow (`GITHUB_RUN_ATTEMPT > 1`) vyžaduje manuálne preverenie.
- Dôveryhodný import dostane stabilný technický slug podľa Notion page ID, ak chýba. Pôvodné mapovanie, importné zámky a append-only pôvod stránky zostávajú zachované. Nový koncept nemôže získať verejný stav z Notionu.
- Existujúce Events/Help store validátory povoľujú neúplné koncepty; pôvodné požiadavky publikovania zostávajú. Existujúce formuláre umožňujú uložiť neúplný koncept a server naďalej validuje publikovanie aj neplatné zadané hodnoty.
- Technické limity požiadaviek, ochrana pred slučkami a jedno zotavenie pri nejednoznačnom prázdnom výsledku zostávajú. Nie sú redakčným hodnotením kvality. Výslovný platný nulový výsledok nevyvolá ďalší platený krok; nevzniká profil iba kvôli poznámke.

Staršie exportované špecializované validátory zostávajú pre kompatibilitu a ich vlastné testy; aktívny worker ich už nepoužíva ako podmienku kvality konceptu.

## Všetkých 22 kategórií a existujúce editory

| Notion zdroj | Kategórie | Import/editor |
| --- | --- | --- |
| Adresár | veterinari, treneri, kynologicke-kluby, chovatelske-kluby, chovatelske-stanice, salony-a-sluzby, hotely-a-opatrovanie, vencenie, fyzioterapia, dalsie-sluzby | existujúci Directory |
| Podujatia | vystavy, preteky, seminare, treningy, stretnutia, dalsie | existujúci Events |
| Pomoc psom | docasna-opatera, zbierky, dobrovolnictvo | existujúci generic Help |
| Organizácie | utulky | existujúci Organization, SHELTER |
| Adopcie | adopcia | existujúci Adoption |
| Stratené a nájdené | stratene-a-najdene | existujúci Lost/Found, LOST/FOUND |

Existujúce kategóriové prompty, Actions dispatch, podpis callbacku, overenie Notion parenta, registrácia stránok a automatické vyvolanie canonical importu ostávajú zachované. Nemenný registračný záznam oprávňuje iba súkromný import. Nevytvára sa nová automatizácia ani dátová vrstva.

## Gemini poznámka

Používa sa výhradne už existujúce pole `Gemini poznámka`; žiadny endpoint nemení Notion schému. Gemini môže odovzdať nepovinné `gemini_note`; builder pridá konkrétne upozornenia na vynechaný formát, možné duplicity alebo súkromné údaje. Bez poznámky/upozornenia zostane pole prázdne.

Poznámka sa zobrazí v Gemini zozname aj v existujúcom modálnom okne príslušného konceptu. Je oddelená od moderátorských `Poznámky` a od `Popis`. Nie je vo whitelistoch canonical synchronizácie, vstupoch editora ani verejnom profile. Testy kontrolujú neprenášanie poznámky do canonical payloadu a odosielaného formulára.

Nové čisté opisy nepotrebujú technický podpis „Dôkazy:“ v obsahu. Agenda review ich identifikuje cez existujúci register podpísaných callbackov, presnú kategóriu, zdroj a súkromný stav. Staršie koncepty zostávajú rozpoznateľné pôvodným markerom; marker nikdy sám neoprávňuje dôveryhodný import.

Ochrana citlivých prípadov platí aj pre poznámku: kontakty, presné adresy a GPS sa neprepisujú do varovaní. Lost/Found nezapisuje verejný kontakt, presnú polohu ani publikačné/identity polia. Regexová ochrana je základná ochrana, nie záruka rozpoznania každého spôsobu zápisu osobných údajov; pred publikovaním je potrebná ľudská kontrola.

## Overenie

Všetky Gemini/Notion/Psipedia volania v testoch sú nahradené mockmi pred načítaním pracovníka. Žiadne platené volanie ani produkčný import nebol spustený.

- 361 testov: existujúce foundation, dispatch/callback, pôvod stránok, canonical adaptéry, review/locks a obojsmerný sync.
- 283 testov: offline worker a pomocné polia vrátane všetkých 22 kategórií, poznámky vo všetkých šiestich zdrojoch, 151 záznamov cez stránkovanie, chýbajúcich dôkazov/kontaktov, neplatných voliteľných dát, možných duplicít, technického replay a neistých POST.
- Skutočné produkčné Events/Help normalizačné funkcie sú otestované na neúplnom koncepte a jednotlivých zachovaných požiadavkách publikovania; nejde iba o mock write adaptérov.
- Existujúci Playwright test: mobil 390 px a desktop 1280 px, reject/restore/save, zobrazenie poznámky, žiadna poznámka v odoslanom obsahu a žiadne horizontálne pretekanie.
- Review API autorizácia: prešla.
- `npm run build`: prešiel vrátane validácie artefaktu a jeho breed regresií.
- `npm run lint`: 0 chýb, 101 existujúcich warnings; cielený lint upravených zdrojov bez výstupu.
- Config: 14 testov; migration safety: 123 testov; CI scope guard: prešiel.
- Samostatný `tsc --noEmit` nie je zelený už na main. Izolovaný checkout rovnakého main s rovnakými závislosťami/types: 691 diagnostík; zmena: 689. V upravených súboroch nepribudli diagnostiky, dva pôvodné problémy v agenda review odstraňuje explicitná anotácia odpovede. Mimo zmeny sa líši poradie union typov a diagnostická pomoc pri rovnakom chýbajúcom symbole; nejde o čistý celorepozitárový TypeScript výsledok.

## Čo overiť až po schválení a nasadení

Kód je pripravený na celý existujúci tok; offline kontrakty nepredstavujú potvrdenie živého toku.

1. Overiť aktuálne oprávnenia Notion integrácie a existujúce rich-text pole `Gemini poznámka` vo všetkých šiestich živých zdrojoch. Runtime číta skutočnú schému; tento PR ju v produkcii neoveroval a nič do nej nevytváral.
2. Pri samostatne autorizovanom platenom behu overiť používateľský prompt → Google Search → Notion súkromný koncept → prijatý podpísaný callback → správny canonical koncept/editor. Overiť všetkých šesť zdrojov a následne zvyšné kategórie; bez automatického publikovania.
3. Skontrolovať kvalitu slovenčiny a faktov, spracovanie možnej duplicity a doplnenie neúplného konceptu človekom. Poznámka sa má zobraziť iba v Gemini administrácii.
4. Pri nulovom výsledku overiť existujúcu históriu behov a neprítomnosť falošného profilu. Pri neistom POST preveriť Notion pred novým jobom; workflow sa nesmie bez preverenia zopakovať.
5. Overiť reálne oneskorenia/rate limits Notion a poskytovateľa. Neisté zápisy ani následné externé problémy médií sa nesmú označiť ako úspešný import; pôvodný koncept a história musia zostať dohľadateľné.

## Riziko

Viac neúplných a potenciálne duplicitných konceptov je zámerný výsledok. Vyžadujú redakčnú kontrolu; samotná existencia konceptu nie je dôkazom kvality či oprávnením publikovať. Verejné čítanie a publikačné požiadavky sa nemenia. PR nezavádza migrácie, nové endpointy, R2 zmeny ani automatický merge.
