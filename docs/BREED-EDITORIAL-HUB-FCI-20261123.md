# Psipedia – magazín Plemená: atlas, skupiny FCI, detail a archív

## Rozsah

- **/plemena:** tri najnovšie publikované články s kategóriou Plemená sú v pravom stĺpci pod bannerom „Nájdi klub svojho plemena“. Odkaz „Všetky články o plemenách“ otvára **/clanky/plemena**. Sekcia sa nenačíta, ak neexistujú publikované články.
- **FCI skupiny 1–10 v atlase:** pod kartami plemien každej viditeľnej skupiny tri najnovšie články priradené plemenám z tejto skupiny. Článok môže byť v dvoch skupinách, iba ak je explicitne prepojený s plemenami z oboch. Prázdna sekcia sa nezobrazuje. Odkaz otvára `/clanky/plemena?fciGroup=N`.
- **/clanky/plemena:** samostatný archív s vyhľadávaním, výberom jednej FCI skupiny a serverovým stránkovaním 18 položiek. Filtre vychádzajú zo vzťahov v D1, nie z názvov článkov.
- **Detail plemena:** najviac tri súvisiace články sa zobrazujú na desktope v pravom stĺpci pod „Plemeno v skratke“ a pred promo blokmi. Na mobile sú pod mobilnou kartou „Plemeno v skratke“. Pôvodná dolná, široká sekcia sa odstránila.

## Údaje a kompatibilita

Žiadna migrácia a žiadna zmena existujúcich záznamov. Články pochádzajú len z `managed_articles` so stavom publikované (alebo naplánované s uplynutým časom), sekciou `clanky` a kategóriou `Plemená`. FCI skupiny sú odvodené zo spojenia `breed_article_relations` a publikovaných `managed_breeds`. Výpis skupín je jedným dotazom s SQLite `ROW_NUMBER()`, bez samostatného dopytu pre každú skupinu. Archív používa `COUNT(*)` a `LIMIT/OFFSET`. Samostatné články zachovávajú kanonické URL `/clanky/{slug}`.

Zmena nekontroluje ani nenahrádza chyby publikovania `EMPTY_REQUIRED_BLOCK`; tie sa riešia samostatne. Úprava nepresúva staršie články v Notione ani nemení nastavenia synchronizácie.
