# Psipedia — Notion Adresár: oddelenie 10 databáz (príprava 12. 11. 2026)

**Stav:** iba príprava štruktúr a mapovania. Žiadne profily sa zatiaľ nepresúvajú. Pôvodný `Adresár` je naďalej jediným produkčným zdrojom pravdy v Notione; zostáva naviazaný na Admin/D1, webhook a automatizácie.

## Pôvodný stav a ciele

Pôvodná Notion databáza Adresár: `collection://84e0664c-ca47-405f-9d54-31b20287bc8c`. V audite bolo 1 867 profilov, 10 aktívnych kategórií a 111 stĺpcov. Požiadavka: každá kategória má samostatnú databázu pod stránkou Psipedia — Editorial Hub, s vlastnými stĺpcami. Nepoužívať jedinú spoločnú databázu s 10 pohľadmi ako finálny model.

| Kategória | Počet v pôvodnej DB pri audite | Nová Notion DB (data source) |
| --- | ---: | --- |
| Veterinári | 287 | `ab4ac5be-716c-48dd-8376-901cd032c7c4` |
| Psí tréneri a psie školy | 67 | `db6f16c6-282a-4840-a2dd-4c682d5330f2` |
| Kynologické kluby | 252 | `3dbce736-813e-4c6c-a923-90206c522a2e` |
| Chovateľské kluby | 86 | `1c3f5b38-313d-4733-8cc8-df38fdf72beb` |
| Chovateľské stanice | 534 | `dc1ecac5-ebde-4329-9807-17af7c29c391` |
| Salóny | 257 | `a4e4d460-b72d-4d0e-b11a-99881c05d076` |
| Hotely a opatrovanie | 82 | `a1e6d54a-8381-4411-8144-af89e45975e6` |
| Venčenie | 139 | `f16a1537-eef8-4560-bd17-231c3cdbd065` |
| Fyzioterapia | 47 | `defd155b-19c0-409f-a2f7-575260fa0b4c` |
| Ďalšie služby | 116 | `62fbe55d-0ae0-48c5-8e4e-cba9c8de2061` |

Každá nová DB existuje pod pôvodným Editorial Hub a má 89–91 stĺpcov (spoločné, redakčné a technické polia plus jej kategóriové polia). Kategóriové filtre ostatných kategórií sa vynechali. **Nie je to konečné minimum stĺpcov**: ďalšia redukcia je možná až po audite hodnoty a použitia v Admine, pri zachovaní SEO, Notion relation a sync kontraktov. Tabuľkový pohľad `Profily` má 13–14 viditeľných stĺpcov.

## Pred presunom profilov je povinné

1. Zaviesť do synchronizačného jadra výber Notion zdroja podľa `directory_profile.category`; nepredpokladať jeden `NOTION_DIRECTORY_DATA_SOURCE_ID`.
2. Rozšíriť webhook dispatch o všetkých 10 rodičovských `data_source_id`, odmietať page/category mismatch a zachovať kompatibilitu s pôvodným zdrojom, pokiaľ v ňom zostávajú záznamy.
3. Upraviť závislosti v `lib/notion-directory-sync.ts`, `lib/notion-webhook-dispatch.ts`, `lib/notion-directory-update-safety.ts`, `lib/notion-targeted-admin-save.ts`, `lib/notion-bulk-backfill.ts`, `lib/notion-field-authority.ts`, `lib/notion-connection-diagnostics.ts`, `lib/admin-record-lifecycle.ts`, `lib/gemini-notion-directory-review.ts`, `scripts/gemini-notion-agent.mjs`, `wrangler.jsonc` a pri súvisiacich endpointoch. Tento zoznam je minimálny zo search auditu, nie vyčerpávajúci zoznam všetkých závislostí.
4. Upraviť **päť bežiacich automatizácií** `Psipedia – adresár 1/5` až `5/5` a externého Gemini agenta: pôvodný collection ID je zatiaľ jediným cieľom.
5. Zaručiť, že zostávajú zachované `Psipedia ID`, pôvodné Notion page IDs alebo ich explicitná mapovacia tabuľka, slug, stav publikovania, SEO, fotky, kategóriový Services V3 katalóg, GEO, väzby na plemená/kluby, obsah a dáta synchronizácie.
6. Zmerať per-kategória a per-pole počet neprázdnych hodnôt; zaznamenať hodnoty polí vylúčených z novej schémy pred samotným presunom. Notion môže pri presune medzi databázami zahodiť nespárované vlastnosti; presun bez overenia mapovania je zakázaný.

## Riadená migrácia (až po bezpečnej príprave)

1. Deploynúť kompatibilné dual-source smerovanie, najprv s fallbackom na pôvodný Adresár.
2. Dočasne pozastaviť zapisujúce automatizácie počas cutover jednej kategórie; po prepnuti aktivovať iba správny nový zdroj.
3. Otestovať jednu neprodukčnú stránku kategórie: porovnať všetky významné vlastnosti pred/po, Notion → Admin, Admin → Notion, prázdny zápis, vymazanie, media a SEO.
4. Presúvať stránky po dávkach s zachovaním identity; pre každú kategóriu kontrolovať počet záznamov, duplicity `Psipedia ID`, mapovanie Notion page ID, služby, kvalifikácie, kontakty, publikovanie a obojsmerné zmeny.
5. Pri chybe nevypúšťať starý zdroj z čítania a neprepínať ďalšie kategórie.
6. Až po úplnej parite a osobitnom potvrdení archivovať pôvodnú databázu. **Neodstraňovať ju ani jej stĺpce automaticky.**

## Bezpečnostná hranica tejto fázy

Súbor `lib/notion-directory-category-data-sources.ts` je iba pripravený registry mapping, ktorý nie je zapojený do produkčných call-site. Tento PR neprepisuje `wrangler.jsonc`, nemení webhooky, neprenáša profily, nezasahuje do pôvodnej databázy a nemá byť interpretovaný ako dokončená migrácia. Plný cutover vyžaduje samostatnú implementáciu a validačné testy.
