# Psipedia – audit identifikátorov a 8 krokov jednotných zobrazovaných ID

Dátum: 11. november 2026 · Repozitár: `investradarsk/psipedia-sk`.

## Čo už funguje a čo nechávame nedotknuté

- **D1**: primárne čísla `id` sú jedinečné **iba v rámci jednej tabuľky**. Existujúce foreign keys, synchronizačné mapovania, SQL migrácie, REST parametre `[id]`, slugy a URL zostávajú nezmenené.
- **Notion**: `Psipedia ID` je surové číselné ID podľa príslušnej kolekcie, často chránené porovnaním `String(canonical.id)`; nesmie sa doň zapísať `25/2`.
- **Mazanie 0164**: používa zložený kľúč `(kind, record_id)`, čo je správne; tombstone a zákaz reimportu sa nesmú prerobiť na zobrazované ID.
- **Globálne vyhľadávanie**: vstup `25` úmyselne hľadá viac modulov; nové `25/2` musí byť jednoznačné.
- **AdminRecordId/AdminShell/AdminRecordTable**: spoločné komponenty na zobrazenie a kopírovanie ID; tu je správne miesto na prezentáciu.
- **Pôvodné ID** je **trvalý interný kľúč**, `id/kód` je len jednoznačné čitateľné označenie.

## 9 kanonických databázových domén

| Doména | Kanonická tabuľka | Poznámka |
|---|---|---|
| Plemená | `managed_breeds` | FCI číslo nie je Admin ID |
| Služby | `directory_profiles` | 10 aktívnych + 2 staré kategórie; všetky zdieľajú sekvenciu |
| Podujatia | `managed_events` | Typ výstavy/semináre nemení skupinový kód |
| Články a novinky | `managed_articles` | Rubrika/sekcia nemení skupinový kód |
| Adopcie | `adoption_dogs` | Samostatná ID sekvencia |
| Stratené/nájdené | `lost_found_dog_reports` | Samostatná ID sekvencia |
| Organizácie/útulky | `help_organizations` | Samostatná ID sekvencia |
| Ostatná pomoc psom | `help_cases` | Viaceré podkategórie a staré typy |
| E-shopy | `managed_eshops` | Samostatná recenzná doména, pripojená v Notione |

**Mimo rozsahu označenia verejného profilu:** primárne kľúče technických tabuliek (Google Place ID, Notion page UUID, synchronizačné joby, auditné udalosti, kontaktné podnety, služby z katalógu, partnerské účty, R2 asset kľúče). Nemajú sa zamieňať za obsahové ID ani sa prečíslovať.

## Pevný, nemenný register kódov

**Jediný zdroj pravdy:** `lib/admin-display-id.ts`. Kódy 1–28 sú rezervované tam; vrátane fallback kódov pre staré neznáme kategórie. Žiadny nový kód nemožno znovu použiť.

| Kód | Druh |
|---:|---|
| 1 | Plemená |
| 2–11 | Aktívne kategórie služieb: veterinári, tréneri, kynologické kluby, chovateľské kluby, chovateľské stanice, salóny, hotely, venčenie, fyzioterapia, ďalšie |
| 12–13 | Staré kategórie služieb: psie školy a útulky/záchrana |
| 14 | Podujatia |
| 15 | Články a novinky |
| 16 | Adopcie |
| 17 | Stratené/nájdené psy |
| 18 | Organizácie |
| 19–25 | Kategórie pomoc psom vrátane historických |
| 26 | E-shopy |
| 27–28 | Záložné kódy pre neznáme staré kategórie služieb/pomoci |

**Príklad:** `25/1` plemeno, `25/2` veterinár, `25/14` podujatie, `25/15` článok. Pôvodný interný `id=25` sa nezmení.

## Osem krokov jedného PR

1. **Inventúra** kanonických tabuliek, zobrazení, ID-based routovania a Notion väzieb (tento audit).
2. **Centrálny register** všetkých čísiel kategórií, formátovanie, parser, rezerva pre staré typy.
3. **Editor a tabuľky** – zobrazenie/kopírovanie `25/2` bez zmeny interných ID.
4. **Globálne vyhľadávanie** – presný vstup s lomkou otvorí jeden typ; staré číselné hľadanie zostane zachované.
5. **Lokálne vyhľadávanie** – rozpoznanie `id/kód` v najdôležitejších admin zoznamoch bez prepisu SQL kľúčov.
6. **Notion kontrakt** – číselné pole `Psipedia ID` zachovať; nové *zobrazované ID* vypočítavať samostatne, bez vplyvu na LWW/Notion mapovania.
7. **Testy** – pokrytie jedinečnosti kódov, presného výberu ID, starých kategórií, zmeny kategórie, odstránení a šetrenia Notion identity.
8. **Nasadenie/rollout** – bez D1 migrácie; Notion computed schéma je pripravená, po merge overiť vzorky všetkých modulov a prípadné backfilly, až potom upravovať ďalšie integrácie.

## Notion

Súčasné Notion zdroje používajú `Psipedia ID` ako raw ID; je nebezpečné prepísať ho textom s lomkou. Pre viditeľnú hodnotu je najbezpečnejšie **nové odvodzované pole** `Zobrazované ID` (Notion formula nad existujúcim `Psipedia ID` a prípadne `Kategória`). Tak sa hodnota sama prepočíta bez ďalšieho webhooku a bez rizika cyklu Admin ↔ Notion.

**Nikdy** nezapisovať `Zobrazované ID` do `Psipedia ID`, `id` v D1, `notion_page_id` ani FCI čísla. Pridanie Notion formula polí je schémová úprava v Notione, nie GitHub merge – verifikovať všetky zdroje pred aktiváciou. Počas práce v GitHube nechávať Notion databázy nezmenené, až kým je parser/číselník schválený a otestovaný.

## Možné následné riziká

- Presun profilu z kategórie veterinári (kód 2) do trénerov (kód 3) **zmení zobrazované označenie**, ale nie D1 ID. Históriu starých označení nemožno garantovať bez osobitnej aliasovej tabuľky – ak budeme potrebovať trvalé aliasy, pridáme ju v samostatnom migračnom kroku.
- Staré čisté číslo `25` zostáva *nejednoznačné* pri globálnom hľadaní. Presný tvar `25/2` je určený práve na jednoznačné hľadanie.
- Kódy sa **nesmú prečíslovať** po použití v externých odkazoch/notifikáciách.
