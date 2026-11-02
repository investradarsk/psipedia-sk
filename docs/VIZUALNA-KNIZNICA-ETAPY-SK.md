# Psipedia – Vizuálna knižnica (postupný PR)

## Etapa 1 – realizovaná v tejto vetve

- Nový prvý pohľad v `/admin/komponenty` pre majiteľa webu: zoznam bannerov podľa ľudských názvov, vyhľadávanie, výber a náhľad z **toho istého** komponentu `PublicMagazineBanner`, ktorý používa produkcia.
- Automatické načítanie textových variantov všetkých definovaných článkových promo bannerov zo skutočnej definície `articlePromoRegistry`.
- Overené statické URL: `https://psipedia.sk/` pre banner „Pridajte svoj profil“ a `https://psipedia.sk/plemena` pre banner „Kluby plemien“. Tieto referencie boli skontrolované v aktuálnom zdrojovom kóde, nie prehliadaním produkčného webu.
- Pri článkových promo banneroch **zatiaľ nie je** výpis jednotlivých URL. Banner sa môže vybrať podľa obsahu a dňa alebo byť vložený ako obsahový blok. Zobrazujeme pravdivý stav „Presné URL zatiaľ nezistené“, nie odhadované odkazy.
- Starý technický register zostáva k dispozícii v rozbaliteľnej časti pre programátora.
- Náhľady sú iba na čítanie. Nič sa automaticky neupravuje a nepublikuje; neboli upravené žiadne existujúce verejné bannery.

## Etapa 2 – publikované URL článkov

- Pri otvorení admin knižnice sa po úspešnom prihlásení načíta zoznam publikovaných článkov priamo z D1 (vrátane už aktívnych naplánovaných článkov). Nepublikované koncepty sú vylúčené.
- Vložené promo bloky sa evidujú jednotlivo, aj keď sa rovnaký banner nachádza v jednom článku dvakrát.
- Automatické promo sa vyhodnocuje cez pôvodné pravidlá `resolveContextualArticlePromo`, so skutočnými témami článku a aktuálnym UTC dňom. Je označené ako „automaticky dnes“; pri ďalšom dni sa môže zmeniť.
- Zobrazujú sa kanonické URL vytvorené pôvodnou funkciou `articleHref`, s vyhľadávaním a postupným zobrazením väčších zoznamov.
- Ak D1, témy alebo niektoré záznamy zlyhajú, systém to označí ako nedostupný/neúplný výsledok. Pri viac ako 2 000 článkoch tiež uvedie, že ide o čiastočný výsledok.
- Používanie na homepage a v atlase zostáva zatiaľ ručne overené v kóde. Detekcia dynamických profilov zostáva ďalšou úlohou.

## Etapa 3 – presné pozície + Pomoc psom

- Všetky už evidované bannery dostávajú stabilné HTML ukotvenia (anchor ID) na verejnej stránke. Kliknutie „Otvoriť umiestnenie“ otvorí **konkrétnu pozíciu** podľa URL s `#...`, nie iba začiatok stránky.
- Každý ručne vložený článkový promo blok dostane odkaz odvodený od svojho existujúceho ID. Presúvanie bloku v článku neporuší odkaz. Rovnaký banner vložený dvakrát má dva samostatné odkazy.
- Automatické promo v detaile článku a v prehľade `/clanky` má oddelené ukotvenie. Zoznam naďalej rozlišuje pevné a dnešné automatické použitia.
- Na `/pomoc-psom` pribudlo 5 reálnych promo bannerov (nahlásenie strateného/nájdeného psa, príprava na adopciu, pomoc psovi v núdzi, dobrovoľníctvo, záverečná výzva). Všetky sa dajú otvoriť priamo na konkrétnej pozícii.
- Texty bannerov Pomoc psom boli presunuté do jedného zdieľaného súboru `lib/help-banner-presets.ts`, ktorý číta verejná stránka aj admin; tým sa predchádza rozdielom medzi náhľadom a produkciou.
- Existujúce CSS, farby, rozloženie aj mobil zostávajú bez zásahu. Iba read-only evidencia a HTML ukotvenia.
- Testy kontrolujú zhodu ID v galérii aj verejných komponentoch.

Poznámka: obsahové bannery sa môžu meniť podľa dňa alebo dát. Výpis zachytáva aktuálne pravidlá a publikované záznamy v čase skenovania, nie historické zobrazenia. Ďalšia etapa rozšíri počet overených príkladov a doplní presné URL ďalších dynamických stránok.

## Etapa 4 – hero sekcie, CTA tlačidlá a karta článku

- Záložky **Hero sekcie**, **CTA tlačidlá** a **Karty** sú skutočné prepínateľné katalógy, nie neaktívne popisky.
- Pre Atlas plemien a Novinky sa v admine vykreslí ten istý `UnifiedSectionHero`, s aktuálnym vizuálom načítaným zo systému a rovnakým vyhľadávacím panelom ako na verejnej stránke. Každý má presnú URL a skok na hero.
- Pre adresár a Pomoc psom sú v knižnici existujúce `PublicActionLink` CTA vo variantoch primárne/sekundárne. Pribudli bezpečné nemeniace HTML ID na ich verejných umiestneniach.
- Pre článkové karty sa použije skutočný `ArticleListItem` najnovšie publikovaného článku a stabilné ukotvenie v zozname Novinky. Keď nemáme publikovaný článok, nevymýšľame náhradnú kartu.
- Všetky ukážky sú **iba na čítanie** a sú klikateľné iba prostredníctvom samostatného odkazu „Otvoriť umiestnenie“. V náhľadoch sú interakcie vypnuté.
- Žiadne nové verejné CSS, presuny vizuálu, prepisy obsahu ani migrácie; mobil zostáva nezmenený. Rovnako starý technický register zostáva pod rozbalením.
- Nejde zatiaľ o úplnú evidenciu každého použitia daného typu: položky pribúdajú postupne podľa overenia. Konkrétne URL sú vždy odkazmi na skutočné stránky.

## Etapa 5 – možné duplicity a porovnávanie

- V admin vizuálnej knižnici pribudla záložka **Možné duplicity**.
- Konzervatívne porovnanie už evidovaných bannerov ponúka kandidátov iba pri rovnakom kanonickom cieli odkazu, úplne rovnakom obsahu alebo výrazne podobnom názve. Samotné zdieľanie CSS, komponentu alebo jednej bežnej frázy **nie je** považované za duplicitu.
- Skutočný príklad na preskúmanie: článkový banner „Chovateľské kluby“ a banner „Kluby plemien“ z atlasu smerujú do rovnakého adresára. Nie je to potvrdená chyba ani pokyn na automatické zlúčenie.
- Majiteľ môže vybrať ľubovoľné dva evidované prvky (aj Hero/CTA/karty), vidieť ich reálny komponent vedľa seba a otvoriť všetky overené URL.
- Funkčné tlačidlo **Kopírovať zadanie na zjednotenie** skopíruje názvy, ID a URL oboch prvkov. Žiadna zmena ani publikovanie sa pri porovnávaní nevykoná.
- Je to výslovne **preverenie kandidátov**, nie úplný audit všetkých komponentov celého webu. Rozšírenie pokrytia je stále otvorené.
- Nové testy overujú silné a slabé podobnosti, unikátnosť dvojíc, limitovanie výstupov, UX porovnávania a nepovolenie automatického zlúčenia.
- Opravený aj starší regresný test `lost-found-public-submission.test.mjs`, ktorý po zdieľaní textov a pridaní kotvy hľadal pôvodný statický text vo nesprávnom súbore.

## Etapa 6 – jednoduchý editor návrhu (bez priameho publikovania)

- V detaile každého už evidovaného **banneru** pribudlo tlačidlo **Upraviť vzhľad**.
- Editor ponúka: malý nadpis, hlavný nadpis, popis, text tlačidla, bezpečné predvolené farby pozadia a tlačidla a voľbu plánovaného dosahu (`len tento banner` / `spoločná šablóna – po kontrole`).
- **Skutočný komponent** sa prekreslí okamžite vo vizuálnom náhľade s desktopovým rozložením. Fotobannery si zachovajú nepriehľadnú fotografickú vrstvu, preto pri nich meníme len farbu tlačidla.
- Tlačidlo **Uložiť návrh** uloží hodnoty do `localStorage` tohto prehliadača, osobitne pre každý banner a textový variant. Nie je to zmena produkcie, databázy, ani nové pravidlo dizajnu pre všetky stránky. Návrh sa pri ďalšom otvorení v rovnakom prehliadači načíta. Nie je synchronizovaný medzi zariadeniami.
- **Obnoviť pôvodné** odstráni uložený návrh. **Skopírovať na implementáciu** vytvorí konkrétne zadanie aj so zamýšľaným rozsahom a počtom známych použití; pred zmenou spoločnej šablóny je nutný ďalší audit a schválenie.
- Priamo v editore je jasné upozornenie **Bez publikovania**. Nevytvárame falošný dojem, že uloženie návrhu mení web.
- Voliteľné hodnoty farieb sú z pevného zoznamu, texty majú dĺžkové obmedzenia a pri pokuse o vloženie neplatných hodnot sa návrh odmietne. Do verejných CSS ani databázy sa nezasahovalo.
- Skutočné bezpečné publikovanie návrhov a ich zdieľanie medzi zariadeniami vyžadujú samostatnú backendovú implementáciu so schvaľovaním a presným rozsahom, ktorá v tomto PR zatiaľ **nie je dokončená**.

## Etapa 7 – serverové návrhy a opatrné desktopové publikovanie

**PR obsahuje funkčnú implementáciu, ale NIE je ešte nasadená ani overená na produkcii.**

- Nová izolovaná D1 tabuľka `visual_library_banner_edits` v migrácii **0152** ukladá návrh, verziu, publikované desktopové farby, čas a identitu správcu. Nezasahuje do existujúcich profilov, článkov, Notion ani spracovania služieb.
- Admin `GET/PUT/POST /api/admin/visual-library/banners` vyžaduje oprávnenia a pri zmene prísnu kontrolu pôvodu požiadavky. Nové uloženie návrhu, zverejnenie a návrat pôvodných farieb majú verziovanie a odmietajú konfliktné zmeny.
- Návrhy sa ukladajú na **server do D1**, a nie už iba v lokálnom prehliadači. Pri neaplikovanej migrácii sa zobrazí jasná chyba, nič sa ticho neuloží.
- Publikovanie je zámerne umožnené len pre dve presne identifikované samostatné umiestnenia: **`homepage:profil` na `https://psipedia.sk/`** a **`plemena:kluby` na `https://psipedia.sk/plemena`**. Každé publikovanie vyžaduje uložený návrh, jediný overený výskyt, `scope=one`, pôvodné texty, potvrdenie presnej URL a explicitné zaškrtnutie súhlasu.
- Priame publikovanie mení **desktopové texty aj farby**. Verejný komponent `PublicMagazineBanner` dostáva allowlistovaný schválený záznam; CSS sa uplatní iba nad 620 px. Mobilná šablóna, titulky a obsahové CTA zostávajú bez zmeny.
- Textové zmeny samostatných povolených bannerov možno bezpečne publikovať iba na desktope: pôvodný mobilný text zostáva v tom istom sémantickom prvku a viditeľný na mobilnom breakpoint-e. Zmeny spoločnej šablóny a ostatných bannerov zostávajú len návrhom do úplného auditu použitia.
- Publikované desktopové texty aj farby možno vrátiť kliknutím **Vrátiť publikované texty a farby** po potvrdení tej istej URL. D1 čítanie na verejnom webe zlyháva bezpečne na pôvodný štýl, keď je úložisko nedostupné.
- **Migrácia nie je automatická:** v chránenom GitHub workflow Production D1 Migrate bol sprístupnený cieľ `0152_visual_library_banner_edits.sql` a potvrdzovací text `APPLY-0152-psipedia-sk-db`. Spustenie výlučne vlastník po merge a po osobitne autorizovanej a fyzicky overenej migrácii **0151**. Do tej doby serverový editor zobrazí oznámenie o nedostupnej tabuľke a žiadne farby nepublikuje.
- Testy pokrývajú základné kontrakty autorizácie, potvrdenia URL, desktop CSS, ochrany textov, verzovania a chráneného SQL schématu. **Živé UI a reálne D1 správanie musí potvrdiť CI/staging** pred merge.

### Stále otvorené

1. **Desktop-only publikovanie textov pre dva overené bannery implementované**; otestovať živé zobrazenie na desktopovom i mobilnom breakpointe. Ostatné bannery až po overení URL.
2. Bezpečné publikovanie väčšiny ďalších bannerov, hero, CTA, kariet až po úplnej evidencii ich URL.
3. Overenie cache invalidácie/vypršania verejnej HTML cache po publikovaní; pri kešovanej stránke sa zmena nemusí zobraziť okamžite.
4. Overenie integrácie na testovacom alebo produkčnom prostredí po schválenej migrácii.
5. Audit prípadných ďalších migrácií, ak sa hlavná vetva medzičasom posunie.

### Doplnenie: texty len na desktope bez zmeny mobilu

- `PublicMagazineBanner` vie prijať `desktopCopy` so samostatným malým nadpisom, hlavným nadpisom, popisom a textom CTA. Existujúce props zostávajú jediným pôvodným zdrojom textov pre mobil.
- Pôvodné aj schválené desktopové texty sú vo vnútri **toho istého** nadpisu, odstavca alebo odkazu; v CSS media query pri `min-width: 621px` sa zobrazí desktop text, pod hranicou pôvodný mobilný text. Nevytvárame dve tlačidlá, dva nadpisy h2 ani dva CTA odkazy.
- Admin editor umožňuje po serverovom uložení a explicitnom potvrdení URL publikovať aj desktop texty, nielen farby. Nová databázová migrácia nad rámec 0152 nie je potrebná. Server stále nepovolí spoločnú šablónu, nepovolenú URL ani iné než dva overené bannery.
- Na mobiloch s viewportom do 620 CSS px sa neprepisuje nijaký text ani farba existujúcich bannerov. Skutočné rozloženie a čítačky obrazovky treba overiť v CI/E2E pred merge.
- Upozornenie: to, že sú texty oddelené vizuálne, nie je ekvivalent rozdielneho SEO obsahu (oba varianty sú v HTML). Táto funkcia slúži na vizuálne prispôsobenie desktopu.

## Plán pokračovania v tomto jedinom PR

1. **Hotovo pre články:** aktuálne publikované URL, pevne vložené a automatické dnešné promo; ďalšia úloha je história/alternatívne rotujúce varianty a URL dynamických profilov.
2. **Polohy a opakovania:** rozlíšiť na tej istej URL viac výskytov, umiestnenia (obsah/sidebar/koniec), a explicitné označenia jednotlivých bannerov.
3. **Hero, CTA a karty začaté v etape 4;** rozšíriť pokrytie ďalších podstránok, navigácie, filtrov a kalendárov.
4. **Možné duplicity – etapa 5 hotová v kóde:** kandidáti v existujúcom katalógu a ručné porovnanie dvoch prvkov; treba doplniť automatické pokrytie zvyšných typov stránok a komponentov.
5. **Editor pracovného návrhu dokončený v etape 6:** texty, predvolené farby, okamžitý náhľad, uloženie do prehliadača; samostatne zostáva serverové zdieľanie návrhov a schválené publikovanie.

**Dôležité:** nezaraďovať hotové označenie „všetky URL“, kým enumerácia pokrytia nie je otestovaná na živých publikovaných záznamoch. Skladanie URL pomocou odhadovaných slugov nie je akceptovateľné.

## Príkazy

- `npm run test:visual-library` – kontrakty etáp 1–4 vrátane HTML kotiev, reálnych komponentov, publikovaných URL a fallbackov.
- Existujúce `npm run test:component-registry` – testy technického registra.

## Rozsah

Iba admin zobrazenie a sprievodná dátová evidencia; bez databázovej migrácie, bez zásahov do existujúceho verejného vzhľadu a mobilného zobrazenia.


## Etapa 8 – rozšírenie evidencie, publikovania a reakcia cache (rozpracované)

- Vizuálna knižnica má záložku **Kde všade sa používa**. Prehľadáva všetky verejné komponenty, ktoré sa dajú identifikovať zo statických importov v zostavení, aj konkrétne potvrdené výskyty bannerov a publikovaných článkov. Pre komponent so známym náhľadom zobrazuje originálny React komponent.
- Potvrdené konkrétne URL sú **oddelené** od možných statických použití. Dynamické cesty ako `/adresar/[slug]` sa nemenia na vymyslené klikateľné URL. Bez dostatočného dôkazu sa hovorí „možné použitie“, nie „potvrdený výskyt“.
- **Úplná evidencia všetkých skutočne vykreslených dynamických profilov a všetkých ich vizuálnych variantov ešte nie je hotová.** Bude vyžadovať overenú enumeráciu publikovaných profilov/služieb/podujatí/udalostí, nie iba statický import graf.
- K bezpečnému desktop-only publikovaniu samostatných bannerov sa po dvoch existujúcich pridalo ďalších päť: Pomoc psom (stratený pes, tri tematické bannery a záverečný banner). Všetkých päť má vlastnú kotvu a rozlišuje sa podľa banner ID; mobilný text ostáva v pôvodnom HTML. Spoločné šablóny, článkové rotácie a ďalšie nepokryté varianty sa **nesmú** publikovať hromadne.
- Po potvrdenom publikovaní alebo vrátení zmeny admin API vykoná **best-effort** odstránenie konkrétneho verzovaného HTML kľúča z Cloudflare Cache API (iba ak je daná verejná stránka povolená v cache). Admin zobrazí skutočný výsledok. Cloudflare má viac POPov; lokálne vymazanie **nie je globálny purge** a ostatné uzly môžu zobrazovať predchádzajúcu verziu do vypršania krátkej cache (v existujúcom workeri 45 s). Pomoc psom nie je v explicitnej HTML cache.
- Nové regresné testy kontrolujú identitu všetkých piatich bannerov, desktopové vs. mobilné props, bezpečné potvrdenie rozsahu, pravdivé cache hlásenie a rozlíšenie statických vs. overených URL.
- **Pred merge:** všetky CI kontroly musia prejsť, statickú inventarizáciu treba vizuálne overiť, live účinnosť cache a DB overiť po ručnej migrácii 0152. Pred nasadením migrácie zostáva editor správne nedostupný.


### Etapa 9 – úplný paginovaný zoznam verejných URL dynamických detailov

- Pod „Kde všade sa používa“ je nový vyhľadávateľný **Dynamické URL** zoznam nad autentifikovaným read-only admin API. Nenačítava všetky profily do jednej HTML odpovede; D1 vracia celkový počet a stránku po **75 záznamoch** bez umelej hranice 500/2 000.
- Pokrýva 9 skutočných zdrojov detailových verejných URL: **Služby/adresár, Organizácie, Adopcie, Pomoc psom – prípady, Stratené a nájdené psy, Podujatia, Plemená, Články, E-shopy**. Zohľadňuje konkrétne verejné stavy, pri plemenách kanonických víťazov, pri článkoch aktívne naplánované publikácie, pri stratách aj dostupné vyriešené/archivované detaily.
- V admin rozhraní možno vybrať oblasť, hľadať naprieč všetkými jej záznamami a prejsť na ľubovoľnú stránku výsledkov vrátane poslednej. Zobrazuje sa presná URL (bez domýšľania slugu), názov a čas kontroly.
- Rozhranie **nesmie** zamieňať nájdenú verejnú URL s dôkazom, že na danej URL je skutočne vykreslený konkrétny komponent. Pri komponente ostávajú staticky odvodené trasy označené ako „možné“, kým ich niekto neoverí. FCI štandardné prílohy, formuláre a filtrované listingové URL nie sú detailové profily a nepatria do týchto deviatich skupín.
- D1 neprístupná, neplatná kategória alebo chybné publikované údaje nesmú skončiť ako predstieraný prázdny alebo úplný zoznam. API vracia chybu; koncepty, PII ani súkromné kontakty nevracia.
- **Pred merge:** zelené CI a kontrola serverového build-u. Po chránenom nasadení migrácie 0152 urobiť na živom admin rozhraní kontrolný test všetkých deviatich zdrojov vrátane posledných stránok, vyhľadávania a klikateľných URL. Bez živého testu sa nevyhlasuje plná prevádzková úplnosť.


### Bezpečný produkčný rollout migrácie 0152 (pripravené v PR, nespustené)

- `main` má súbor `0151_admin_content_revision_history.sql`, ale jeho **produkčné spustenie stále nie je autorizované** týmto PR. Neaplikujeme ho ani neobchádzame.
- `0152_visual_library_banner_edits.sql` je v štandardnom chránenom workflow `Production D1 Migrate` dostupný **iba ako manuálne zvolený cieľ**; `workflow_dispatch`, prostredie `production`, spoločný migračný zámok a presný potvrdzovací reťazec sú povinné. Merge ani build migráciu nespustia.
- Postup po schválení: (1) nezávisle autorizovať a v produkcii aplikovať `0151` cez jej vlastný schválený postup; (2) overiť v databáze `d1_migrations` presnú postupnosť vrátane 0151 a všetkých 8 tabuliek/indexov/triggerov schémy 0151; (3) na **main** v GitHub Actions vybrať `Production D1 Migrate`, `0152_visual_library_banner_edits.sql` a presný text `APPLY-0152-psipedia-sk-db`; (4) vlastník explicitne spustí chránený workflow.
- Pred akoukoľvek zmenou sa automaticky overí identita účtu a databázy `psipedia-sk-db`, SHA-256 kanonického SQL, úplná postupnosť migrácií, schéma 0151, absencia čiastočne vytvorenej schémy 0152 a dostupný D1 Time Travel bookmark. Pri nesúlade postup odmietne vykonať zmenu.
- Workflow používa existujúce oddelené fázy preflight → apply → postflight, načítanie presnej revízie `main`, opätovnú kontrolu histórie medzi preflightom a zápisom a verifikáciu novej tabuľky. Nepovoľuje automatický restore ani deploy Workerov.
- Po úspešnom schválenom spustení manuálne otestovať v admin rozhraní uloženie, publikovanie a vrátenie desktopových zmien, mobilnú nezmenenosť a vymazanie HTML cache. Produkčnú funkčnosť nevykazovať ako overenú bez tohto testu.

### Stále otvorené v pôvodnom zadaní registra komponentov

- **Vzťah komponent ↔ konkrétna URL dynamického profilu** nie je zatiaľ overený pri každom profile. Výpis verejných URL z D1 je kompletný v rozsahu 9 zdrojov, ale sám o sebe nie je dôkazom ich konkrétnych vizuálnych komponentov.
- **Náhľady celého registra** sú dostupné pre vybrané bannery/Hero/CTA/karty, nie pre každý zdrojový React komponent.
- **Publikovanie zostáva konzervatívne** obmedzené na 7 identifikovaných samostatných bannerov, nie na všetky podobné prvky alebo zdieľané šablóny.
- **Prevádzková verifikácia** publikovaných URL, zobrazenia textov a cache po migrácii 0152 zostáva na živom prostredí. Bez nej nie je korektné označiť celé pôvodné zadanie za 100 % dokončené.

