# PSIPEDIA.SK — jeden zdroj údajov, fáza 4/4

**Dátum:** 15. 11. 2026  
**Stav:** samostatný Draft PR na `main`, bez produkčnej migrácie/zápisov.  
**Cieľ:** odstrániť duplicitné čítacie *pravidlá* a zabrániť ožívaniu starých aliasov, nie stratiť platné profily.

## Čo sa zjednotilo v kóde

`lib/directory-public-source-contract.ts` obsahuje jedno statické pravidlo pre:

| Verejný údaj | Autoritatívna hodnota | Historické fallbacky |
| --- | --- | --- |
| Okres | D1 `directory_profiles.district` | `source_data_json.Okres` iba ak je D1 okres prázdny |
| Plemeno (zdrojový facet) | `Plemeno` | `Plemená` iba ak hlavný kľúč neexistuje |
| FCI skupina | `FCI skupina` | `FCI` iba ak hlavný kľúč neexistuje |
| Organizácia | `Organizácia` | `Zastrešujúca organizácia` iba ak hlavný kľúč neexistuje |
| Typ profilu | `Typ služby` | `Typ poskytovateľa`, `Typ klubu` iba ak hlavný kľúč neexistuje |

**Výslovne zapísaná prázdna hlavná hodnota je platné vymazanie.**
Nesmie sa prekryť aliasom z pôvodného importu. Chybný JSON sa pri
verejnom čítaní berie ako prázdny a neshodí vyhľadávanie.

Zdieľané okresné pravidlo teraz používa:
- bežný verejný zoznam Adresára vrátane výsledkov a filtrov,
- počty a možnosti lokálnych facetov,
- vyhľadávanie podľa názvu a lokality,
- náhľady kategórií,
- homepage (samostatný i skupinový D1 query),
- globálne vyhľadávanie portálu.

V týchto miestach už nie sú samostatne napísané rôzne SQL
`json_extract(...Okres...)` fallbacky.

## Čo nie je bezpečné odstrániť bez dátového auditu

**NEODSTRAŇOVAŤ** zatiaľ celý `directory_profiles.source_data_json`.
Stále má legitímne aktívne D1 vlastníctvo technických údajov:
- ďalšie kategórie profilu `_psipedia_additional_categories`,
- 21 kategóriových výberových filtrov `_psipedia_filter_v1_*`,
- doplnkové spojenia na plemená a kluby a odkazy na galérie,
- zdrojové metadáta, hodnoty posúdenia kvality, texty služieb trénerov,
- staré redakčné údaje, ktorých kanonická migrácia ešte nie je overená.

Navyše:
- `district = ''` nemá v starej schéme informáciu, či ide o
  *úmyselné vymazanie* alebo *historicky nevyplnenú hodnotu*.
  Preto do schváleného backfillu ostáva fallback `Okres`. Úplne
  odstrániť túto vetvu bez straty okresov zatiaľ nemožno.
- Karty chovateľských staníc majú vlastnú **kanonickú vzťahovú**
  preferenciu a následný historický textový fallback; nemožno to
  odstrániť bez porovnania tabuliek vzťahov a publikovaných plemien.
- Otváracie hodiny a pokrytie tiež majú historické synonymá a zatiaľ
  zostávajú v zdrojovom JSON, kým majiteľ nepotvrdí parity výsledky.
- Iné agendy (Plemená, Pomoc psom, Články, Podujatia) majú samostatné
  prechodové čítacie pravidlá: **toto PR upravuje Adresár**, nie ich
  databázové migrácie.
- Ľudská úprava v Notione a automatická úprava Notion stránky sa z
  prostého webhook property ID nemusia dať odlíšiť. Samotná fáza 4
  nevyrieši pôvod týchto zápisov; ochrana automatizácie vyžaduje
  zvlášť overiteľný zdroj udalostí/politiku.

## Read-only overenie aktuálnej D1

Na získanie **SQL dotazu** lokálne:

```bash
node scripts/directory-legacy-cutover-readiness.mjs > directory-readiness.sql
```

Dotaz je jeden `SELECT` s agregáciou podľa kategórie a stavu.
Neobsahuje `INSERT`, `UPDATE`, `DELETE`, `ALTER` ani priame
kontaktné hodnoty. Vykonať iba cez autorizovaný **read-only**
prístup k produkčnej D1; v tomto PR sa nevykonáva automaticky.

Sleduje:
1. neplatné JSON,
2. okres iba v importe a nesúlad okresov,
3. organizáciu iba v importe a konflikt/prázdnu hlavnú hodnotu,
4. plemeno iba v importe a konflikt/prázdnu hlavnú hodnotu,
5. FCI iba v importe a konflikt/prázdnu hlavnú hodnotu,
6. otváracie hodiny či pokrytie iba pod historickým menom,
7. počet profilov so stále potrebnými `_psipedia_*` technickými údajmi.

Počíta **iba počty**, nie jednotlivé názvy, kontakty, adresy alebo
obsah JSON. Nie je to samo osebe dôkaz pripravenosti na cutover; na
reálnu migráciu treba aj kontrolu vzťahov, stránok a poľa
`district` bez tombstone príznaku.

## Podmienky na finálne odstránenie fallbackov (NEBOLI SPLNENÉ)

- Získať read-only audit z reálnej produkčnej D1 a vyhodnotiť všetky
  chýbajúce/konfliktné údaje. Nepovažovať nulový počet v testovacích
  fixture dátach za produkčnú paritu.
- V Admine musí byť viditeľná autoritatívna hodnota každého verejného
  redakčného poľa (fáza 2/4); otestovať úmyselné prázdne hodnoty.
- Zálohovať pôvodné dáta a schváliť idempotentné per-field doplnenie
  do správnych D1 polí/vzťahov; nikdy z voľného textu automaticky
  nevyvodzovať kanonické plemená alebo kluby.
- Po migrácii overiť rovnaké početnosti výsledkov, filtrovanie,
  zobrazenie kariet, SEO landingy a mobile/desktop.
- Skontrolovať a úspešne preveriť všetky tri predchádzajúce Draft PR:
  #1379 kontakty, #1380 editor, #1381 ochrana pred reimportom.
- Len po explicitnom schválení majiteľa pripraviť **osobitný
  produkčný migračný krok** a až potom úplne vypnúť starý fallback.

## Testovanie a nasadenie

Tento PR obsahuje SQLite testy priority a nulovania hlavného kľúča,
prezentácie okresov, filtrov, chybného JSON, globálneho vyhľadávania
a read-only agregovaného auditu. Bez úspešného CI a vizuálnych
dôkazov zo zhodnej revízie PR sa nesmie označiť ako pripravený
na merge. V tomto PR sa nezasahuje do schémy, Notion webhookov,
produkčnej D1/R2, nastavení ani deploymentu.
