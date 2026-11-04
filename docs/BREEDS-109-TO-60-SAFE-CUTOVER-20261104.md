# Plemená – bezpečné dokončenie konsolidácie polí (4. 11. 2026)

## Overený stav pred migráciou
- Produkčná databáza **Plemená**: `collection://2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2`, **344** záznamov, pôvodných **109** vlastností.
- Pre návštevníka Notion editora je zobrazených **60** hlavných polí; **49** zostáva skrytých, nie vymazaných.
- Bezpečnostná kópia: [Plemená – záloha pred redukciou 04.11.2026](https://app.notion.com/p/40e793fc1d1881f1b78df9f435b6cc1a), `collection://170793fc-1d18-8204-a6f9-87479609dca7`.
- Kópia obsahuje **344** profilov. Pri kontrole sa zhodovali počty znakov v 15 kľúčových poliach vrátane FCI očí, chvosta, histórie, potrieb, zdravia, charakteru, SEO a identity.
- **Nie je bezpečné teraz vykonať `DROP COLUMN`**: polia sú obsadené, automatizácie A–K a L–Ž ich stále používajú a synchronizačná vrstva ich má stále vo svojom registri.

## Schválené rozdelenie 109 polí
- **60 viditeľných zmysluplných polí:** existujúci schválený editor.
- **23 skrytých redakčných/FCI polí:** plánované presunutie do viditeľných polí pri zachovaní úplného textu aj zdrojového názvu.
- **20 prevádzkových a samostatne dôležitých polí:** neodstraňovať bez náhrady – identita, publikovanie, vzťahy, obrazové kredity, SEO/OG, poznámky, synchronizačné stavy.
- **6 zastaraných polí:** vyradiť len po obsahovej a procesnej kontrole; aj tu sú nevyprázdnené historické checkboxy.

Presné, strojovo kontrolované mapovanie je v `lib/breed-notion-compact-consolidation.mjs`; nezaradené staré pole automaticky spôsobí chybu testu.

## Pripravený nástroj
`scripts/notion-breed-compact-migrate.mjs` má tri režimy:
1. `--mode=audit` – zistí potrebu presunu, bez zápisov.
2. `--mode=apply --confirm=BACKUP_344_VERIFIED` – len vyplnené zdrojové polia presunie do cieľových po jednotlivých profiloch; bez mazania starých polí; po každom zápise preverí hodnoty z Notion API. Podporuje `--limit=N` pre skúšobnú dávku a opakovanie bez duplicít.
3. `--mode=verify` – vyžaduje, aby žiadny zdroj nečakal na presun a aby bol zistený celý inventár 344 záznamov.

Nástroj zámerne neumožňuje `DROP COLUMN`. Bezpečný postup pred skutočným znížením fyzických stĺpcov musí zvlášť zabezpečiť:
- **Readback po všetkých 344 profiloch**, porovnanie s archivovanou kópiou a vylúčenie simultánnych Notion editácií.
- **Úpravu dvoch bežiacich odborných automatizácií** na nový zoznam polí a nezávislé dokončovanie.
- **Presmerovanie Notion ↔ Admin synchronizačnej schémy** a testy editácie, polí FCI, médií, zdrojov, vzťahov a SEO.
- Až následné odstránenie konkrétnych nepotrebných stĺpcov; identita a auditné/prevádzkové polia sa nesmú stratiť.

**Dôležité:** Ak má byť konečný počet fyzických Notion properties presne 60, treba najprv prevádzkové metadáta uložiť mimo tejto databázy. Inak by zmizli identifikátory, história synchronizácie, prepojenia a odborné poznámky. Počet 60 sa preto teraz vzťahuje na bežné editovateľné polia, nie na všetky systémové vlastnosti.

## Kvalita odborného obsahu
FCI text sa nesmie mechanicky skrátiť. Zlúčený obsah musí zachovať časť/štandard a názov pôvodného zdroja. Neprepísať text používateľa, ktorý je v cieli novší. Pochybné zhody zadržať na kontrolu.

## Riziká, ktoré sme pri audite našli
- „Potreby“ má údaj vo všetkých **344** profiloch.
- Viaceré detailné FCI podpolia majú údaje pri približne **185** profiloch.
- Vlastný OG titulok sa líši od SEO title pri **10** profiloch, OG description od Meta description pri **8**. Automatické zrušenie OG by stratilo unikátny text.
- Obe hodinové automatizácie majú stále staré názvy polí vo svojich zadaniach; nesmú bežať proti zmazanej schéme.
