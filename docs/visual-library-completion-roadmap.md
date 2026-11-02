# Psipedia – dokončenie vizuálnej knižnice (po PR #1160)

**Rozsah:** výhradne administrácia /admin/komponenty a auditné nástroje. Mobilné ani desktopové verejné CSS šablóny sa počas inventarizácie nemenia.

## Čo bolo hotové po PR #1160

- Bezpečné serverové návrhy a desktopové publikovanie siedmich manuálne overených bannerov (D1 0152 už nasadená).
- Článkové bannery s URL publikovaných článkov (časť sa mení každý UTC deň).
- 9 kategórií samostatne stránkovaných publikovaných dynamických URL.
- Statický register importov a návrhy podobností. Import nie je dôkaz vykreslenia.
- Technická galéria existujúcich React komponentov.

## Etapa 1: Vlastnícka galéria skutočných náhľadov (tento PR, priebežne)

- [x] Sprístupniť všetkých 35 už existujúcich ukážok aj mimo technického registra.
- [x] Pridať náhľady k verejným kategóriám banner / hero / CTA / karta.
- [x] Pridať samostatnú galériu s filtrami na vyhľadávanie, navigáciu a stavy výsledkov.
- [x] Rozlíšiť ukážku reálneho komponentu s demo textom od overeného umiestnenia na verejnej URL.
- [x] Zobraziť možné statické trasy zo zdrojového kódu, nikdy nevymýšľať odkazy dynamických profilov.
- [x] Pridať regresný test zapojený do test:visual-library.
- [x] Pridať aj testy pre skutočné dátovo viazané karty s čisto fiktívnymi fixture objektmi.
- [ ] Prejsť výslednú obrazovku prihláseným administrátorom, vrátane desktopového náhľadu.

## Etapa 2: Úplný inventár viditeľných prvkov a URL

- [x] Generovať kompletný inventár všetkých verejných stránkových súborov z kódu vrátane kontaktu, partnerských a právnych stránok; nezamieňať tento zoznam za audit skutočného renderu.
- [x] Rozlíšiť statické stránky a dynamické šablóny, oddeliť kandidátov podľa importov od potvrdených výskytov.
- [x] Na statické stránky pripojiť presné auditované umiestnenia z existujúceho katalógu bannerov a vizuálnych ukážok (URL + bezpečná kotva); výslovne označiť, že nejde o kontrolu živého DOM.
- [x] Umožniť filtrovať stránky s takouto evidenciou a bez nej, a uvádzať skutočné počty.
- [ ] Zmapovať ďalšie viditeľné prvky ku konkrétnym URL a umiestneniam na základe runtime renderu; zvlášť dynamické profily, kde máme dokazateľné priradenie.
- [ ] Pri každom konkrétnom vykreslení doplniť explicitný stav overený / kandidát / neznámy / nedostupný; súčasná etapa zobrazuje kandidátov podľa kódu a počet dostupných demo náhľadov.
- [ ] Zachovať stránkovanie a limity D1 dopytov; nepreviesť celý adresár do SSR pamäte.
- [x] Otestovať úplný zdrojový register stránok vrátane šablón bez komponentových importov.
- [x] Otestovať presné porovnávanie publikovaných URL bez zamieňania podobných stránok, iných domén alebo dynamických slugov.
- [ ] Doplniť auditné testy pre reálne vykreslené URL a ochranu súkromných záznamov.

## Etapa 3: Úplné vizuálne pokrytie

- [x] Prvá vlna nových náhľadov: **9 živých variantov** z BreedCard, DirectoryCard, EventCard, HelpCard, RelatedBreedList, DirectoryCategoryNavigation a SiteFooter. Všetky dátovo viazané ukážky používajú iba fiktívne údaje. Celkový súpis teraz obsahuje **44 ukážok**.
- [x] Druhá vlna: **7 ďalších živých ukážok** – detailový zoznam poskytovaných služieb (2), filtre podujatí (2), navigácia sekcií plemena (1), urgentná karta Pomoc psom (1), zrušené podujatie (1). Celkom **51** náhľadov.
- [x] Opraviť chybu zostavenia: náhľady recenzií nebolo možné bez úpravy serverového kontraktu vložiť do klienta (`cloudflare:workers`). Tri problematické náhľady boli nahradené uvedenými bezpečnými komponentmi. Recenzie ostávajú medzi budúcimi úlohami.
- [ ] Doplniť ďalšie reálne typy s bezpečnými dátovými kontraktmi (špecifické filtre služieb, ďalšie detailové bloky, modálne stavy a ostatné navigácie).
- [x] Hlavná galéria zobrazuje aj všetky verejné komponenty bez existujúceho náhľadu (vyhľadávanie, rodiny, súbory a kandidátske stránky). Pri podporných moduloch nesľubuje samostatný vizuálny vzhľad.
- [ ] Samostatne kontrolovať desktopové varianty hero, karty, CTA, navigáciu, formuláre, zoznamy, modálne stavy, pätičku a bannerové varianty.
- [x] Merateľné zdrojové pokrytie: počet konkrétnych ukážok, počet zdrojových komponentov bez náhľadu, počet stránok s auditovanými kotvami.
- [ ] Merateľné pokrytie: počet celkových viditeľných komponentov / s náhľadom / s overenými URL.

## Etapa 4: Duplicity a jednotnosť

- [x] Rozšíriť návrhy na podobnosti aj mimo bannerov: rovnaké názvy rôznych súborov a ručne zoskupené príbuzné komponenty.
- [x] Ukázať skutočné dostupné React náhľady vedľa seba (vrátane variantov), priamo importované CSS moduly a kandidátske verejné trasy.
- [ ] Oddeliť rovnaký zdrojový komponent, vizuálny variant a skutočný duplicitný lokálny CSS override.
- [x] Pri každej zdrojovej dvojici ukázať dôvod podobnosti, porovnávané súbory a všetky kandidátske stránkové vzory s rozbalením; možnosť skopírovať auditné zadanie.
- [ ] Overiť skutočné vykreslenie a **konkrétne URL** profilov; až potom označiť skutočné duplicity a pripraviť návrh nápravy.
- [ ] Žiadne automatické mazanie, zlučovanie alebo publikovanie z dôvodu podobnosti.

## Etapa 5: Bezpečný editor

- [x] Zaviesť prvú bezpečnú úroveň editovania návrhov pre 4 reálne komponenty (spoločné CTA, sekciová hlavička, dátová karta, hero podujatí). Návrhy sa serverovo ukladajú, nie publikujú.
- [ ] Po individuálnom audite doplniť ďalšie upraviteľné typy a povoliť publikovanie len pre overené konkrétne umiestnenia.
- [x] Pred uložením návrhu zobraziť živý komponent s upravenými textmi a zaručiť, že návrh sa nepublikuje. API obsahuje iba GET a PUT.
- [ ] Pred povolením publikovania zobraziť skutočne overené a úplné dotknuté stránky.
- [ ] Rozlišovať zmenu jedného použitia a globálnej šablóny. Globálnu zmenu nemožno povoliť bez úplnej impact analýzy.
- [ ] Podporovať návrat publikovanej zmeny a jasnú správu o cache.
- [ ] Jednotlivé verejné desktopové zmeny až po schválení; mobil bez zásahu, pokiaľ vlastník výslovne nerozhodne inak.

**Pravidlo publikovania:** Návrhy z nového editora používajú výhradne oddelený namespacovaný kľúč `component-proposal:*` v už nasadenej tabuľke `visual_library_banner_edits` (D1 0152), revízie sú optimisticky zamykané. Všetky riadky sú nepublikovateľné a neprejdú pôvodným bannerovým allowlistom. Táto etapa nepridáva nové publikovateľné umiestnenia, nepridáva databázové migrácie a nemení verejný dizajn. Každá nasledujúca etapa patrí do toho istého Draft PR, kým používateľ nepovolí jeho dokončenie.
