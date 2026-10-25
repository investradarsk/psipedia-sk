# Verejný web — vizuálna konzistentnosť (existujúci štýl)

Cieľ: návštevník nesmie vidieť iné vizuálne pravidlá len preto, že prešiel medzi sekciami. Toto **nie je redizajn**. Prvky zachovávajú sémantiku a špecifický obsah; rozloženie, rozmery, farby a ovládanie sa majú opierať o jeden spoločný vizuálny základ.

Používame existujúce `PageContainer` / `.shell.public-shell`, `app/design-system.css`, `PublicAction`, `UnifiedSectionHero`, `PublicContentShell`, `HomePortalSearch`, `PublicFilterTag`, DS-5 karty a bannery. Nevytvárame druhú paralelnú knižnicu komponentov.

## Postup v jednom PR

- [x] **Šírka /mapa:** panel aj vyhľadávacia lišta sa zarovnávajú podľa rovnakého `.shell.public-shell` ako verejné stránky (max. 1180 px); informačná hláška o podklade má rovnakú šírku.
- [x] **Mapa na mobile:** vyhľadávacia lišta má štandardné odsadenie; iba interaktívne mapové plátno ostáva vedome na celú šírku mobilu, aby sa dalo ovládať. Nezasahuje do ostatných stránok.
- [x] **Mapa — prvá konsolidácia ovládania:** výška vyhľadávania a filtrov, zaoblenie panelu a polí používajú schválené existujúce tokeny.
- [x] **CTA a tlačidlá — druhá etapa:** Adresár (odoslanie/reset filtrov, mobilné akcie, bočné CTA), Pomoc psom (odoslanie/reset), Podujatia (filtrovanie/zoradenie), Plemená (ďalšie výsledky) používajú PublicActionButton/PublicActionLink. Odstránené kolízne lokálne farby a focus pravidlá; DOM označuje význam cez data-public-action.
- [ ] **CTA a tlačidlá — zvyšok:** detaily/články, disabled stavy a ďalšie kontextové varianty.
- [x] **Filtre — 2. etapa:** sedem existujúcich variantov polí (Adresár, Pomoc psom, Podujatia, katalóg, kluby, pôvod a FCI plemien) berie rovnaké zaoblenie z jedného tokenu. Funkčná sémantika a GET/URL zostáva bezo zmeny.
- [ ] **Vyhľadávanie a filtre — zvyšok:** porovnať vyhľadávacie panely, aktívne filtre, reset a mobilné dialógy na všetkých routach.
- [x] **Karty — druhá etapa:** bočné CTA Adresára a karty podujatí používajú rám a zaoblenie z existujúcich tokenov. Obsah a obrázky ostávajú pôvodné.
- [ ] **Karty a detaily — zvyšok:** hierarchia, obrázky, metadáta a ostatné typové varianty.
- [ ] **Bannery, farby, písmo a hlášky:** zosúladiť existujúce kanonické varianty bez zásahov do obsahu.
- [ ] **Všetky šírky a rozostupy:** skontrolovať nepravidelné lokálne max-width, sidebary a zarovnanie s hero na ostatných verejných routach.
- [ ] **Vizuálna akceptácia:** porovnať desktop 1440 px a mobily 390/320 px na reprezentatívnych routach, vrátane filtrov, kariet a detailov.

### Bezpečnosť a prijatie

Meniť iba verejné rozhranie; žiadne administrátorské štýly, API kontrakty, mapové filtre, databázy alebo externé kľúče. PR zostane Draft, kým nie sú ukončené všetky body. Screenshoty sa musia získať z **presnej revízie PR** cez `PR Visual Evidence`. Samotný kód ani screenshot produkcie nie sú dôkazom hotovej vizuálnej revízie.
