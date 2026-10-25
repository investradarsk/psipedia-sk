# Verejný web — vizuálna konzistentnosť (existujúci štýl)

Cieľ: návštevník nesmie vidieť iné vizuálne pravidlá len preto, že prešiel medzi sekciami. Toto **nie je redizajn**. Prvky zachovávajú sémantiku a špecifický obsah; rozloženie, rozmery, farby a ovládanie sa majú opierať o jeden spoločný vizuálny základ.

Používame existujúce `PageContainer` / `.shell.public-shell`, `app/design-system.css`, `PublicAction`, `UnifiedSectionHero`, `PublicContentShell`, `HomePortalSearch`, `PublicFilterTag`, DS-5 karty a bannery. Nevytvárame druhú paralelnú knižnicu komponentov.

## Postup v jednom PR

- [x] **Šírka /mapa:** panel aj vyhľadávacia lišta sa zarovnávajú podľa rovnakého `.shell.public-shell` ako verejné stránky (max. 1180 px); informačná hláška o podklade má rovnakú šírku.
- [x] **Mapa na mobile:** vyhľadávacia lišta má štandardné odsadenie; iba interaktívne mapové plátno ostáva vedome na celú šírku mobilu, aby sa dalo ovládať. Nezasahuje do ostatných stránok.
- [x] **Mapa — prvá konsolidácia ovládania:** výška vyhľadávania a filtrov, zaoblenie panelu a polí používajú schválené existujúce tokeny.
- [x] **CTA a tlačidlá — druhá etapa:** Adresár (odoslanie/reset filtrov, mobilné akcie, bočné CTA), Pomoc psom (odoslanie/reset), Podujatia (filtrovanie/zoradenie), Plemená (ďalšie výsledky) používajú PublicActionButton/PublicActionLink. Odstránené kolízne lokálne farby a focus pravidlá; DOM označuje význam cez data-public-action.
- [x] **CTA na kartách — etapa 3:** odkazy na profil plemena a detail pomoci prešli na spoločný terciárny CTA; pôvodné linky a šípky ostali.
- [x] **CTA — etapa 5:** FCI odkaz detailu plemena, editorial promo v článku a „Pokračovať v téme“ používajú PublicActionLink vrátane presnej sémantiky primary/secondary/tertiary. Spoločný odkaz podporuje natívne bezpečné aria/data atribúty a zachováva test ID.
- [x] **Sekčné Hero CTA — etapa 6:** všetky konfiguráciou riadené CTA v spoločnom UnifiedSectionHero používajú PublicActionLink. Primary a secondary variant už nevytvára vlastné farby a focus; iba výslovne nastavený accent si necháva koralovú farbu.
- [ ] **CTA a tlačidlá — zvyšok:** ďalšie detailové varianty a disabled stavy.
- [x] **Filtre — 2. etapa:** sedem existujúcich variantov polí (Adresár, Pomoc psom, Podujatia, katalóg, kluby, pôvod a FCI plemien) berie rovnaké zaoblenie z jedného tokenu. Funkčná sémantika a GET/URL zostáva bezo zmeny.
- [x] **Vyhľadávanie — etapa 3:** tlačidlo sekčného hero vyhľadávania využíva spoločnú farbu, výšku a zaoblenie CTA, vrátane focus tokenu. GET kontrakty ostávajú.
- [x] **Vyhľadávanie — etapa 7:** SectionHeroSearch submit používa spoločný PublicActionButton, odstránené druhé lokálne farebné/dotykové/focus pravidlo. Form GET, hidden parametre, komponent vstupu a responzívna plná šírka tlačidla ostávajú.
- [x] **Aktívne filtre — etapa 8:** odstrániteľné čipy filtrov majú rovnakú dotykovú výšku 44px, control radius a viditeľný focus vrátane forced-colors. Statické informačné štítky ostávajú menšie.
- [ ] **Vyhľadávanie a filtre — zvyšok:** porovnať reset a mobilné dialógy na zostávajúcich routach.
- [x] **Karty — druhá etapa:** bočné CTA Adresára a karty podujatí používajú rám a zaoblenie z existujúcich tokenov. Obsah a obrázky ostávajú pôvodné.
- [x] **Karty — etapa 3:** články, plemená, adresár, podujatia (grid aj riadky) a Pomoc psom dostali spoločný verejný kontrakt `data-public-card`. Centrálny CSS blok riadi rám, zaoblenie, tieň, hover, focus a farbu nadpisov/metadát. Špecifické rozmery obrázkov a urgentné zvýraznenie pomoci ostávajú.
- [ ] **Karty a detaily — zvyšok:** karty ďalších sekcií, detailové hlavičky a layout faktov.
- [x] **Bannery — etapa 5:** editorial promo článkov berie polomer z centrálneho banner tokenu a používa sekundárne CTA; pomocný „Rýchla pomoc“ rešpektuje sekundárny CTA variant bez prepisu na vlastné koralové tlačidlo. Foto promo a varovania ostávajú odlíšené.
- [ ] **Bannery, farby, písmo a hlášky — zvyšok:** ďalšie typové varianty a stavové hlášky.
- [x] **Šírky — detailový základ:** detaily Adresár, Podujatia a Pomoc psom používajú kanonickú šírku 1180px/odstupy 48px na desktope a rovnaký shell na mobile; kontaktný panel Adresára sa zarovnáva s hlavným obsahom.
- [x] **Vizuál detailov — základ:** spoločné detaily používajú verejné farby, rádius kariet/hero, jednotné CTA a focus; pri Pomoci psom má informačný panel jednotné zaoblenie bez zásahu do upozornení.
- [x] **Články — etapa 5:** článkový grid odstránil extra 16px vnútorné odsadenie pod už existujúcim verejným shellom, spodné pokračovanie používa spoločnú šírku 1180px. Zachovaná samostatná čitateľná šírka textového stĺpca.
- [ ] **Všetky šírky a rozostupy — zvyšok:** zvyšné samostatné routy a audit lokálnych max-width.
- [x] **Regresná kontrola — etapa 5:** nové aj predchádzajúce source testy kariet, CTA, filtrov, máp a detailov sa importujú z existujúceho `tests/public-ds5-cards.test.mjs`. Konfiguráciu workflow nemeníme, aby zostalo platné pôvodné CI. Centrálna CTA trieda používa priamo `--ps-radius-control` bez odlišného fallbacku.
- [ ] **Vizuálna akceptácia:** porovnať desktop 1440 px a mobily 390/320 px na reprezentatívnych routach, vrátane filtrov, kariet a detailov.

### Bezpečnosť a prijatie

Meniť iba verejné rozhranie; žiadne administrátorské štýly, API kontrakty, mapové filtre, databázy alebo externé kľúče. PR zostane Draft, kým nie sú ukončené všetky body. Screenshoty sa musia získať z **presnej revízie PR** cez `PR Visual Evidence`. Samotný kód ani screenshot produkcie nie sú dôkazom hotovej vizuálnej revízie.
