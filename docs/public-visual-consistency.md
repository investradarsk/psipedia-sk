# Verejný web — vizuálna konzistentnosť (existujúci štýl)

Cieľ: návštevník nesmie vidieť iné vizuálne pravidlá len preto, že prešiel medzi sekciami. Toto **nie je redizajn**. Prvky zachovávajú sémantiku a špecifický obsah; rozloženie, rozmery, farby a ovládanie sa majú opierať o jeden spoločný vizuálny základ.

Používame existujúce `PageContainer` / `.shell.public-shell`, `app/design-system.css`, `PublicAction`, `UnifiedSectionHero`, `PublicContentShell`, `HomePortalSearch`, `PublicFilterTag`, DS-5 karty a bannery. Nevytvárame druhú paralelnú knižnicu komponentov.

## Postup v jednom PR

- [x] **Šírka /mapa:** panel aj vyhľadávacia lišta sa zarovnávajú podľa rovnakého `.shell.public-shell` ako verejné stránky (max. 1180 px); informačná hláška o podklade má rovnakú šírku.
- [x] **Mapa na mobile:** vyhľadávacia lišta má štandardné odsadenie; iba interaktívne mapové plátno ostáva vedome na celú šírku mobilu, aby sa dalo ovládať. Nezasahuje do ostatných stránok.
- [x] **Mapa — prvá konsolidácia ovládania:** výška vyhľadávania a filtrov, zaoblenie panelu a polí používajú schválené existujúce tokeny.
- [ ] **CTA a tlačidlá:** skontrolovať významové varianty (primárne, sekundárne, menej výrazné, deaktivované), stav focus a minimálne dotykové rozmery na domovskej stránke, adresári, článkoch, podujatiach, plemenách a pomoci psom.
- [ ] **Vyhľadávanie a filtre:** porovnať vizuálne stavy, spúšťanie, reset, aktívne filtre a mobilný dialóg naprieč sekciami. Ponechať funkčné rozdiely potrebné pre konkrétne dáta.
- [ ] **Karty a detaily:** zjednotiť hierarchiu nadpisov, rámy, obrázky, metadáta, medzery a CTA pri zachovaní typových variantov.
- [ ] **Bannery, farby, písmo a hlášky:** zosúladiť existujúce kanonické varianty bez zásahov do obsahu.
- [ ] **Všetky šírky a rozostupy:** skontrolovať nepravidelné lokálne max-width, sidebary a zarovnanie s hero na ostatných verejných routach.
- [ ] **Vizuálna akceptácia:** porovnať desktop 1440 px a mobily 390/320 px na reprezentatívnych routach, vrátane filtrov, kariet a detailov.

### Bezpečnosť a prijatie

Meniť iba verejné rozhranie; žiadne administrátorské štýly, API kontrakty, mapové filtre, databázy alebo externé kľúče. PR zostane Draft, kým nie sú ukončené všetky body. Screenshoty sa musia získať z **presnej revízie PR** cez `PR Visual Evidence`. Samotný kód ani screenshot produkcie nie sú dôkazom hotovej vizuálnej revízie.
