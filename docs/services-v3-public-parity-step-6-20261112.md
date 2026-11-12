# Služby V3 — záverečná parita Admin / Notion / detail / zoznam / mapa (krok 6/6)

Dátum 12. 11. 2026. Pracuje sa v jedinom PR #1319. Nevytvára sa nová Notion databáza ani migrácia a nevykonávajú sa produkčné zápisy.

## Zistené nedostatky a opravy

### Mapa nerešpektovala D1 override kategórie

**Zistenie:** `lib/directory-store.ts` už predával `builtinOverridesReady` do `canonicalPublicServiceWhere`, ale `lib/map-query.ts` používal implicitné `false`. Po presune pôvodnej služby zo skupiny veterinárov do trénerov preto mohlo `?svc=<id>` v zozname a na mape vracať rozdielne služby aj pri tom istom publikovanom/geolokalizovanom profile.

**Oprava:** mapový dotaz najskôr overí dostupnosť existujúcej tabuľky D1 `service_catalog_builtin_overrides` len ak je potrebný aktívny kanonický filter služby. Funkcii `canonicalPublicServiceWhere` podá rovnaký `builtinOverridesReady` ako zoznam. Ak tabuľka po code-first deploy ešte neexistuje, obe cesty používajú pôvodný statický katalóg. SQL ostáva parametrizované a používa iba `choice='yes'`.

Mapa navyše používa samostatný GEO/privacy filter. Preto môže mať zákonite **menej pinov než výsledkov zoznamu**; nikdy však nesmie mať inú službovú kategóriu či zobraziť NO, draft alebo archivovaný profil. Nemožno vyžadovať číselnú rovnosť počtu bez zohľadnenia GEO.

### Verejný detail mal textové, nie kanonické rozlíšenie

**Zistenie:** verejný detail a JSON-LD doteraz brali `directory_profiles.services_json` bez zohľadnenia uloženého výberu Services V3. Ak zlyhal medzikrok projekcie do historického textu alebo sa pôvodná služba premenovala, zobrazoval sa starý text, prípadne chýbal nový výslovne potvrdený výber.

**Oprava:** `getPublishedDirectoryProfile` pre jediný publikovaný profil s aktívnym systémom Services V3 načíta jeho výslovné D1 voľby a aktuálne definície katalógu. Čistá funkcia `canonicalPublicProfileServices`:
- zobrazí každé oprávnené **Áno** aktuálnym názvom najviac raz, vrátane prípadu, keď textová projekcia ešte čaká na opravu;
- skryje rozpoznaný starý text pri výslovnom **Nie** alebo ak služba už nepatrí do danej kategórie;
- ponechá nezaraditeľné a nejednoznačné historické redakčné texty bez svojvoľného vymazania;
- nikdy nevyvodí **Nie** z chýbajúcej Notion relácie ani z voľného textu;
- nevykoná žiadny D1 ani Notion zápis.

Výsledok sa používa v spoločnom detaile a JSON-LD. Keď systém Services V3 nie je aktívny alebo chýba voliteľná D1 tabuľka, zostáva pôvodný verejný profil funkčný. Čítanie kanonického katalógu sa vykoná len pri profile, ktorý už má uložené V3 voľby.

## Integračné scenáre

Nový `tests/service-catalog-public-parity-e2e.test.mjs` používa skutočnú SQLite implementáciu migrácií 0133, 0134 a 0149 a existujúce produkčné pomocné funkcie, nie ručne nasimulované výsledky.

| Scenár | Overované |
|---|---|
| Admin Áno → Nie → Neznáme → Áno | CAS verzie/audit, verejný detail, rovnaká množina ID na mape a v zozname |
| Výpadok projekcie do historického textu | Potvrdené Áno je na detaile viditeľné priamo z kanonickej D1 voľby |
| Premenovanie a presun pôvodnej služby | ID nemenné, aktuálny názov a kategória v detaile, kanonickom dropdown aj mapovom filtrovaní |
| Notion odstránenie a opätovné pridanie | Pri potvrdenom baseline sa použije Notion relation planner, CAS import podľa ID, verejný text ostáva bez nesúvisiacich zmien |
| Neaktívna alebo chýbajúca služba | Verejný kanonický filter nepoužíva implicitné YES, nepublikované profily sa nevracajú |
| Pôvodná kategória pred migráciou 0149 | Statický fallback je rovnaký na mape a v zozname |

Test sa spúšťa v oboch existujúcich GitHub CI workflow pre `Services V3 public canonical filter` aj `Services V3 map canonical filter`, spolu so starými regresiami.

## Mimo rozsahu a akceptácia

Tento krok nemení GEO/geokódovanie, publikovanie, Notion data source, existujúce ID ani samostatný historický filter `service=`. Produkčné hodnoty a približný starší počet chýb nie je dovolené vyhlasovať za opravené len na základe kódu; po merge/nasadení je potrebné samostatné **read-only** overenie reálnych profilov a posledných synchronizácií.

V tomto PR sa nečaká na ručné zásahy do Notion ani migráciu; PR sa neoznačuje za produkčne nasadený a bez súhlasu sa nezlučuje.
