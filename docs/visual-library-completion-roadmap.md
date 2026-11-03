# Psipedia – dokončenie vizuálnej knižnice (po PR #1160)

**Rozsah:** výhradne administrácia /admin/komponenty a auditné nástroje. Mobilné ani desktopové verejné CSS šablóny sa počas inventarizácie nemenia.

## Čo bolo hotové po PR #1160

- Bezpečné serverové návrhy a desktopové publikovanie siedmich manuálne overených bannerov (D1 0152 už nasadená).
- Článkové bannery s URL publikovaných článkov (časť sa mení každý UTC deň).
- 9 kategórií samostatne stránkovaných publikovaných dynamických URL.
- Statický register importov a návrhy podobností. Import nie je dôkaz vykreslenia.
- Technická galéria existujúcich React komponentov.

## Priorita vlastníka: všetky komponenty a skutočné zdrojové duplicity – nová etapa

- [x] Rozšíriť *zdrojový* inventár aj na JSX priamo v stránkach, layoutoch, chybových šablónach, knižničných a aplikačných súboroch, nie iba na `components/`.
- [x] Skenovať všetky CSS súbory v sledovaných zdrojových priečinkoch, nielen priame `.module.css` importy.
- [x] Oddeľovať presne rovnaké zdrojové texty, rovnaké JSX kostry a presné skupiny CSS deklarácií. Vždy uviesť jednotlivé súbory a pri CSS aj selektor a riadok.
- [x] Zobraziť kompletné výsledky s filtrom, vyhľadávaním a stránkovaním (nie iba fixných prvých 80 podobností).
- [x] Uprednostniť v navigácii administrácie „Úplný register“ a „Podobnosti a duplicity“ pred úpravami a bannermi.
- [x] Zabezpečiť read-only prevádzku a regresné testy; žiadne automatické zlúčenie ani úpravu produkčného CSS.
- [ ] Po CI manuálne skontrolovať rozšírený register na veľkej zostave a potvrdiť reálne vizuálne duplicity až porovnaním konkrétnych stránok.

**Význam pojmu všetky:** všetky staticky zistiteľné JSX zdrojové súbory a CSS súbory v `app/`, `components/`, `lib/`, `hooks/` a `styles/` podľa typu. **Nie** automaticky všetky runtime DOM uzly, jednotlivé CSS utility z externých knižníc, dynamicky generované komponenty či 100 % samostatných živých náhľadov. Pravidlá CSS sa porovnávajú len pri najmenej štyroch rôznych deklaráciách bez duplicít vlastností a v zhodnom kontexte `@media`; identické deklarácie nemusia byť totožne vykreslené.

## PR – ručné overenie HTML konkrétnych verejných URL

- [x] Pri presných statických URL s auditovanou kotvou pridať jedno-klikové overenie výskytu kotvy v aktuálnom serverovom HTML.
- [x] Rovnaké jedno-klikové overenie umožniť aj pri publikovaných dynamických URL z existujúceho stránkovaného D1 zoznamu. Pri štyroch druhoch detailu sú overované reálne DOM značky (`directory`, `adoptions`, `events`, `breeds`); pri ostatných iba načítanie dokumentu s nadpisom, bez tvrdenia o overení komponentu.
- [x] Výsledky rozlišujú „potvrdené v HTML“ / „stránka načítaná, komponent nepotvrdený“ / „v HTML nenájdené“ / „kontrola nedostupná“. Pred kliknutím zostáva len kandidát podľa kódu.
- [x] Čisto klientské `GET` s vynechanými cookies, na aktuálnom hostiteľovi, bez presmerovaní, externých URL, hromadného skenu, perzistencie, zápisov a D1 mutácií. Max. 9 sekúnd a 1,5 MB na odpoveď.
- [x] Testy URL allowlistu, markerov a neautomatického správania pridané do `test:visual-library`.
- [ ] Overiť novú admin obrazovku na konkrétnych URL v produkcii; po tomto PR bude stále chýbať plnohodnotný browser audit vrátane hydratácie/viewportu a kompletnej mapy všetkých profilových komponentov.

**Pozor:** „Potvrdené v HTML“ znamená, že kotva alebo značka sa našla v serverovej odpovedi v čase kontroly. Nie je to dôkaz viditeľnosti na konkrétnom zariadení, ani trvalá garancia. Kontroly sa nepersistujú.

## Finálna etapa pred prvou používateľskou kontrolou

- [x] Zrozumiteľný prehľad pokrytia: počet živých ukážok, jedinečných verejných zdrojových súborov s náhľadom, počet verejných stránkových šablón a 4 editovateľné typy návrhov.
- [x] Priame karty Filtre a formuláre, Navigácia a Ostatné prvky popri existujúcich banneroch, hero, CTA a kartách.
- [x] Jasne odlišovať 51 variantov od počtu rôznych komponentových súborov a od runtime overených umiestnení.
- [x] Bez zásahu do verejného CSS a bez rozšírenia práv na publikovanie.
- [ ] Potvrdiť nové CI po poslednom commite a prihlásenú administráciu vizuálne skontrolovať.

**Rozsah prvého merge:** knižnica/inventár/porovnania a bezpečné návrhy. Nejde o dokončený pixelový audit každého verejného profilu ani o rozšírené automatické publikovanie.

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
