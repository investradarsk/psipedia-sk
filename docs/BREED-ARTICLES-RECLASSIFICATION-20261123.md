# Plemená – redakčné články: produkčné preradenie po PR #1543

## Základné pravidlo
- Úprava kategórie a synchronizácie sa nasadzuje **pred** zmenou existujúcich publikovaných článkov v Notione.
- Kategória Plemená je určená pre redakčné články o konkrétnych plemenách, nie atlasové profily. Detail článku zostáva na `/clanky/{slug}`.
- Existujúce `/steniatka/{slug}` pri zámere presunu fungujú cez permanentné kanonické presmerovanie.
- V Notione je potrebné nastaviť `Kategória = Plemená` a vyprázdniť `Podsekcia`; pri Admin zápise sa zároveň nastaví `Sekcia portálu = clanky`.
- Ak článok opisuje konkrétne plemeno, priradiť ho v Admin záložke `Prepojené plemená` k správnemu existujúcemu profilu. Neskúšať párovať podľa voľných kľúčových slov.

## Články zo sekcie Šteniatka – na preradenie podľa Notion názvu
Read-only audit Notion databázy `Články` zo 23. 11. 2026: spolu 28 článkov kategórie Šteniatka, z toho **8 jednoznačných článkov o plemenách**:

| Slug | Plemeno | Notion stav pri kontrole |
| --- | --- | --- |
| labrador-nepochadza-z-labradoru-historia-plemena | Labradorský retriever | Ready |
| lagotto-romagnolo-povaha-vycvik-starostlivost | Lagotto Romagnolo | Ready |
| otterhound-historia-britskeho-vodneho-durica | Otterhound | Ready |
| saluki-historia-pustneho-chrta-fakty-a-legendy | Saluki | Ready |
| slovensky-kopov-povaha-vycvik-zivot | Slovenský kopov | Ready |
| slovensky-cuvac-povaha-vychova-starostlivost | Slovenský čuvač | Publikované |
| zlaty-retriever-povod-guisachan-ruske-cirkusove-psy | Zlatý retriever | Ready |
| ceskoslovensky-vlciak-povaha-vycvik-chov | Československý vlčiak | Publikované |

*Pred produkčným zápisom skontrolovať obsah a aktuálne ID článku a potvrdené ID plemena. Názvy nie sú dôkazom identity. Stavy sa od auditu mohli zmeniť.*

## Čo nepresúvať automaticky
- Výber vhodného plemena, nákup psa a chovateľa: článok pre budúceho majiteľa patrí do Šteniatka.
- Genetické témy všeobecne (napr. COI, DNA testy, efekt populárneho plemenníka) samy osebe nepatria do kategórie o konkrétnom plemene.
- Všetkých ostatných 20 článkov ponechať v Šteniatkach, pokiaľ redakcia neurčí inak.

## Kontrola po merge a nasadení
1. V Admine zvoliť `Sekcia portálu = Všeobecné články` a `Kategória článku = Plemená`.
2. Vybrať existujúci profil plemena v `Prepojené plemená`, uložiť. Pri Notion-prepojenom článku sa overí spätný zápis kategórie a podsekcie.
3. V Notione skontrolovať `Kategória`, `Podsekcia`, `Sekcia portálu`, `Sync stav` a `Prepojené plemená`.
4. Skontrolovať nový detail `/clanky/{slug}`, presmerovanie starého `/steniatka/{slug}` a články v `/plemena` aj v konkrétnom profile plemena.
5. Neprepísať automaticky publikované články, ktoré ešte nemajú overené mapovanie Notion ID ↔ D1 ID.

Žiadny existujúci produkčný článok alebo Notion položka nie je automaticky preklasifikovaná samotným merge PR.
