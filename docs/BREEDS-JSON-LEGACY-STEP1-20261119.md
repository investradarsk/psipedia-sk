# Plemená – krok 1/6: audit historických JSON (19. 11. 2026)

## Výsledok
**Krok 1 je read-only inventúra**, nie migrácia a nie vymazanie z produkcie.
Z aktuálneho repozitára sa nepotvrdil **žiadny samostatný historický dátový JSON súbor plemien** vhodný na zmazanie. Živé údaje plemien sú primárne v D1 SQL; časť SQL stĺpcov obsahuje JSON text. Testovacie JSON schémy Notionu **nie sú historická databáza psov**.

Vlastná príprava migrácie 0173, ktorá bez výnimky zakazovala JSON a predčasne zapisovala do nových tabuliek, bola odstránená **len z tejto rozpracovanej PR vetvy**. Nikdy nebola nasadená na produkciu.

## Rozdelenie nájdených zdrojov

| Zdroj / pole | Dnešné použitie | Rozhodnutie pre krok 1 |
|---|---|---|
| `managed_breeds.gallery_json` | galéria vo verejnom profile, editor | **zachovať** |
| `managed_breeds.fci_standard_json` | FCI štandard aj verejný profil, Admin/Notion | **zachovať** |
| `managed_breeds.editorial_json` | texty verejného profilu, editor, Notion | **zachovať** |
| `managed_breeds.sports_json` | športy v profile, editor/Notion | **zachovať** |
| `managed_breeds.related_breeds_json` | podobné plemená na verejnom webe | **zachovať**, potom posúdiť SQL vzťahy |
| `managed_breeds.health_risks_json` | zdravotné riziká | **zachovať** |
| `managed_breeds.good_for_json` | pre koho sa plemeno hodí | **zachovať** |
| `managed_breeds.consider_json` | na čo si dať pozor | **zachovať** |
| `managed_breeds.sources_json` | citované zdroje v profile | **zachovať** |
| `managed_breeds.seo_json` | metadata, canonical/noindex, sitemap | **zachovať**, dôležité pre indexáciu |
| `breed_notion_controlled_values.values_json / notion_values_json` | verejné filtrované fakty a nové Notion hodnoty | **zachovať** |
| `tests/fixtures/breed-notion-workcopy-74-schema.json` | test staršej schémy | **nezamieňať s dátami** |
| `tests/fixtures/breed-notion-workcopy-90-schema.json` | test aktuálnejšej schémy | **nezamieňať s dátami** |
| `lib/content.ts` a `seedBreeds` | fallback pri chýbajúcej D1 väzbe / build | **zatiaľ zachovať**, nie je samostatný JSON |

## Čo ešte nemožno tvrdiť
- Tento audit prehľadáva **zdrojový kód a Git súbory**, nie obsah živej Cloudflare D1 databázy.
- Bez read-only dotazu na produkčné D1 nemožno potvrdiť, že historické JSON hodnoty, ktoré nie sú používané, neexistujú v riadkoch.
- Polia, ktoré dnes nie sú viditeľné na verejnom webe, môžu stále slúžiť Notion synchronizácii a Adminu. Samotná neviditeľnosť nie je dôkaz, že sa dajú vymazať.
- Žiadny z uvedených aktívnych JSON stĺpcov nesmie krok 1 odstrániť; o ich konečnej SQL/JSON podobe sa rozhodne v kroku 2.

## Read-only kontrola produkčnej D1 – pripravená, ešte nespustená

Po mergeri tohto PR sa dá v GitHub Actions spustiť **Production Plemená JSON – READ ONLY audit (manual)**. Zadaj potvrdenie `AUDIT-BREED-JSON-READONLY`. Workflow vykoná iba agregované `SELECT` dotazy nad živými stĺpcami `managed_breeds` (počet riadkov, vyplnených a poškodených JSON hodnôt) a uloží report. Nikdy nevypisuje osobné alebo celé textové údaje, nič nemení a nepovoľuje `DROP`.

**Pozor:** samotný počet vyplnených JSON hodnôt nie je dôkaz, že ide o historické alebo nepotrebné údaje. Read-only report doplní rozhodnutie v kroku 2.

## Produkčné meranie dodané z Cloudflare D1 Console (19. 11. 2026)

Používateľ spustil **read-only SQL dotaz** v produkčnej D1 a poskytol agregované výsledky.
Príkaz počítal `vyplnenych` ako hodnoty iné než prázdny reťazec, `[]`, `{}` a `null`.
**Nevyhodnocoval počet položiek v zoznamoch ani skutočnú obsahovú kvalitu.**

| SQL JSON stĺpec | riadkov | neprázdnych hodnôt | neplatných JSON |
| --- | ---: | ---: | ---: |
| consider_json | 347 | 347 | 0 |
| editorial_json | 347 | 344 | 0 |
| fci_standard_json | 347 | 343 | 0 |
| gallery_json | 347 | 0 | 0 |
| good_for_json | 347 | 347 | 0 |
| health_risks_json | 347 | 343 | 0 |
| related_breeds_json | 347 | 2 | 0 |
| seo_json | 347 | 343 | 0 |
| sources_json | 347 | 11 | 0 |
| sports_json | 347 | 52 | 0 |

### Bezpečnostný záver
- **Žiadny JSON stĺpec nie je automaticky schválený na DROP.** Aj úplne prázdny `gallery_json` má stále aktívne referencie v runtime a Notion mapovaní.
- `related_breeds_json`, `sources_json` a `sports_json` obsahujú aspoň niektoré neprázdne hodnoty, takže nejde o čisto prázdne historické úložiská.
- V tabuľke je **347** záznamov, zatiaľ čo jednorazový plán počíta s **344** plemenami. Pred importom treba overiť rozdiel v identitách/statusoch; nespájať ich automaticky.
- Nulový počet neplatných JSON je dobrý signál pre syntaktickú integritu, nie dôkaz o správnosti obsahu.
- Pri kroku 2 treba vyhodnotiť najmä `good_for_json` a `consider_json` na úrovni jednotlivých prvkov zoznamu.
- **V produkcii neprebehlo žiadne odstránenie dát, migrácia ani prepis.**

## Produkčné meranie skutočného obsahu JSON zoznamov (19. 11. 2026)

Výsledok druhého read-only dotazu, ktorý používa `json_array_length`, bez `UNION ALL` (prvý UNION ALL dotaz Cloudflare D1 odmietol). Toto meranie počíta prvky v JSON poliach, nie obsahovú kvalitu jednotlivých prvkov.

| JSON stĺpec | plemien so zoznamom | celkový počet prvkov | maximum na plemeno |
| --- | ---: | ---: | ---: |
| consider_json | 347 | 633 | 7 |
| gallery_json | 0 | 0 | 0 |
| good_for_json | 347 | 657 | 5 |
| health_risks_json | 343 | 706 | 6 |
| related_breeds_json | 2 | 6 | 4 |
| sources_json | 11 | 25 | 7 |
| sports_json | 52 | 333 | 11 |

**Spolu 2 360 záznamov položiek v šiestich aktívnych JSON zoznamoch.**
`gallery_json` je v produkčných riadkoch úplne prázdny, ale má aktívny Admin/verejný/Notion kód; preto je iba *kandidát na odstránenie po cutovere*, nie okamžitý `DROP`. 
`related_breeds_json` má šesť aktívnych väzieb, takže jeho zrušenie by odstránilo existujúce odkazy (kým nebudú presunuté do SQL relačnej tabuľky). 
`sources_json` a `sports_json` sú síce menej rozšírené, ale nie prázdne. 
`consider_json`, `good_for_json`, `health_risks_json` sú evidentne využívané a ich hodnota sa má zachovať.

**Krok 1 – zistenie:** súborové historické plemenové JSON zálohy sa v Gite nepotvrdili; žiadny živý JSON stĺpec ešte nie je bezpečné dropnúť bez zmeny čítacích/zapisovacích závislostí. Žiadny produkčný zápis alebo mazanie neprebehlo.

## Ako overiť
```bash
node scripts/audit-breed-json-legacy.mjs
node --test tests/breed-json-legacy-audit.test.mjs
```

## Pravidlo ďalšej migrácie
V produkcii bude existovať **jedna autoritatívna hodnota** pre každé verejne používané pole. Keď bude nový čítací a zapisovací kód hotový a skontrolovaný, až potom odstránime preukázateľne nepotrebné historické úložisko.
