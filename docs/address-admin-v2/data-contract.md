# Jednotný interný adresný kontrakt — návrh

Návrh pre ďalšie fázy. Interná validačná vrstva fázy 2 je popísaná v
[implementačnom kontrakte](contract-implementation.md); existujúce runtime zápisy
a verejné modely zatiaľ zostávajú nezmenené.
Východisko a odlišnosti: [audit](audit.md). Public komponenty, filtre, SEO,
mapa a existujúce legacy `address` hodnoty zostávajú počas rollout kompatibilné.

## 1. Logický kontrakt a vlastníctvo

Rozšíriť existujúce canonical tabuľky a adaptéry; nevytvárať druhý geographic
číselník, nový GEO store ani adresný systém paralelný s organization_locations.

| Pole/skupina | Kontrakt | Authority a absent hodnota |
|---|---|---|
| target | existujúci targetType + stabilné ID; organizationId a locationId osobitne | server; nevychádzať z náhodného Google ID |
| locationMode | PHYSICAL / ONLINE / SERVICE_AREA ako logický interný režim | admin; spôsob perzistencie rozhodnúť vo fáze 2; Online nemá deviaty kraj |
| region/district/city | presná trojica existujúceho snapshotu, alebo explicitne neúplný návrh | server `resolveSlovakLocation`; raw provider text iba do evidence/review |
| postalCode | text, 5 číslic, normalizované `NNN NN` | ručne alebo Google; absent interne null, adapter mapuje legacy `''` |
| street | trim text, manuálne zadateľný, bez povinného autocomplete | admin/Google; absent nie automaticky chyba pre municipality-number/numberless |
| houseNumber | text, nie integer; zachovať lomku/písmeno | admin/Google; nevymýšľať číslo pre areál alebo park |
| addressFormat | existujúce STREET / MUNICIPALITY_NUMBER; numberless explicitná výnimka | reuse directory evaluator; neodvodzovať presnosť iba z textu |
| editorialAddress | existujúci verejný text `address` cez kompatibilný adapter | zachovať editorový text; Google zmenu ukázať v diff; neprepísať historické texty backfillom |
| address completeness | existing MISSING / INCOMPLETE / NEEDS_REVIEW / COMPLETE cez adaptéry | odvodené, oddelené od confirmed place |
| service-location confirmation | existujúce directory confirmation, pre ostatné dohodnutý ekvivalent | explicitný dôkaz; validita obce sama nie je confirmation |
| place confirmation | Google Place ID + matched timestamp + fingerprint | geo_points; aktuálne iba keď fingerprint zodpovedá zdroju a platí GEO/visibility kontrakt |
| GEO | lat/lon pár, status, resolutionMethod, provider/provenance, source/resolved fingerprints | existujúci geo-store; manual_override je samostatná vyššia ochrana |
| privacy | existing publicVisibility/publicPrecision; organization location role zvlášť | nikdy nepovažovať legal seat/service area automaticky za exact public SITE |
| evidence | source URL, retrievedAt, actor/provider, proposal fingerprint a review decision | reuse automation evidence/review; neplniť Google systémové polia z AI textu |
| write guard | target identity, očakávaná canonical revision/updatedAt + source fingerprint | server kontrola pri apply; konflikty explicitne do review |

Absent, omitted a explicit clear sú odlišné operácie: missing-only import nič
nevymaže; explicitné vymazanie je admin patch s dôvodom a revíziou. Google
incomplete component nesmie automaticky vymazať existujúcu hodnotu. Pri inom
Google mieste však ani slepo nekombinovať starú ulicu a nové mesto: review diff,
jasné potvrdenie novej adresy, zachovanie len kompatibilných hodnôt.

## 2. Manuálna a Google cesta

1. Interný editor používa existujúci `SlovakiaLocationSelector`; ručné PSČ, ulica,
   číslo. Uloženie čiastočného návrhu nesmie predstierať exact confirmation.
2. Google discovery reuse existujúci provider/scoring, bounded queries.
3. Náhľad obsahuje rozdiel polí, pôvodné hodnoty, raw Google addressComponents,
   namapovanú trojicu, nejednoznačnosť, chýbajúce componenty a privacy/role.
4. Server pred apply overí kandidáta aj revíziu. Odlišná lokalita, stale candidate,
   manual override, explicit private alebo zmena role vyžadujú explicitný postup.
5. Source update a GEO confirmation majú jeden garantovaný guarded commit alebo
   recoverable idempotent operation; neoznačiť úspech pri zlyhaní druhej časti.
   Konkrétnu D1 batch/transaction realizáciu preveriť na existujúcich abstrakciách.
6. Notion export cez existujúci mapping/mirror s retry; nevyžadovať nový cron.
7. Nenájdený výsledok: manuálna adresa, existujúci manual GEO postup alebo
   „Google Maps netreba“. Neukladať neplatný exact bod a nenútiť provider call.

Google je prioritná cesta potvrdenia presného miesta, nie jediný spôsob uloženia
adresy. Kompletná fyzická adresa a potvrdený Google Place sú dve nezávislé dimenzie.

## 3. Synchronizácia bez prepisovania a cyklov

| Stav | Notion → Psipedia | Psipedia → Notion |
|---|---|---|
| adresa chýba, bez locku | doplniť chýbajúce validné polia; návrhy mimo hierarchie do review | export canonical návrhu cez existujúci mapping |
| existujúca neconfirmed adresa sa líši | review alebo explicitný admin approval; missing-only nepovažovať za replacement | baseline conflict pravidlá, žiadny tichý winner |
| current Google Place | chrániť všetky potvrdené adresné/GEO polia; rozdiel do review | export dostupných confirmed address componentov a systémový GEO mirror |
| stale Google anchor | neodomknúť automaticky pre Notion/AI; vyžaduje admin review zdrojovej zmeny | exportovať current/stale pravdivo, nehlásiť aktuálne miesto |
| manual_override / explicit private | automatizácia ani Notion nemenia polohu/visibility | zachovať privacy; private mirror nesmie odhaliť súradnice |
| obojstranná rozdielna zmena | reuse baseline conflict queue | neopakovať dva striedavé zápisy |
| identické normalizované hodnoty | no-op | no-op; aktualizovať baseline iba keď bezpečné |

Reuse `decideBidirectionalChange` a stable snapshot normalizáciu. GEO/Google
polia zostávajú system-owned mimo editable hash. Pridanie properties musí mať
verziované/migračné baseline pravidlo, aby nové prázdne pole nevyrobilo konflikt
alebo clear. Po úspešnom pull/push uložiť hash skutočne uloženého normalizovaného
stavu; neukladať baseline pri čiastočnej chybe. Retry je bounded a dedup podľa
mapping + proposal/revision, nie vytváranie novej Notion stránky.

Organizácie dnes majú system-owned `Adresa`. Budúci missing-only pull vyžaduje
explicitnú zmenu ownership policy a mapovanie konkrétnej lokality; nerozšíriť
editable field bez ochrany Place/role a bez vyriešenia multi-location modelu.

## 4. Bezpečný plán migrácií

1. Read-only inventár nasadenej D1 a Notion schémy: názvy, typy, IDs, duplicity,
   mappings a deployment revision. Zatiaľ neoverené; žiadne odhady typu properties.
2. Schváliť kontrakt a field ownership. Additive nullable/empty-compatible polia
   pre managed_events (district, postal/street/number/format podľa schválenia)
   a organization_locations (postal/street/number/format). Nepreniesť adresu do
   help_organizations ako druhú canonical kópiu; neprečíslovať lokality.
3. V samostatnom implementačnom PR pripraviť existujúcim systémom novú SQL migráciu,
   rehearsal na izolovanej fixture, schema guard a backward-compatible readers.
   V tomto audite žiadny nový migration súbor ani aplikácia migrácií.
4. Notion diff manifest: data source ID, property name/type, expected before/after,
   vlastníctvo, zálohované schema metadata. Dopĺňať iba chýbajúce properties cez
   existujúci schema-extension mechanizmus; mismatch typu/duplicitný názov stop/review.
5. Notion Podujatia navrhnúť Okres/PSČ/Ulica/Číslo domu; Organizácie PSČ/Ulica/
   Číslo domu a missing-only Adresa policy; Adresár najprv overiť, nie znovu vytvoriť.
   Typy zvoliť podľa reálneho encoder/schema kontraktu, číslo domu a PSČ ako text.
6. Najprv kompatibilné adaptéry a nový baseline, potom explicitný bounded canary
   na schválených ID. Legacy prázdne hodnoty bez automatického geocoding/backfill.
7. Rollback: deaktivovať iba novú write cestu v samostatne autorizovanom deploy,
   zachovať staré readers a additive polia; obnovu dát robiť z auditovaného diff.
   Nevykonávať destructive DROP alebo hromadné prepisovanie.

Nasadenie, schema writes, platené canary a produkčný backfill vyžadujú konkrétne
zadanie ďalšej fázy. Sú plán, nie vykonané operácie.
