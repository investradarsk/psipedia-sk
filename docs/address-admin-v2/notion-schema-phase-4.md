# ADDRESS-ADMIN-NOTION-SCHEMA-4 — inventár a migračný návrh

Stav: **dokumentačný návrh; živé zmeny neschválené a nevykonané**.
Overené 2026-10-13. Repository `investradarsk/psipedia-sk`, fresh main
`32051ddbd07343e395d97e035b9805d873eba1e5` (merge #785). Prečítané
[audit](audit.md), [kontrakt](data-contract.md), [roadmapa](implementation-roadmap.md)
a [fáza 2](contract-phase-2.md). GitHub potvrdil pull/push/admin oprávnenia;
lokálny clone bol čistý. Tento PR pridáva iba tento dokument.

## 1. Overené identity a hranice dôkazov

Každá referenčná databáza bola načítaná cez Notion fetch; následne bol samostatne
načítaný vrátený `collection://` zdroj. V každej je jeden vrátený data source.

| Databáza | Database ID | Overené data source ID |
|---|---|---|
| [Adresár](https://www.notion.so/fbaad6872adf4784b22c4290c3580c93) | `fbaad6872adf4784b22c4290c3580c93` | `84e0664c-ca47-405f-9d54-31b20287bc8c` |
| [Podujatia](https://www.notion.so/832fc680a7d34c33a1058c289bdd7606) | `832fc680a7d34c33a1058c289bdd7606` | `76d9ccde-5816-422c-bcfe-863ab69db080` |
| [Organizácie](https://www.notion.so/39e512043ec646659552784120501dd8) | `39e512043ec646659552784120501dd8` | `6fbf8eb2-2f72-4d0c-b825-c46f6f72f92e` |

Identity sú potvrdené v Notione, nie v produkčných Worker bindings. Pred budúcim
write porovnať konfiguráciu synchronizácie s týmito ID; database ID nie je data
source ID. Žiadna produkčná D1 ani cron konfigurácia sa nečítala.

Schémy, názvy, typy, možnosti selectov a existujúce views sú live dôkazy.
Vlastníctvo a sync smer nižšie sú z kódu na uvedenom SHA, nie dôkaz posledného
úspešného produkčného behu. Notion fetch označuje text ako `text`; transportný
REST ekvivalent používaný kódom je `rich_text`. SQLite `TEXT` nie je Notion typ.
Property-level REST ID nie sú úplne vystavené týmto výstupom: pred migráciou
urobiť surový REST schema export s ID. Názvy ani ID sa nesmú odhadovať.

Agregovaný read-only dotaz Adresára podľa Kraj/Okres sa dokončil (`has_more=false`).
Dotazy Podujatí a Organizácií odmietol Notion s `usage_limit_reached`; neboli
vykonané ani opakované. Ich historické hodnoty sú **neoverené**, schémy overené.
Plná inventarizácia historických hodnôt a záloha všetkých stránok neprebehla.

## 2. Aktuálne adresné a systémové polia

`—` znamená neprítomné v celej načítanej schéme. Riadky obsahujú presné názvy.
`N↔P` je existujúci editorial sync Notion/Psipedia, nie povolenie automatického
prepisu. `P→N` je systémové zrkadlo. Google je zdroj potvrdenia cez admin,
nikdy priamy Notion zapisovač. Bezpečnosť editácie je návrh pravidla pre fázu 9.

| Property | Adresár | Podujatia | Organizácie | Vlastník / aktuálny smer / bezpečnosť |
|---|---|---|---|---|
| Kraj | text | text | text | Editorial N↔P; chýbajúce možno navrhnúť, náhrada iba review |
| Okres | text | — | text | Editorial N↔P tam, kde existuje; validovať voči kraju |
| Mesto | text | text | text | Editorial N↔P; validovať voči okresu, nehádaj homonymá |
| Adresa | text | text | text | Adresár/Podujatia N↔P; Organizácie system-owned P→N, aktuálne bez adresného pull |
| PSČ | text | — | — | Adresár N↔P; text so zachovanou nulou |
| Ulica | text | — | — | Adresár N↔P; nie povinná pre každé miesto |
| Číslo domu | text | — | — | Adresár N↔P; zachovať lomku a písmeno |
| Formát adresy | select | — | — | Adresár N↔P; existujúce možnosti STREET, MUNICIPALITY_NUMBER |
| Miesto | — | text | — | N↔P, event venue; nie synonymum Adresa, zachovať názov areálu |
| Potvrdená prevádzka | checkbox | — | — | Dnes directory číta aj zapisuje; budúca autorita Psipedia, automatizácia nesmie potvrdiť |
| Online | checkbox | — | — | Existuje iba v Adresári; nespojiť s Google Maps netreba; live význam hodnôt neauditovaný |
| Google Place ID | text | text | text | Psipedia/Google cez admin, P→N; nikdy pull, editácia nie |
| Google miesto aktuálne | checkbox | checkbox | checkbox | Odvodené Psipediou, P→N; editácia nie |
| Google Maps cieľ | text | text | text | Odvodené PLACE/COORDINATES/prázdne, P→N |
| Google Maps netreba | checkbox | checkbox | checkbox | Admin rozhodnutie/Online projection, P→N; checkbox v Notione nie je príkaz |
| Latitude | number | number | number | Psipedia GEO, P→N; automatizácia ani Notion neprepisujú GPS |
| Longitude | number | number | number | Psipedia GEO, P→N; zverejnenie podľa existujúcej privacy projekcie |
| GEO stav | text | text | text | Systém P→N; nie select, možnosti nie sú schema enum |
| GEO provider | text | text | text | Systém P→N; provider nie je potvrdenie miesta |
| Presnosť lokality | — | text | text | Systém P→N; Adresár ju v live schéme nemá, bulk mirror ju pozná |
| Posledný sync | date | date | date | Sync systém → N; nie čas nájdenia adresy ani Google confirmation |
| Sync chyba | text | text | text | Sync systém → N; reuse pre konflikt s označením adresných polí |
| Sync stav | select | select | select | Sync systém → N; Neodoslané, Čaká na sync, Synchronizované, Chyba |
| Zdroj dát | url | url | url | Editorial/source N↔P podľa entity; zdroj celého záznamu, nie vždy adresy |
| Poznámky | text | text | text | Redakčné poznámky; nepoužiť ako strojový adresný protokol |
| Psipedia ID | text | text | text | Mapping systém; organizácia ID nie je location ID; ručne nemeníť |

V načítaných schémach nie sú druhé property pomenované `Výsledná adresa`,
`Stav potvrdenia`, `Zdroj adresy`, `Pôvod adresy` či `Adresa čaká na kontrolu`.
Nevytvárať nové synonymá existujúcich Adresa/GEO/Sync properties.
`Kvalita · Adresa` v Adresári je select Nemá / Verejne nezverejnené /
Nedohľadateľné / Nevzťahuje sa: hodnotí dostupnosť údaja, nie pending review.
`Stav` (Nápad / Na kontrolu / Ready / Publikované / Archív) je redakčný stav
celého záznamu, nie adresný stav. Tieto podobné polia nie sú duplicity.

### Automatizácie a reálna editovateľnosť

Adresné polia Adresára Kraj/Okres/Mesto/Adresa/PSČ/Ulica/Číslo domu používa
`scripts/gemini-notion-directory-fields.mjs`; agent vytvára koncepty. To nedokazuje
missing-only enrichment existujúceho profilu. `Formát adresy` a potvrdenie patria
do directory sync; research nesmie vyrábať confirmation. Ostatné adresné/GEO
polia spracúvajú systémové sync/export cesty uvedené nižšie. Pri Podujatiach a
Organizáciách je potvrdený automatický sync kód, nie používanie konkrétnym
externým research agentom. Jeho živý prompt/harmonogram ani všetci externí
zapisovači neboli overení. Pred migráciou zahrnúť aj ich inventár.

Notion UI technicky umožňuje zmeniť mnohé systémové properties; skrytie vo view
nie je ochrana. Autoritu musí vynucovať Psipedia whitelist/guard pri čítaní.
Chýbajúce polia možno výskumom navrhnúť až cez guarded cestu; tento návrh
nedáva existujúcim write cestám bezpečnosť, ktorú dnes nemajú.

## 3. Konflikty so súčasným kódom

| Zdroj / funkcia | Overený kontrakt a potrebná zmena |
|---|---|
| `lib/notion-directory-sync.ts`, `notionSnapshot` / encoder | Číta text aj select, ale push Kraj/Okres/Mesto/Adresa/PSČ/Ulica/Číslo domu má pevný rich_text; Formát adresy select. Samotná zmena Kraj na select rozbije push. |
| `lib/gemini-notion-directory-review.ts`, save | Kraj/Okres sa ukladajú cez `rich(...)`; aj editor konceptu potrebuje typovo kompatibilný encoder pred konverziou. |
| `scripts/gemini-notion-agent.mjs`, `chooseProperty` | Pozná select, vyberá existujúcu možnosť; neznáma hodnota nesmie potichu zmiznúť, musí ísť do review. |
| `lib/notion-bulk-backfill.ts`, `encodeProperty` | Schema-aware rich_text/select, ale select posiela name; doplniť allowlist, nevytvárať nové kraje/okresy importom. |
| `lib/notion-events-help-sync.ts`, encoder/snapshots | Schema-aware encoder; editable whitelist a baseline treba rozšíriť, samotné pridanie properties nič nezapojí. |
| `lib/notion-events-help-adapters.ts`, editable fields / eventInput | Event číta Miesto/Mesto/Kraj/Adresa; chýba Okres/PSČ/Ulica/Číslo domu/Formát adresy. |
| `lib/notion-events-help-adapters.ts`, `organizationLocationFromNotion` | Pull iba Mesto/Okres/Kraj, zachováva adresu existujúcej lokality; pri absencii vytvorí UNSPECIFIED, nie potvrdený SITE. |
| `lib/notion-bulk-sources.ts`, organizations | Adresa system-owned; export iba neprázdnej canonical adresy SITE + RESOLVED + EXACT_PUBLIC. Nepovažovať absenciu exportu za povolenie zmazať či publikovať inú adresu. |
| `lib/notion-geo-mirror.ts` | Google ID exportuje iba current exact public; stale/private ID môže byť v N prázdne aj keď D1 má anchor. Notion prázdne ID nikdy nie je dôkaz odomknutia. |
| Directory safety + event/organization current Google guard | Directory downgrade guard/provider verification nie je jednotný Google lock. Event/org kontroluje current Google; fáza 2 navyše blokuje stale anchor/manual/private. Integrácia ešte chýba. |
| `lib/notion-bulk-backfill.ts`, schema extension | Dopĺňa chýbajúce podľa názvu v execute režime; aktuálny event extension je SEO, nie nový adresný manifest. Pred writes pridať typový preflight; nespustiť celý backfill len kvôli schéme. |

`lib/admin-address-contract.ts` a `lib/admin-address-adapters.ts` z #785 sú čisté
funkcie, zatiaľ nezapojené do týchto writerov. D1 polia z paralelnej fázy 3
nepovažovať za nasadené; ich výsledné názvy a schema guard overiť po merge.

## 4. Cieľové rozloženie bez duplicitných adries

| Skupina v detaile / view | Poradie vlastností |
|---|---|
| Základná lokalita | Kraj → Okres → Mesto |
| Úplná adresa | PSČ → Ulica → Číslo domu → Formát adresy → Adresa; pri evente Miesto pred adresou |
| Google Maps (systémové) | Google miesto aktuálne → GEO stav → Google Maps netreba → Google Place ID → Posledný sync → Sync stav → Sync chyba |
| Automatizácia | Zdroj adresy → Pôvod adresy → Adresa čaká na kontrolu |
| Technické (bežne skryté) | Latitude, Longitude, GEO provider, Google Maps cieľ, Presnosť lokality; organizácie aj Psipedia lokalita ID |

Názov `Adresa` zostáva; „výsledná adresa“ je jej význam, nie nová property ani
formula, ktorá by pri čítaní prepísala ručne upravený verejný text.
Stav potvrdenia prezentovať z existujúceho checkboxu + GEO stavu + netreba,
nevytvárať ďalší nezávislý select. Potvrdené miesto ≠ kompletná adresa.
Existujúce Sync chyba/Sync stav stačia pre konflikty; žiadny druhý conflict tracker.

Navrhované views: „Adresy na kontrolu“ (pending alebo sync chyba), „Chýbajúca
adresa“ (fyzické bez adresy), „Google stav“ (systémové stĺpce). Existujúce views
sa neprepisujú. Layout je návrh; nič z toho nebolo vytvorené.

Kraj: cieľový select presne Bratislavský kraj, Trnavský kraj, Trenčiansky kraj,
Nitriansky kraj, Žilinský kraj, Banskobystrický kraj, Prešovský kraj, Košický kraj.
Okres: cieľový select presne podľa `SLOVAK_DISTRICTS_BY_REGION` v
`lib/slovakia-locations.ts` (79 možností), nie druhý ručne udržiavaný číselník.
Mesto zostáva text; server overí celú trojicu cez `resolveSlovakLocation`.
Neprisľubujeme natívny závislý select kraj → okres → obec: tento návrh žiadne
také vynucovanie v Notione nemá. Samotný select nezaručí správnu kombináciu.
Neplatné a nejednoznačné hodnoty zostávajú v evidence/review, nie canonical.

## 5. Historické hodnoty a dvojkroková konverzia

Adresár: agregácia našla 97 riadkov Kraj=Online, 50 s prázdnym krajom aj okresom,
26 riadkov Nové Mesto nad Váhom a 7 Nové Mesto n.Váhom; repo snapshot používa
**Nové Mesto n.Váhom**. Ďalej Bratislava (3), Košice (2) ako okres a kombináciu
Trnavský kraj / Šaľa (1). Ide o Notion riadky bez filtra publikácie, nie počty
produkčne aktívnych profilov. Bratislava/Košice nerozdeľovať automaticky na
číslované okresy; nesprávny kraj neopravovať odhadom. Skratkový alias nie je
garantovaný aktuálnym kontraktom fázy 2; musí mať explicitné posúdenie/mapovanie.

**Krok A — kompatibilita:** zachovať typy Kraj/Okres, najprv typovo adaptívni
readeri/writeri, closed allowlist, adresné guards, baseline v2 a chýbajúce polia.
Prázdny nový Okres pri evente začína ako rich_text pre jednotný staging režim.
Žiadne dočasné `Kraj 2`, `Okres 2` či druhá canonical adresa.

**Krok B — schválený cutover:** až po úplnom exporte hodnôt všetkých troch DB,
mapovaní výnimiek a teste v izolovanej kópii premeniť existujúci Kraj/Okres na
select. Export zachová raw rich text vrátane formátovania, page/property IDs,
schema/options/views a mapping/baseline. Pred návratom writerov porovnať každý
riadok, nielen vzorku. Overiť zachovanie property ID; ak sa mení, zastaviť a
upraviť manifest/mapovanie. Neaplikovať native konverziu naslepo.

Online nie je deviaty kraj. Event potrebuje samostatný logický režim; návrh
property `Režim lokality` select PHYSICAL / ONLINE / SERVICE_AREA, s ONLINE
povoleným pre event a SERVICE_AREA podľa entity. Adresár má existujúce `Online`:
nevytvárať paralelný režim; najprv vyriešiť legacy Online profily a ich súčasný
produktový kontrakt. Event online marker dnes žije v region/city, preto migrácia
na prázdny Kraj nesmie prebehnúť pred kompatibilným adaptérom. Google Maps
netreba nie je náhrada za režim, pretože aj fyzické miesto môže byť NOT_REQUIRED.
V tomto PR sa žiadny historický text, režim ani stav nemení.

## 6. Presný diff manifest (plán, nie execute payload)

Spoločné postupy pre každý riadok:

- **B1 záloha:** raw data-source schema s property IDs/options + všetky page
  property hodnoty s IDs + views/layout + D1 sync mapping/baseline a revízie;
  bez zápisu do živej DB, bezpečné úložisko, kontrolný hash a úplnosť stránkovania.
- **A1 pridanie:** znovu fetch ID/schémy; expected absent musí sedieť. Ak rovnaký
  názov už existuje s presným typom, no-op, nie recreate; iný typ → stop.
  Samostatný schválený schema-only krok, bez spustenia sync/backfill. Prázdne
  nové properties nesmú spôsobiť clear ani zmenu editorial baseline.
- **V1 overenie:** re-fetch a porovnať name/type/ID/options; existujúce hodnoty,
  počty stránok a identity nezmenené. Po samostatnej autorizácii canary a 2 sync
  kolá; druhé bez dátových zápisov, konfliktov navyše a fingerprint churn.
- **R1 návrat:** vypnúť iba novú cestu v samostatnom schválenom release; pridané
  polia ponechať/skryť, nemažú sa. Dáta obnovovať len z B1 s revision check,
  aby sa neprepísali medzitým vykonané oprávnené zmeny.
- **C1 konverzia:** postup kapitoly 5, úplný mapping a izolovaný rehearsal.
  **R2 návrat konverzie:** zastaviť príslušné writery, obnovenie pôvodného typu
  a hodnôt podľa page/property ID z B1 po kontrole revízií; kompatibilný reader
  funguje s oboma typmi. Samotný rollback kódu typ property nevráti.

### 6.1 Adresár — data source 84e0664c-ca47-405f-9d54-31b20287bc8c

| Existujúce property | Zmena / výsledný REST typ | Riziko / závislosť | Záloha / aplikovanie / overenie / návrat |
|---|---|---|---|
| Kraj: text | A ponechať rich_text; B select 8 krajov | Vysoké: Online + fixed encoder; fáza 9 a všetci Gemini writeri | B1 / C1 / V1 + úplný value mapping / R2 |
| Okres: text | A rich_text; B select 79 okresov | Vysoké: historické aliasy/hierarchia, closed allowlist | B1 / C1 / V1 + úplný value mapping / R2 |
| Mesto, Adresa, PSČ, Ulica, Číslo domu | KEEP rich_text | Neprepisovať potvrdené; fáza 9 guards | B1 / bez schema writes / porovnať pôvodné hodnoty / bez návratu |
| Formát adresy | KEEP select STREET, MUNICIPALITY_NUMBER | Žiadna konverzia ani numberless nový enum | B1 / KEEP / V1 / bez návratu |
| Potvrdená prevádzka, Online | KEEP checkbox | Nemeniť význam; confirmation pull musí obmedziť fáza 9 | B1 / KEEP / V1 / bez návratu |
| — Presnosť lokality | ADD rich_text, systémové P→N | Nízke schema, privacy mirror musí zostať existujúci | B1 / A1 / V1 / R1 |

### 6.2 Podujatia — data source 76d9ccde-5816-422c-bcfe-863ab69db080

| Existujúce property | Zmena / výsledný REST typ | Riziko / závislosť | Záloha / aplikovanie / overenie / návrat |
|---|---|---|---|
| Kraj: text | A rich_text; B select 8 krajov | Vysoké: neoverené historické hodnoty, Online marker | B1 / C1 / V1 + všetky hodnoty / R2 |
| — Okres | ADD rich_text v A; select 79 v B | Fáza 3 D1 + 9 adapter; neodvodzovať okres z mena mesta | B1 / A1, potom C1 / V1 / R1, potom R2 |
| — PSČ | ADD rich_text | Fáza 3 + 5 + 9, nikdy number | B1 / A1 / V1 / R1 |
| — Ulica | ADD rich_text | Fáza 3 + 5 + 9 | B1 / A1 / V1 / R1 |
| — Číslo domu | ADD rich_text | Fáza 3 + 5 + 9, lomky/písmená | B1 / A1 / V1 / R1 |
| — Formát adresy | ADD select STREET, MUNICIPALITY_NUMBER | Overiť výsledný kontrakt fázy 3, encoder a evaluator | B1 / A1 / V1 / R1 |
| — Režim lokality | ADD select PHYSICAL, ONLINE | Samostatný Online režim; vyžaduje kompatibilný event adaptér | B1 / A1 po mode adaptéri / V1 vrátane Online roundtrip / R1 |
| Miesto, Mesto, Adresa | KEEP rich_text | Miesto = venue; nesmie sa nahradiť ulicou | B1 / KEEP / porovnať venue a adresu / bez návratu |

Event používa iba **PHYSICAL, ONLINE**; spoločný interný kontrakt pozná aj
SERVICE_AREA pre iné entity. Ten sa do event selectu nepridáva.

### 6.3 Organizácie — data source 6fbf8eb2-2f72-4d0c-b825-c46f6f72f92e

| Existujúce property | Zmena / výsledný REST typ | Riziko / závislosť | Záloha / aplikovanie / overenie / návrat |
|---|---|---|---|
| Kraj, Okres: text | A rich_text; B select 8 / 79 | Vysoké: historické hodnoty neoverené, locality ownership | B1 / C1 / V1 + všetky hodnoty / R2 |
| — PSČ | ADD rich_text | Fáza 3 na organization_locations, nie help_organizations | B1 / A1 / V1 / R1 |
| — Ulica | ADD rich_text | Fáza 3 + 5 + 9 a identity binding | B1 / A1 / V1 / R1 |
| — Číslo domu | ADD rich_text | Fáza 3 + 5 + 9 a identity binding | B1 / A1 / V1 / R1 |
| — Formát adresy | ADD select STREET, MUNICIPALITY_NUMBER | Podmienené výsledným kontraktom fázy 3 | B1 / A1 / V1 / R1 |
| — Psipedia lokalita ID | ADD rich_text, systém P→N | Binding konkrétnej existujúcej lokality; nikdy klientská autorita | B1 / A1 až s fázou 9 / V1 target/org check / R1 |
| Adresa: text | KEEP rich_text; navrhnutý podmienený missing-only ingress | Vysoké: dnes system-owned, nejde len o schema change | B1 / až fáza 9 / V1 Google+role+privacy / R1 |
| Mesto: text | KEEP rich_text | Locality musí patriť k tej istej lokalite | B1 / KEEP / V1 / bez návratu |

Organizácia zostáva jedna Notion stránka. Nové komponenty sú projekcia/návrh na
jednu konkrétnu `organization_locations` lokalitu, nie druhá adresa na
`help_organizations`. Server záväzne mapuje organizationId + locationId; pri
zmene reprezentovanej lokality zastaví pull a vyžiada review. Prázdne ID či
nová organizácia nesmie samo vytvoriť SITE. LEGAL_SEAT sa nikdy automaticky
nestane verejnou prevádzkou; SERVICE_AREA bez street address je platný prípad.
Existujúce pobočky, roly, primary a poradie sa nemenia.

### 6.4 Spoločné dodatky — aplikovať samostatne na každé z troch ID

| Existujúce property | Zmena / výsledný REST typ | Riziko / závislosť | Záloha / aplikovanie / overenie / návrat |
|---|---|---|---|
| — Zdroj adresy | ADD url | Odlišný účel od Zdroj dát; iba verejný dôkaz konkrétnej adresy | B1 / A1 / V1 / R1 |
| — Pôvod adresy | ADD select RESEARCH, NOTION_EDITOR, PSIPEDIA_ADMIN, GOOGLE_CONFIRMED, LEGACY_UNKNOWN | Evidence; Google/Admin pôvod určuje iba server, nie AI | B1 / A1 po ownership adaptéri / V1 anti-spoofing / R1 |
| — Adresa čaká na kontrolu | ADD checkbox | Systémový review projection; unchecked neznamená schválené; prázdny legacy údaj nie je stav rozhodnutia | B1 / A1 / V1 pending/confirmed roundtrip / R1 |
| Google Place ID, GEO stav, GEO provider, Google Maps cieľ | KEEP rich_text | Nemeniť na select ani neprijať ako vstup | B1 / KEEP / V1 privacy/current/stale / bez návratu |
| Google miesto aktuálne, Google Maps netreba | KEEP checkbox | Notion-only zmena nemá canonical účinok | B1 / KEEP / V1 / bez návratu |
| Latitude, Longitude | KEEP number | Pár, privacy projekcia; žiadny GPS pull | B1 / KEEP / V1 / bez návratu |
| Posledný sync, Sync chyba, Sync stav, Zdroj dát | KEEP date, rich_text, select, url | Reuse, bez premenovania či odoberania existujúcich options | B1 / KEEP / V1 / bez návratu |

Pôvod a review metadata vyžadujú perzistentnú evidence/review väzbu v existujúcom
systéme (fázy 9/10); checkbox ani source URL nemajú nahradiť auditný záznam.
Zdroj dát neprepisovať URL adresného dôkazu. Nové metadata nepatria do editable
address fingerprint. Ostatné existujúce property sú KEEP bez zmeny typu či dát.

## 7. Pravidlá fázy 9 — obojsmerná synchronizácia

1. Server načíta aktuálny canonical snapshot, GEO vrátane stale anchor,
   privacy/manual override, identity a revíziu. Notion mirror sa nepoužije ako
   dôkaz absencie Google Place. Shared `planInternalAddressPatch` integruje
   missingOnly + expectedRevision; jeho `allowed=false` nikdy nepersistovať.
2. Research dopĺňa iba chýbajúce polia, ak chýbajú na oboch stranách; ak ich
   Psipedia má, obnoviť projekciu až podľa conflict pravidiel. Neplatný neprázdny
   legacy údaj nie je missing. Iná existujúca adresa ide do review, nie replacement.
3. Omitted a nové prázdne property znamenajú nezmeniť. Notion prázdny string/null
   nie je explicitný admin clear. Clear iba samostatná autorizovaná admin cesta
   s revíziou a dôvodom; research nikdy nemaže.
4. Google current aj stale, potvrdená prevádzka, manual override a private/HIDDEN
   chránia adresné zmeny. Completeness a confirmation sú samostatné. Pri identical
   normalized values no-op; incomplete Google výsledok nevymaže komponenty.
5. Organizácie: dnešné `Adresa` zostáva system-owned pre export/hash. Budúci
   ingress posúdi túto property ako návrh iba pri prázdnej canonical adrese,
   bez lockov a s jednoznačným serverovým location binding. Nepridať ju bez
   podmienok do všeobecného editable whitelistu. Nesplnenie gate → review.
   Pokiaľ pôvodný mirror by návrh prepísal, najprv ho zachytiť do existujúcej
   evidence/review; nesmie zmiznúť pred rozhodnutím. Potvrdené componenty P→N
   exportovať spolu so správnou lokalitou a privacy, bez vytvorenia novej adresy.
6. Baseline rozšíriť verziovane: nové prázdne polia normalizovať ako absent v
   oboch snapshotoch. Reuse `decideBidirectionalChange` a existujúcu schema-only
   recovery; baseline migrovať iba ak projekcia starých polí zodpovedá pôvodnému
   baseline a nepribudla skutočná rozdielna zmena. Nové neprázdne hodnoty nie sú
   automaticky schema-only. Žiadny plošný reset baseline na aktuálny Notion hash.
7. Po úspešnom guarded zápise načítať skutočný uložený normalizovaný stav,
   až potom baseline. Partial source/GEO alebo Notion transport failure nesmie
   dostať úspešný baseline; bounded retry s rovnakým mapping/operation ID.
8. Typový preflight pred každým migračným batchom; známe rich_text/select iba
   v kompatibilnom režime, neznámy typ stop. Closed option whitelist: žiadne
   implicitné rozširovanie krajov či okresov payloadom.
9. Google spätný export je existujúci sync/mirror, nie nový cron. Posledný sync
   je čas úspešného transportu. Systémové polia držať mimo editable hash, aby
   ich oprava v Notione nespôsobila spätný canonical write ani cyklus.

Akceptácia budúcej implementácie: missing-only, nonempty replacement odmietnutý,
current/stale Google, manual/private, invalid hierarchy, explicit clear,
Online bez fyzickej adresy, venue preservation, wrong location ID, LEGAL_SEAT,
schema expansion bez konfliktov, type mismatch, alias collision, retry po partial
failure a dve kolá s druhým no-op. Použiť existujúce notion-directory-sync,
notion-events-help-bidirectional, notion-geo-mirror a admin-address-contract testy.

## 8. Poradie, blokátory a vykonané overenie

Fázy 3 a 4 môžu bežať paralelne. Tento dokument nemení žiadny súbor fázy 3.
Fáza 5 čaká na 3; fáza 9 na 4 a 5; automatizované dopĺňanie na 9/10.
Docs-only merge nie je schválenie live Notion migrácie.

Pred schema write: osobitné schválenie manifestu, fresh ID/schema preflight,
úplný export B1, potvrdené D1/schema adapters, zastavenie súbežných dotknutých
writerov v dohodnutom okne, izolovaný rehearsal, oddelený schema-only execute,
readback a až potom samostatne autorizovaný bounded canary. Nezapínať ani
nevypínať existujúce automatizácie týmto PR.

Blokátory konverzie: neoverené historické hodnoty Events/Organizations kvôli
limitu; Online/aliasy/invalid hierarchy v Adresári; fixed rich_text writeri;
organization address ownership; stale/manual/privacy guards zatiaľ nezapojené;
produkčné bindings a výsledok fázy 3 neoverené. Žiadny z nich nevyžaduje
obchádzanie limitu alebo zmenu živých dát v tejto fáze.

Vykonané: GitHub repo/oprávnenia/main, čistý clone, štyri východiskové dokumenty,
relevantné adaptéry a encodery, tri live database + tri data source fetch,
jedna úspešná agregácia historických hodnôt. Kontrola dokumentácie: docs-only
diff, whitespace, relatívne odkazy a zhoda inventára so zachytenými schémami.
Runtime build/test suite nemá pri jedinom Markdown súbore relevantný scope;
nespustené. Žiadny sync, schema write, record write, D1 migrácia, provider call,
produkčný deploy, auto-merge ani čakanie na CI.

## 9. Úplný schema inventár

Nasledujúci dodatok zachytáva všetky property názvy/typy/select možnosti z live
fetch. Neadresné polia sú mimo ownership auditu a bez navrhovaných zmien.

### Adresár

| Property | Notion typ | Existujúce select možnosti |
|---|---|---|
| Adresa | text | — |
| Aktualizované Psipedia | date | — |
| Alt text obrázka | text | — |
| Archivované Psipedia | date | — |
| Canonical URL | url | — |
| Cena / poznámka | text | — |
| E-mail | email | — |
| Facebook | url | — |
| Formát adresy | select | STREET, MUNICIPALITY_NUMBER |
| GEO provider | text | — |
| GEO stav | text | — |
| Google Maps cieľ | text | — |
| Google Maps netreba | checkbox | — |
| Google Place ID | text | — |
| Google miesto aktuálne | checkbox | — |
| Hlavný obrázok URL | url | — |
| Instagram | url | — |
| Interný e-mail | email | — |
| Kategória | text | — |
| Kontrola 1 | date | — |
| Kontrola 2 | date | — |
| Kraj | text | — |
| Kvalifikácie | text | — |
| Kvalita skontrolované | date | — |
| Kvalita · Adresa | select | Nemá, Verejne nezverejnené, Nedohľadateľné, Nevzťahuje sa |
| Kvalita · E-mail | select | Nemá, Verejne nezverejnené, Nedohľadateľné, Nevzťahuje sa |
| Kvalita · Obrázok | select | Nemá, Verejne nezverejnené, Nedohľadateľné, Nevzťahuje sa |
| Kvalita · Telefón | select | Nemá, Verejne nezverejnené, Nedohľadateľné, Nevzťahuje sa |
| Kvalita · Web | select | Nemá, Verejne nezverejnené, Nedohľadateľné, Nevzťahuje sa |
| Latitude | number | — |
| Logo URL | url | — |
| Longitude | number | — |
| Mesto | text | — |
| Noindex | checkbox | — |
| Názov | title | — |
| OG obrázok | url | — |
| OG popis | text | — |
| OG title | text | — |
| Obrázok Psipedia | url | — |
| Obrázok key | text | — |
| Odporúčané | checkbox | — |
| Okres | text | — |
| Online | checkbox | — |
| Overené | checkbox | — |
| PSČ | text | — |
| Perex | text | — |
| Popis | text | — |
| Posledný sync | date | — |
| Potvrdená prevádzka | checkbox | — |
| Poznámky | text | — |
| Psipedia ID | text | — |
| Psipedia stav | select | Koncept, Publikované, Archív |
| Publikované Psipedia | date | — |
| SEO kľúčové slovo | text | — |
| SEO popis | text | — |
| SEO title | text | — |
| Slug | text | — |
| Služby | text | — |
| Stav | select | Nápad, Na kontrolu, Ready, Publikované, Archív |
| Sync chyba | text | — |
| Sync hash | text | — |
| Sync stav | select | Neodoslané, Čaká na sync, Synchronizované, Chyba |
| Telefón | phone_number | — |
| URL Psipedia | url | — |
| Ulica | text | — |
| Upravil | text | — |
| Vytvorené Psipedia | date | — |
| Vytvoril | text | — |
| Web | url | — |
| Zdroj dát | url | — |
| Zdroj obrázka | url | — |
| Číslo domu | text | — |

### Podujatia

| Property | Notion typ | Existujúce select možnosti |
|---|---|---|
| Adresa | text | — |
| Alt text obrázka | text | — |
| Canonical URL | url | — |
| GEO provider | text | — |
| GEO stav | text | — |
| Google Maps cieľ | text | — |
| Google Maps netreba | checkbox | — |
| Google Place ID | text | — |
| Google miesto aktuálne | checkbox | — |
| Hlavný obrázok URL | url | — |
| Koniec | date | — |
| Kraj | text | — |
| Latitude | number | — |
| Longitude | number | — |
| Mesto | text | — |
| Meta description | text | — |
| Miesto | text | — |
| Noindex | checkbox | — |
| Názov | title | — |
| OG obrázok | url | — |
| OG popis | text | — |
| OG title | text | — |
| Organizátor | text | — |
| Perex | text | — |
| Popis | text | — |
| Posledný sync | date | — |
| Poznámky | text | — |
| Praktické info | text | — |
| Presnosť lokality | text | — |
| Psipedia ID | text | — |
| Registrácia | url | — |
| SEO title | text | — |
| Slug | text | — |
| Stav | select | Nápad, Na kontrolu, Ready, Publikované, Archív |
| Sync chyba | text | — |
| Sync stav | select | Neodoslané, Čaká na sync, Synchronizované, Chyba |
| Typ podujatia | text | — |
| URL Psipedia | url | — |
| Web | url | — |
| Začiatok | date | — |
| Zdroj dát | url | — |
| Zdroj obrázka | url | — |
| Zrušené | checkbox | — |
| Čas konca | text | — |
| Čas začiatku | text | — |

### Organizácie

| Property | Notion typ | Existujúce select možnosti |
|---|---|---|
| Adresa | text | — |
| Alt text obrázka | text | — |
| Facebook | url | — |
| GEO provider | text | — |
| GEO stav | text | — |
| Google Maps cieľ | text | — |
| Google Maps netreba | checkbox | — |
| Google Place ID | text | — |
| Google miesto aktuálne | checkbox | — |
| Hlavný obrázok URL | url | — |
| Instagram | url | — |
| IČO / registračné číslo | text | — |
| Kontrola 1 | date | — |
| Kontrola 2 | date | — |
| Kraj | text | — |
| Krátky popis | text | — |
| Latitude | number | — |
| Longitude | number | — |
| Mesto | text | — |
| Názov | title | — |
| Okres | text | — |
| Popis | text | — |
| Posledný sync | date | — |
| Poznámky | text | — |
| Presnosť lokality | text | — |
| Právny názov | text | — |
| Psipedia ID | text | — |
| Slug | text | — |
| Stav | select | Nápad, Na kontrolu, Ready, Publikované, Archív |
| Sync chyba | text | — |
| Sync stav | select | Neodoslané, Čaká na sync, Synchronizované, Chyba |
| Typ | text | — |
| URL Psipedia | url | — |
| Web | url | — |
| Zdroj dát | url | — |
| Zdroj obrázka | url | — |
