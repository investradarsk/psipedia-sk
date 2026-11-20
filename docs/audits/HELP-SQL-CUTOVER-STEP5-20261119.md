# Pomoc psom – bezpečné odpojenie duplicitných historických public read ciest (krok 5/6)

Stav: **kód pripravený v Draft PR #1463. Nie je mergnutý, nenasadený, žiadna produkčná D1/Notion operácia sa nevykonala.**

## Čo sa v skutočnosti migruje

Pomoc psom už má kanonické SQL vlastníctvo:
- `help_cases`: iba všeobecná Pomoc (dočasná opatera, zbierky, dobrovoľníctvo, urgentné prípady).
- `help_organizations`: organizácie/útulky.
- `adoption_dogs`: adopcie.
- `lost_found_dog_reports`: stratené a nájdené psy podľa `type=LOST/FOUND`.

Historické kategórie `help_cases.category IN ('adopcia','utulky','stratene-a-najdene')` sú staré záznamy **už v SQL**, nie živé súborové JSON úložisko. Bez overeného mapovania ich nesmieme `DELETE`, automaticky presmerovať podľa slugu alebo prepísať pomocou snapshotu. `source_data_json`, `gallery_json`, `seo_json`, image-display JSON a pod. zostávajú legálnymi **technickými SQL stĺpcami**; nie je dôvod ich zmazať podľa názvu.

## Bezpečné odstránenie duplicitných runtime čítaní

| Povrch | Zmena | Dopad |
|---|---|---|
| `lib/help-store.ts` → `getPublishedHelpCases()` | Pri explicitnom `stratene-a-najdene` nečíta historický generic Help; spolu s `adopcia` vracia prázdny výsledok | Listing patrí výlučne dedikovaným SQL reportom |
| `lib/help-store.ts` → implicitný všeobecný listing | Vylúči aj `stratene-a-najdene` z `help_cases` (predtým len adopcie a útulky) | Deduplikácia výsledkov |
| `lib/help-store.ts` → homepage highlights a zvýraznené položky | Rovnaký filter troch historických kategórií | Žiadna stará lost-found karta medzi všeobecnými výzvami |
| `lib/visual-library-dynamic-urls.ts` | SQL aj `localHref` vylučujú historický lost-found generic Help | Inventár nevracia falošné generic URL z dedikovaného registru |
| `app/sitemap.ts` | `representedElsewhere` zahŕňa aj `stratene-a-najdene` | Žiadne duplicitné legacy lost-found URL vo všeobecnej sitemape; kanonické LOST/FOUND URL spravuje samostatná sekcia |

Tieto úpravy **nemenia SQL obsah ani kanonické listy**. Zostávajú dedikované adoption, shelter/organization a lost-found verejné stránky, Admin aj partnerské editory.

## Čo sa zámerne ešte NEODSTRÁNILO

- **Historické URL detailov:** `app/pomoc-psom/[category]/[slug]/page.tsx` môže zatiaľ stále načítať historické `help_cases` detaily. Staré adresy sa nesmú zmeniť na 404, kým neoveríme zhodu poľa, identitu `LOST` versus `FOUND`, slug a prípadné preklopenie/redirect. Dlhodobý cieľ: presmerovať iba verifikované 1:1 match záznamy na kanonickú route, alebo ponechať existujúce nepreklopené prípady podľa explicitného rozhodnutia.
- **Historické SQL dáta:** žiadne `DROP`, `DELETE`, `TRUNCATE`, prepísanie `updated_at`, migrácia čísla 0171/0172/0173/0174 alebo nové D1 tabuľky.
- **Technické štruktúry:** `help_organizations.source_data_json` sa aktívne číta kvôli galérii (`readProfileGallery`); `adoption_dogs.gallery_json`, `lost_found_dog_reports.gallery_json`, SEO a obrázkové zobrazenie ostávajú, kým existujú aktívni spotrebitelia.
- **Notion sync väzby:** `notion_agenda_sync` sa nemení; prípadné staré out-of-domain mapovania sú blokátory, nie objekty na automatické vymazanie.

## Nová kontrola rizikových historických stratených/nájdených hlásení

`lib/help-sql-reviewed-backfill.mjs` exportuje `helpLegacyLostFoundCoverageQuery()`; vracia iba agregáty pre staré `help_cases.category='stratene-a-najdene'`:

- `legacy_total`: historické záznamy,
- `no_slug_match`: žiadne dedikované hlásenie s rovnakým slugom,
- `needs_type_review`: práve jeden SQL slug kandidát, ale **stále treba overiť typ LOST/FOUND a obsah**,
- `ambiguous_type_match`: viac kandidátov s rovnakým slugom, nedá sa bezpečne rozhodnúť.

Existujúca chránená read-only GitHub Action `Psipedia – D1 canonical inventory (Services, Help, Events)` pridáva `helpLegacyLostFoundCoverage` do agregovaného `report.json`. **Nie je to automatická migrácia ani dôkaz parity.** Nezobrazuje identifikátory ani súkromné údaje. Čas, zmena partnera ani stav `Odkontrolované` sa bez reálneho E2E nedajú iba z agregátu dokázať.

## Testy

`tests/help-sql-legacy-public-cutover-step5.test.mjs` pokrýva skutočný SQLite filter historických kategórií, kanonické URL, zachovanie starých deep linkov a technických JSON hodnôt, audit LOST/FOUND ambiguity vrátane prázdnej databázy a nevyexportovanie kontaktov.

Spúšťanie:
- `npm run test:help-sql-cutover-step5`, zapojené do `npm run test:foundation`;
- existujúci bez-závislostný inventory CI workflow vykonáva nový test automaticky;
- upravené historické očakávania v `tests/help-organizations-foundation.test.mjs` a `tests/adoption-sitemap-integration.test.mjs`.

## Blokátory pre krok 6/6 (produkcia)

1. Spustiť čisto **read-only produkčný** inventár na aktuálnom main (chránený workflow, žiadne D1 zápisy) a potvrdiť všetky nejednoznačné legacy prípady aj aktuálnu schému.
2. Potvrdiť presnú zhodu public/Admin/Notion/partner pre reprezentatívne záznamy a získať explicitné rozhodnutie k historickým detailom, ktoré nemajú kanonický ekvivalent.
3. Pred nasadením týchto public čítacích zmien zhodnotiť SEO dopad: staré URL sa nezmažú, ale historické lost-found URL už nebudú propagované cez všeobecný sitemap/URL inventory. **Ak sú tam unikátne aktuálne publikované prípady, cutover je blokovaný, kým nebude zaistená ich kanonická discoverability.**
4. Potvrdiť nemigrované/zamknuté profily, zámerne prázdne hodnoty, aktivované partner vlastníctvo, párovanie Notion a čisté CI na aktuálnej vetve.
5. Produkčná záloha a rollback pripravené v chránenom kroku 6; žiadny automatický destructive cleanup po merge.

**Stav 5/6:** duplicitné legacy public read/list/sitemap cesty sú v kóde odpojené, súvvisiace príklady sú testované. **Nie je to potvrdenie finálneho produkčného JSON cleanupu** – ten bezpečne nesmie prebehnúť bez parity a overenia starých permalinkov.
