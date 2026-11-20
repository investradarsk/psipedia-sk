# Adresár – krok 6/8: skutočná zmena poľa verzus historická priorita

## Prečo tento PR
Existujúci `reconcileProfileFields` podporuje historické módy `admin`, `notion`, `latest` a `safe`. Pri overenej *jednostrannej* zmene mohol mód `notion` vytlačiť aktuálnu Admin hodnotu starou, **nezmenenou** Notion hodnotou. Podobne mód `admin` blokoval jednoznačnú novú Notion hodnotu, keď Admin hodnotu vôbec nezmenil. To nie je `najnovšia skutočná zmena poľa`.

## Čo sa mení
- **Iba legacy Adresár s overeným spoločným baseline** zapína `changedSideWins` pri `reconcileProfileFields`. Z existujúceho hash-verified baseline sa pre každé pole samostatne určí, či bola zmenená jedna alebo obe strany.
- Ak bola zmenená **iba jedna strana**, jej skutočná nová hodnota vyhráva nad starým nastavením historickej priority Notion/Admin. Ďalšie polia sa nemenia.
- Keď sú zmenené **obe strany toho istého poľa**, mód `latest` smie vybrať víťaza **iba** po získaní dvoch dôveryhodných, osobitne autentifikovaných ľudských edit receiptov. Každý musí mať jednoznačné `editId`, UTC čas v presnom formáte a presnú hodnotu zodpovedajúcu aktuálnemu porovnávaniu.
- Chýbajúci či neplatný receipt, rovnaký čas, nesúlad hodnoty alebo pokus určiť poradie z globálneho `directory_profiles.updated_at` či `Notion.last_edited_time` **neautorizuje nič** – ostáva `AMBIGUOUS_SAME_FIELD`.
- Chránené polia (identita, publikovanie, potvrdená Google Place adresa, `Odkontrolované`) ostávajú uzamknuté. Explicitný clear je stále odlíšený od absent a potrebuje overenú ľudskú akciu.

## Výslovné hranice
- Tento PR **nepredstiera**, že už existujú overené per-field timestamps pre obidve strany. Zatiaľ nepridáva žiadne `verifiedFieldEdits` do bežného synchronizačného volania; len zavádza bezpečný vstup pre ich budúce využitie a opravuje vyššie uvedené reálne chyby jednostranných zmien.
- Existujúci systém zatiaľ **nemá kompletný trvalý per-field human event ledger**. Bez takého dôkazu sa dvojstranné konflikty nebudú automaticky vyriešovať.
- Nebol pridaný žiadny SQL stĺpec ani migrácia; **0174 je už obsadená migráciou Plemená**, nepoužívať znova.
- Bežné event-driven Notion zmeny, Services V3, partnerské CAS, review lock a ostatné agendy nechávame bez zmeny.
- Krok 6/8 tým **nie je dokončený**. Pred prepnutím webu a Adminu na SQL treba doplniť dôveryhodné edit receipts alebo explicitný proces konfliktov, mať reálny produkčný inventár #1466 a dokončiť parity v krokoch 7–8.
- **PR #1448** nemať v produkčnom cleanup režime pred ukončením SQL-only read auditu.

## Offline regresné scenáre
Testy v `tests/notion-profile-field-reconciliation.test.mjs` overujú jednostranné zmeny vo všetkých historických módoch, presný explicitný clear, zhodu hodnoty s dôkazom, opačné poradie časov, nulový/nesprávny receipt, rovnaký čas, nemožný dátum, chránené údaje aj aktiváciu režimu priamo v synchronizácii Adresára.
