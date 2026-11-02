# NOTION-SYNC-20261103 – opravy nahlásených incidentov

## Stav: pracovný Draft PR, bez deployu

### Implementované v tejto vetve
- Validácia výšky/hmotnosti/dĺžky života kontroluje čísla pri jednotkách; FCI čísla, roky štúdií a veľkosti vzorky nepreberá ako rozmery. Ochranné limity zostávajú.
- Pri opakovanej aktivite plemena zlučuje iba bezpečne zhodné kľúče s rovnakým názvom a hodnotením; rôzne poznámky zachová, ak sa vojdú bez straty. Konfliktné hodnotenia a názvy naďalej bezpečne zastaví.
- Adopcie: nulový odhad veku s konkrétnym dátumom narodenia sa prenáša ako NULL. Pozitívny konfliktný vek zostáva chybou.
- Články: existujúce priame Notion HTTP volania článkov sú nahradené spoločným SDK transportom s opakovanými pokusmi pre 429/5xx a Retry-After. Doplnilo sa mierne obmedzenie počtu požiadaviek v rámci jedného Worker isolate, nie globálna zdieľaná kvóta medzi Workers.
- V Notion databáze **Plemená** bolo pridaných 57 nových vlastností; bez vymazania alebo prepisovania existujúcich polí.
- Notion → Admin číta vyplnené podrobné FCI polia, redakčné texty a športy, pričom prázdne polia nevymazávajú existujúce údaje. Časť JSON polí zostáva voliteľná. Existujúce recibo/snapshot mapovanie zostáva spätne kompatibilné.
- Regresné testy: Kazachský tazy, Kaukazský ovčiak, Lionel, Wetterhoun, staré synchronizačné záznamy, Notion 429.

### Bezpečnostné zásady
- Žiadna automatická zmena publikovania, FCI identity, identifikátorov, slug, obsahu galérie alebo relácií.
- Pri konflikte hodnotení športov nesmie systém vybrať jedného víťaza automaticky.
- Nerobiť produkčné D1 zápisy alebo deploy pred schválením a CI.
- Pre novo pridané FCI/redakčné stĺpce sa pred hromadným zápisom odporúča porovnať D1 a Notion a vykonať spätné naplnenie existujúcich údajov bez prepísania.

### Zostáva (NEOZNAČOVAŤ ZA HOTOVÉ)
1. Samostatne overiť a prípadne ručne zjednotiť historické konfliktné športové údaje v D1 pre Wetterhoun (ak sa líšia rating/názov).
2. Kompletný bezpečný **Admin → Notion** spätný prenos novo pridaných štruktúr; existujúca textová writeback cesta je užšia.
3. Pripojiť nové stĺpce galérie, prepojených plemien/článkov/služieb, farebného akcentu a rozšíreného SEO – nové stĺpce ešte nepredstavujú plne obojsmernú synchronizáciu.
4. Bezpečne doplniť existujúce údaje z D1 do prázdnych nových stĺpcov Notion po porovnaní príslušných identít (žiadne hádanie).
5. HTTP 500 z produkcie, príčinu `Network connection lost` na `/clanky.rsc` a dlhodobú stabilitu sitemap nemožno uzavrieť bez produkčných logov a sledovania.
6. Overiť CI na presnom HEAD, pri chybe opraviť a až následne žiadať schválenie merge.

### Poznámka
Notion pridané stĺpce sú okamžite viditeľné, ale kód z Draft PR sa do Cloudflare dostane až po schválenom merge a nasadení.
