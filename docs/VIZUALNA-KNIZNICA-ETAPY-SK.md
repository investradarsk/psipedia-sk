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

## Plán pokračovania v tomto jedinom PR

1. **Hotovo pre články:** aktuálne publikované URL, pevne vložené a automatické dnešné promo; ďalšia úloha je história/alternatívne rotujúce varianty a URL dynamických profilov.
2. **Polohy a opakovania:** rozlíšiť na tej istej URL viac výskytov, umiestnenia (obsah/sidebar/koniec), a explicitné označenia jednotlivých bannerov.
3. **Hero, CTA a karty začaté v etape 4;** rozšíriť pokrytie ďalších podstránok, navigácie, filtrov a kalendárov.
4. **Detekcia duplicít:** zoskupiť podobné bannerové varianty a nechať majiteľa potvrdiť, čo je naozaj duplicita.
5. **Bezpečný editor:** jednoduché zmeny farby/textu len pre tie komponenty, ktoré to bezpečne podporujú. Náhľad pred uložením, jasné „jedno miesto vs. všetky“ a schválenie pred publikovaním. Samostatne ochrániť mobilný vzhľad.

**Dôležité:** nezaraďovať hotové označenie „všetky URL“, kým enumerácia pokrytia nie je otestovaná na živých publikovaných záznamoch. Skladanie URL pomocou odhadovaných slugov nie je akceptovateľné.

## Príkazy

- `npm run test:visual-library` – kontrakty etáp 1–4 vrátane HTML kotiev, reálnych komponentov, publikovaných URL a fallbackov.
- Existujúce `npm run test:component-registry` – testy technického registra.

## Rozsah

Iba admin zobrazenie a sprievodná dátová evidencia; bez databázovej migrácie, bez zásahov do existujúceho verejného vzhľadu a mobilného zobrazenia.
