# Psipedia.sk – Admin UI Unification, krok 4/18: kompaktné rozloženie

**Dátum:** 14. 11. 2026  
**Referenčný vzhľad:** súčasný editor článkov a jeho spoločný `EditorWorkspace`.  
**Vetva / PR:** `chore/admin-visual-unification-step2-audit-20261114` / #1369.  
**Rozsah:** iba CSS prezentácia, Node kontraktný test a rozšírenie už existujúceho read-only CI workflow. Nevytvárať ďalší dizajnový systém.

## Audit pred implementáciou

Na `main` už funguje Admin V3 Compact a zdieľané formuláre V4, ale jednotlivé zdroje definujú rozdielne hodnoty. Konkrétne:
- `app/admin/admin-workspace.css` má `--admin-v3-card-padding: 12px` a `--admin-v3-compact-gap: 10px`.
- `app/admin/admin-editorial-foundation.css` mala `--admin-ui-panel-padding: 0.85rem` a zvlášť desktop `0.9rem` / mobil `0.7rem`.
- `app/admin/admin-unified-forms.css` mala pre formulárové karty `padding: clamp(0.875rem, 1.5vw, 1.15rem)`, mobil `0.8rem`, a pole-grid `gap: 14px 16px`.
- `components/admin-editor-workspace.module.css` používa miestne hodnoty .55/.65/.75rem.
- `components/admin-workspace-dashboard.module.css` mala KPI karty s `min-height:142px` a `padding:13px 14px`, panelové karty s ďalšou geometriou.
- `components/admin-shell.module.css` už rieši pevné mobilné menu 320px; nie je dôvod meniť jeho funkciu ani znižovať výšku topbaru.

**Nejde o vizuálne potvrdené defekty.** Úvodný audit je založený na skutočných zdrojových hodnotách. Súbežný Work audit administrácie môže následne priniesť potvrdené vizuálne nálezy.

## Zmeny kroku 4

**Kanonické tokeny `[data-admin-workspace]`:**
- `--admin-ui-section-gap: 0.625rem` (10px pri 16px root);
- `--admin-ui-editor-field-gap: 0.5rem` (8px);
- `--admin-ui-panel-padding: 0.75rem` (12px na desktope);
- mobil do 820px: `--admin-ui-panel-padding: 0.65rem` (~10.4px);
- existujúce `--admin-ui-space-xs/sm/md` a `--admin-ui-radius` ostávajú spoločným zdrojom.

**Integrácia:**
- `admin-workspace.css`: historické V3 `--admin-v3-card-padding` / `--admin-v3-compact-gap` sú aliases na kanonické tokeny; kompatibilné staršie komponenty teda dostávajú rovnakú hustotu. Toolbary a filtrovanie používajú spoločný gap.
- `admin-unified-forms.css`: zjednotený gap V4 field-grid; jediná geometria kariet pre profily aj Help/Adopcie/Organizácie; mobile karta používa rovnaký token, nepremieňa select/checkbox/upload.
- `admin-editorial-foundation.css`: spoločný padding všeobecných kariet a mobilná odpoveď; nezavádza globálny `overflow-x:hidden`, `position:fixed` ani sticky offset.
- `admin-editor-workspace.module.css`: hlavička, navigácia, panelové medzery, action bar a mobilné odsadenie používajú tú istú škálu; safe-area a jedno dokumentové skrolovanie v page-mode zostáva.
- `admin-workspace-dashboard.module.css`: KPI/panelové karty a fronta sú kompaktnejšie. Minimálna výška KPI je z 142px na 132px (obsah ju môže zväčšiť), odkazy fronty 60→56px, stále aspoň 44px. Žiadna hodnota ani stav nie je skrytý.
- `admin-shell.module.css`: padding vonkajšej pracovnej plochy používa spoločné tokeny; mobilný menu trigger, header výšky a z-indexy ostávajú pôvodné.

## Čo sa zámerne nemenilo
- Verejná stránka, rich-text obsah článkov, farby a písma náhľadu publikovaného článku.
- Google Places/Mapy, Facebook kalendár, editor fotiek, výrezy, uploader, vlastné layouty tabuliek.
- DOM štruktúra a jednotlivé React editory, routy, API payloady, ukladanie do D1, Notion sync, partner permissions a všetky produkčné dáta.
- Nenahrádza sa problém posúvania skrytým overflow; cielený responsívny test pre takéto problémy patrí najmä do krokov 6–7 a 18.

## Overenie

**Nový statický test:** `node --test tests/admin-density-step4.test.mjs`  
**Spoločný read-only CI:** `.github/workflows/admin-typography-contracts.yml` – testy kroku 3 a 4 plus register 28 sekcií.

- [x] Úpravy sú obmedzené na administrátorské CSS a testy, bez runtime dátového kódu.
- [x] Spoločná tokenová škála je v jednom owner súbore, staré V3 aliasy zostávajú kompatibilné.
- [ ] Aktuálny CI na presnom HEAD a regresné testy po ďalších commitoch.
- [ ] Screenshoty z presného PR HEAD pre /admin, články, plemená a služby na 1440/768/430/390/375/320px.
- [ ] Zistenia paralelného Work auditu – zapracovať po doručení, nezapisovať domnelé defekty.
- [ ] Pred merge overiť mobile document scroll, sticky bar a otvorenie soft klávesnice.

**Status:** implementačný krok vo Draft PR #1369, bez merge/deploy. Browser vizuál a správanie mobilu nie sú týmto statickým testom potvrdené.

**Nasleduje krok 5/18:** jednotné tlačidlá, vzhľad formulárov, ovládacie prvky a chybové/stavové hlásenia, bez dotyku business logiky.
