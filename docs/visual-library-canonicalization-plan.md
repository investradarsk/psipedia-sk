# Psipedia.sk – vizuálna knižnica a zjednotenie komponentov

**Stav:** implementovaná majiteľská galéria, technický audit, porovnávanie A/B a serverový front rozhodnutí. Skutočné zlúčenie komponentov ešte neprebehlo.  
**Východiskový PR:** #1181 (Draft, zdrojový JSX/CSS inventár).  
**Primárny používateľ:** majiteľ projektu bez potreby pracovať s kódom.  
**Primárny rozsah:** verejný web (desktop); inventár neskôr aj pre administráciu. Mobilné zobrazenie zachovať bez nevyžiadaných úprav.  
**Základné pravidlo:** jeden logický vizuálny prvok = jedna kanonická implementácia; stránka používa tú istú implementáciu a mení len explicitne povolený obsah/variant.

## Čo vlastník potrebuje vidieť

V /admin/komponenty mať jednoduchý vizuálny katalóg, nie zoznam technických súborov:

1. **Šablóny stránok** – homepage, články, novinky, šteniatka, plemená, zdravie, výcvik, služby a ich profily, podujatia, pomoc psom, recenzie, kontakt a ostatné verejné stránky.
2. **Komponenty** – bannery, hero, CTA, karty, filtre, formuláre, navigácie, tabuľky, modálne okná, informačné bloky a pätička.
3. **Podobné / duplicity** – vizuálne porovnanie dvoch či viacerých prvkov s dôkazmi, nie len porovnanie kódu.
4. **Na zjednotenie** – schválené rozhodnutia a stav následnej implementácie.

Každá karta vizuálneho prvku:
- názov a kategória zrozumiteľné pre človeka;
- náhľad skutočného komponentu (preferovať reálny React render so skutočnými štýlmi); keď render nie je možný, overený screenshot konkrétneho umiestnenia;
- stav dôkazu: „živý náhľad“, „overená URL/screenshot“, „demo náhľad“, „kandidát podľa kódu“, „bez náhľadu“;
- všetky potvrdené URL s umiestnením na stránke; kandidátske trasy jasne odlišovať od potvrdených;
- odkaz na otvorenie skutočnej stránky;
- odkaz „Porovnať“ a zobrazenie ďalších podobných prvkov.

Technické údaje (súbory, CSS, podobnosť AST) iba v rozbaľovacích detailoch pre vývojára. Vyhľadávanie musí nájsť názov, účel, rodinu, URL aj používaný text.

## Priebežný stav implementácie (prvé štyri vlny)

- [x] Nová predvolená karta **Vizuálny prehľad** namiesto technického registra.
- [x] Dlaždice s reálne vykreslenými komponentmi a stránkovaním po 12 skupinách.
- [x] Variácie jedného potvrdeného komponentu pod jednou kartou (nezamieňať spoločný súbor s jedným komponentom).
- [x] Hľadanie podľa názvu, účelu, zdrojového súboru a kandidátskej trasy.
- [x] Detail vybraného prvku: zväčšený živý náhľad, prepínač variantov, kandidátske verejné trasy a skryté technické detaily.
- [x] Samostatná karta technického registra a prechod na existujúce porovnávanie.
- [x] Zoznam nehotových náhľadov zachovaný, no nezahlcuje hlavnú galériu.
- [x] Pridané regresné kontraktové testy ku komponentovej galérii.
- [x] Druhá vlna: do hlavnej galérie zapojené existujúce serverovo vykreslené hero, CTA a článková karta (až 5 ukážok podľa dostupnosti verejných dát); pravé komponenty s reálnymi štýlmi.
- [x] Explicitne mapovať známu identitu vykresľovacieho komponentu (napr. dve hero sekcie z jedného UnifiedSectionHero), nie spájať podľa rovnakého súboru/CSS.
- [x] Ku kanonickým rodinám ukázať presné URL doložené pôvodným zdrojovým katalógom a aktuálnym čítaním publikovaných článkov.
- [x] Doložené konkrétne URL oddeliť od kandidátskych trás podľa statických importov; nevymýšľať dynamické slugs.
- [x] Jeden hlavný promo banner, ale všetky jeho skutočné obsahové nastavenia (vrátane veterinárov) možno prepínať ako varianty jedného zdroja.
- [x] Pri neúplnom alebo nedostupnom skenovaní článkov neuvádzať zoznam za úplný.
- [x] Testy pre identitu zdroja, deduplikáciu URL a zobrazenie bannerových variantov pridané do test:visual-library.
- [ ] CI: zatiaľ nepotvrdené finálne zelené výsledky po poslednom commite.
- [ ] Vizuálne overenie prihlásenej administrácie na desktope.
- [ ] Rozšírenie z 51 náhľadov na úplné pokrytie skutočne vykresliteľných typov.
- [ ] Presné potvrdené výskyty na reálnych URL vrátane dynamických profilov.
- [x] Tretia vlna: pri každej karte majiteľ klikne „Porovnať s iným prvkom“, zvolí dva ľubovoľné náhľady zo spoločnej galérie a zobrazí ich vedľa seba vrátane doložených URL.
- [x] Päť rozhodnutí: zjednotiť podľa A, podľa B, nový spoločný vzhľad, už existujúca spoločná implementácia, ponechať rozdielne.
- [x] Doplnkové poznámky, bezpečné kopírovanie zadania do chatu; žiadne priame publikovanie, zapisovanie do databázy ani mazanie kódu.
- [x] Rozhodovací text stavia čistá testovateľná funkcia, ktorá rozlišuje konkrétne URL od kandidátskych šablón a pri voľbe ponechať/už spoločné nežiada mazanie.
- [x] Kontrolné testy pre všetkých päť volieb sú zapojené do test:visual-library.
- [x] Štvrtá vlna: rozhodnutia sa ukladajú do existujúcej D1 tabuľky z migrácie 0152 s osobitným prefixom `owner-decision:`; **bez novej migrácie a bez zásahu do publikačných dát**.
- [x] Serverový chránený endpoint GET/PUT, strict-origin admin kontrola; neveľkoobchoduje s verejnou cache, nepublikuje a nemaže komponenty.
- [x] Jedna kanonická položka na dvojicu bez ohľadu na poradie A/B, automatické obnovenie uložených poznámok a prehľad stránkovaných rozhodnutí.
- [x] Optimistická kontrola revízie, explicitná možnosť načítať poslednú uloženú verziu pri konfliktoch.
- [x] Rozhodnutia „ponechať rozdielne“ / „už spoločné“ sú v prehľade oddelené od čakajúcich návrhov na zlúčenie.
- [x] Regresné testy ukladania, validácie, orientácie A/B, ochrany návrhu a chráneného endpointu, plus integračný test D1 zápisu/čítania/konfliktu na izolovanom mocku.
- [ ] CI, prihlásený vizuálny smoke test a test skutočného produkčného uloženia ostávajú neoverené.
- [ ] Po prevádzkovom overení pridať stav spracovania PR a odkaz na súvisiacu implementáciu; aktuálny front iba ukladá rozhodnutia, nie ich realizáciu.
- [ ] Prvé reálne zlúčenie bannera Veterinári (samostatný schválený PR).

## Implementačné etapy

### 1. Usporiadať existujúci základ PR #1181
- [ ] Skontrolovať CI + prihlásenú admin obrazovku.
- [ ] Zachovať existujúce generovanie zdrojového registra, filtre, stránkovanie a audit duplicít.
- [ ] Oddeľovať reálne vizuálne prvky od pomocných JSX/CSS súborov; 500 JSX zdrojov nie je 500 samostatných komponentov.
- [ ] Presunúť technický audit na vedľajšiu/rozbaľovaciu obrazovku, predvolene zobrazovať vizuálny katalóg.
- [ ] Výsledky nesmú miznúť kvôli pevnému limitu počtu prvkov.

### 2. Pokryť viditeľné prvky skutočnými náhľadmi a URL
- [ ] Revidovať existujúcich 51 živých náhľadov, priradiť ich ku kanonickým vizuálnym rodinám.
- [ ] Po skupinách dopĺňať bezpečné náhľady všetkých reálne viditeľných typov; nevyhlasovať automaticky JSX súbor za samostatný vizuálny komponent.
- [ ] Pre každú stránkovú šablónu a reálne publikované typy profilov zmapovať výskyty; dynamické URL čítať stránkovane, súkromné a konceptové záznamy nevystavovať.
- [ ] Pre zložité prípady použiť browser screenshot skutočného renderu vrátane hydratácie; obrázky neprikrášľovať ani nevymýšľať.
- [ ] Ukázať pokrytie: vizuálne rodiny / s náhľadom / s potvrdenou URL / čakajúce na kontrolu.

### 3. Porovnávanie a rozhodnutie vlastníka
- [ ] Zoskupovať kandidátov podľa významu a účelu, skutočného zdrojového kódu, štruktúry, CSS a prípadne vizuálneho vzhľadu.
- [ ] Rozlišovať rovnaké použitie kanonického komponentu, legitímny variant a skutočnú duplicitnú implementáciu.
- [ ] Umožniť porovnanie vedľa seba s náhľadom, presnými URL a rozdielmi.
- [ ] Akcie: „ponechať rozdielne“, „rovnaký komponent – bez zásahu“, „zjednotiť podľa A“, „zjednotiť podľa B“, „navrhnúť nový spoločný“.
- [ ] Schválené rozhodnutie zaznamenať ako položku frontu; **nespúšťať automatické zmeny na produkcii**.

### 4. Bezpečné zlúčenie schválených duplicít
- [ ] Najprv pilot **Banner Veterinári**: identifikovať všetky reálne implementácie a potvrdené výskyty.
- [ ] Stanoviť jeden kanonický React komponent so spoločnými CSS štýlmi; text, foto, odkaz a oprávnené varianty cez props/konfiguráciu.
- [ ] Na dotknutých stránkach nahradiť duplicitné implementácie importom jedného zdroja. Odstrániť nepotrebný kód až po overení všetkých konzumentov.
- [ ] V galérii ponechať jeden hlavný záznam + všetky použitia (nie dva záznamy rovnakého banneru). Variant je pod jedným záznamom.
- [ ] Jednotlivé rodiny zjednocovať v samostatných menších PR po rozhodnutí vlastníka: bannery → hero → karty → filtre/formuláre → navigácia → ďalšie sekcie a šablóny.

### 5. Overenie a spätná kontrola
- [ ] Pred zlúčením zaznamenať dotknuté URL a referenčné desktopové screenshoty.
- [ ] Po úprave porovnať desktopové zobrazenie, interakcie, prístupnosť a navigáciu; na mobile iba regresná kontrola bez nevyžiadaných vizuálnych zmien.
- [ ] Build, lint, unit/integration testy a príslušné vizuálne smoke testy musia prejsť.
- [ ] Merge len po používateľovom pokyne; v prípade problémov opraviť alebo vrátiť zmenu.
- [ ] Neprepísať obsah Notion, D1, dynamické profilové údaje ani SEO mimo schváleného rozsahu.

### 6. Prevencia recidívy
- [ ] Pri tvorbe nového komponentu ukázať existujúce príbuzné kanonické komponenty.
- [ ] Kontrola nových veľmi podobných JSX/CSS implementácií v CI má najprv upozorňovať; nie automaticky mazať ani blokovať legitímne varianty.
- [ ] V katalógu viesť stav rodiny: „nezrevidované“, „na porovnanie“, „schválené na zlúčenie“, „zlúčené“, „overené“.
- [ ] Po migrácii kontrolovať, či sa stará implementácia už nikde nepoužíva.

## Akceptačné kritériá

- Majiteľ dokáže nájsť napr. „Veterinári“ alebo „hero“, **vidieť** porovnateľné prvky a ich **skutočné URL** bez otvorenia GitHubu.
- Schválený prvok používa na všetkých cieľových stránkach **jednu spoločnú kódovú implementáciu**, prípadne explicitné konfigurovateľné varianty; žiadna paralelná miestna kópia.
- Pri schválenej skupine sú všetky potvrdené výskyty zrevidované a otestované; pri neoverených výskytoch sa nesmie tvrdiť „všetky“.
- Katalóg neoznačuje bežné technické CSS zhody ako hotové vizuálne duplicity.
- Mobil zostáva zachovaný. Bez schválenia sa nemení produkčný vzhľad.

## Hranice prvého PR

PR #1181 má byť najprv spoľahlivý **inventár**. Po kontrole a prvej používateľskej skúške bude nasledovať rozšírenie vizuálneho katalógu a porovnávania. **Zlučovanie skutočných komponentov** realizovať až na základe konkrétne schválených dvojíc/rodín v oddelených PR, počnúc bannerom Veterinári. Samotné uloženie tohto dokumentu nie je implementácia týchto etáp.
