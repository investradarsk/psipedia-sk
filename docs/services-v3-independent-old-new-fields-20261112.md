# Services V3 – oddelenie starých a nových služieb bez mazania

Dátum: 12. 11. 2026. Rozsah: izolácia oboch kanálov. **Bez SQL migrácie, bez mazania stĺpcov, dát alebo Notion databáz, bez produkčných zápisov.**

## Oddelené polia

| Zdroj | D1 úložisko | Editácia | Synchronizácia |
| --- | --- | --- | --- |
| Notion Adresár: `Služby` (text) | `directory_profiles.services_json`, pre trénerov vyhradený text v `source_data_json` | Existujúci textový editor | Len historický/redakčný text |
| Notion Adresár: `Služby z katalógu` (relácia) | `service_profile_option_choices` | Services V3 checkboxy | Len kanonické služby podľa `svc.*` ID |

Notion katalóg zostáva existujúcou samostatnou definíciou názvov/ID; nejde o tretí profilový atribút.

## Zmenené prúdy

- Admin V3 PATCH najskôr uloží presne jednu voľbu s verziou a následne sa pokúsi preniesť **len reláciu** do Notion. Neprojektuje nič do `services_json`.
- Prijatý podpisovaný webhook z Notion `Služby z katalógu` prenáša len zvolené ID do `service_profile_option_choices`; nemení textové `Služby`.
- Zmeny Notion `Služby` a starého admin editora zostanú v pôvodnom redakčnom/textovom kanáli. Nespúšťajú import voľného textu na kanonické ID.
- `Služby z katalógu` stále používajú existujúci bezpečný baseline `directory_service_notion_relation_sync`. Bez neho sa neisté odstránenia neodsúhlasia.
- V3 API a Admin stav už neodvodzujú úspech/neúspech od kopírovania do historického textu. Stav Notion sa týka výlučne relácie.

## Čo sa výslovne nemení

- Oba Notion stĺpce a aktuálne záznamy zostávajú.
- D1 `services_json`, `service_profile_option_choices` a synchronizačné metadáta zostávajú.
- Verejný profil, filtre a mapa zostávajú na svojich aktuálnych čítacích adaptérov. Verejný detail môže **zobrazovať kombinovanú prezentáciu** historického textu a V3 výberov; toto nie je spoločný zápis.
- Historické `services:UNVERIFIED_DELETE` a `BASELINE_UNAVAILABLE` sa nezmazávajú automaticky. Ich odstránenie vyžaduje nezávislé overenie.
- Rôzne pravidlá pre pilotné kategórie a trénerov sa týmto krokom nezjednocujú ani nerušia.

## Regresné testy

`tests/service-catalog-public-parity-e2e.test.mjs` teraz overuje, že: V3 Áno/Nie/Neznáme, pridanie/odobratie cez Notion ID ani textová editácia nevykonajú krížový zápis medzi oboma úložiskami. Statické kontrakty kontrolujú, že produkčné moduly nesmú používať staré projekčné funkcie.

## Následné manuálne overenie po nasadení

Na jednom bezpečnom testovacom profile porovnať obe polia pred a po (a) zmene voľného textu a (b) vypnutí/zapnutí V3. Overiť D1 hodnoty oboch úložísk a webhook inbox výsledok. Úmyselne neprepisovať stav existujúcich konfliktov bez overenia.
