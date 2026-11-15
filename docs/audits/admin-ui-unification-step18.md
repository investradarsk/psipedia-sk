# Psipedia.sk — krok 18/18: Záverečný audit jednotnej administrácie

**Dátum kontroly:** 14. 11. 2026  
**PR:** #1369, `chore/admin-visual-unification-step2-audit-20261114`  
**Základ pre audit:** HEAD `d6886e02edc71c214d49b89d018c9d40d2b6cb68` (krok 17); tento krok dopĺňa iba finálny source test, workflow a dokumentáciu.  
**Kritérium:** **NEPRIPRAVENÉ NA MERGE** bez zosúladenia a reálnych vizuálnych testov.

## 1. Rozsah inventára a dosiahnutý stav

Inventár `docs/audits/admin-ui-unification-inventory.json` obsahuje **29 destinácií** v **7 skupinách**:
Prehľad, Obsah, Adresár, Komunita, Automatizácie, Kvalita dát, Nastavenia.

- **28** destinácií existuje v kanonickom navigačnom registri kontrolovanej vetvy.
- **1** dodatočná destinácia `/admin/nastavenia/statistiky` pribudla súbežne na `main` a je už pridaná v inventári ako krok 16; do staršej vetvy #1369 ešte nebola prenesená.
- Implementačné kroky **2–17/18** majú source dokumentáciu, jednotné admin tokeny, opt-in moduly a priradené read-only kontrakty.
- **Knip** má samostatný Draft PR **#1368**; úspešný audit run `43628661039` je snapshot iného commitu. V kroku 17 bol odstránený iba jeden overený samostatný wrapper.

## 2. Audit podľa oblasti

| Oblasť | Čo bolo z kódu overené | Čo zostáva nedokázané |
| --- | --- | --- |
| Typografia | Základná rodina písma `--admin-ui-font-family` a veľkosti z admin tokenov; oddelené serifové fonty iba pre zámerné náhľady článku | Finálne vykreslenie každého popisu, modálneho okna a šablóny |
| Karty a formuláre | 44px kanonické ovládanie, spoločný padding/radius a V4 editor na úrovni zdrojov | Fyzické porovnanie obrazoviek s článkovým editorom |
| Admin shell a navigácia | Spoločný `[data-admin-workspace]`, sedem skupín, interné menu a breadcrumbs | Priebeh otvorenia menu, soft keyboard a reálne gesto Safari |
| Obsah a adresár | Source zmeny krokov 9–12, tabuľky, filtre, editor sekcie/profilu | Prihlásené prázdne/plné stavy a extrémne dlhé názvy |
| Komunita a automatizácie | Source zmeny 13–14, koncepčne oddelené mutačné handlery | End-to-end workflowy, práva, testované reset/STOP v izolovanom fixture |
| Kvalita, mapy a nástroje | Aktuálny/Nájdený údaj, Google budget warning, mapové filtre, admin-only styling | Dynamický viewport a lokálne platené operácie bez skutočných API volaní |
| Nastavenia, vizuálna knižnica, monetizácia, právne | Source zmeny kroku 16, zachované POST/PATCH/PUT handlery | Všetky kombinácie dlhého obsahu a zbalených panelov |

## 3. Bezpečnosť mobilu

- Existujú izolované **Playwright E2E testy** pre 320, 375, 390, 430, 768 a 1440px; používajú kontrolu `document.documentElement.scrollWidth` vs `clientWidth`.
- Kľúčové nové admin CSS moduly pre kroky 13, 15 a 16 nie sú maskované `overflow-x: hidden` na dokumente.
- Horizontálny scroll širokých tabuliek a kategóriových pásov má zostať **lokálny**; nesmie sa presúvať celý dokument.
- Screenshot engine projektu `PR Visual Evidence` používa lokálne/izolované D1, pred/po/diff, 1440/390/320px a maximálne štyri trasy.
- **CI screenshoty, autenticita obrazoviek a skutočné iOS Safari nie sú potvrdené**; existencia E2E súboru nie je dôkaz úspešného testu.

## 4. Synchronizácia s main — tvrdý blokátor

Kontrola `compare_commits` pri začiatku 18/18 ukázala `status=diverged`, vetva #1369 bola **272 commitov za main**, `mergeable=false` a PR zostal Draft.

Z **178 zmenených súborov** PR #1369 a **103 upstream súborov** sa menovite pretínajú **2 súbory** (intersekcia názvov nie je dôkaz o počte textových merge konfliktov):

1. `app/admin/nastavenia/page.tsx`: aktuálny `main` pridal kartu **Štatistiky návštevnosti** s odkazom `/admin/nastavenia/statistiky`. Vetva PR zachováva len kompaktnejšiu Notion/PWA kartu. Pri merge **zachovať nový odkaz aj nový kompaktný vizuál**. Upstream má samostatnú route a dátovú logiku.
2. `components/admin-organization-editor.tsx`: na `main` bol odstránený vstup **Registračné číslo**. Staršia vetva ho ešte zobrazuje. Pri merge **nevrátiť odstránené pole**, ale zachovať nové vizuálne označenie `data-admin-content-module="organizations-editor"` a nové názvy/štítky.

Konflikty sú **známe, nie vyriešené**. Žiadny rebase/force push/merge sa nerobil, aby sa neprepísali paralelné úpravy. Reconcile musí vychádzať z presného nového `main` a skontrolovať následnú full diff.

## 5. Testovanie na tomto kroku

- `tests/admin-final-visual-step18.test.mjs`: **nový source-only kontrakt**: 29-route inventár, sedem skupín, admin-only CSS importy, typografia, mobilné kontrolné šírky, zachovanie kritických handlerov a odstráneného wrappera.
- `.github/workflows/admin-typography-contracts.yml`: automaticky spúšťa source test spolu s predchádzajúcimi testami krokov 3–17.
- Súčasný stav: **CI posledného HEAD nepotvrdené**, rovnako TypeScript, izolované Playwright, screenshoty, Safari a plný build. V predchádzajúcej kontrole na kroku 17 API nevrátilo žiadne priradené workflow runs ani status checks pre presné SHA. To nie je úspešný test.
- Source-only kontrola nie je náhradou za browser a nikdy neoveruje správanie reálnych API či D1.

## 6. Finálne rozhodnutie

**Kroky plánovanej implementácie a source auditu: 18/18 spracované.**  
**Produkčná pripravenosť: NIE. PR #1369 nemergovať.**

Akceptačné podmienky pred merge:

1. Zosúladiť #1369 s najnovším `main`, manuálne vyriešiť **Štatistiky návštevnosti** a **Registračné číslo** bez regresií; porovnať celý diff.
2. Presný HEAD po reconciliácii: `node --test` všetky admin source kontrakty, `tsc` / build, existujúce relevantné bezpečné testy.
3. `PR Visual Evidence` PNG **Pred / Po / Rozdiel** na zvolených obrazovkách, plus postupne zvyšné sekcie v admin fixture. Overiť 1440/390/320px, dlhé názvy, prázdne a naplnené stavy.
4. Izolovaný Playwright na presnom HEAD, 320/375/390/430px, klávesnica a reálne iOS Safari, bez zmeny produkčných údajov.
5. Re-scan Knip v aktuálnom stave (po zlúčení/prevzatí konfigurácie #1368), zatiaľ neodstraňovať ďalších 31 reportovaných súborov.
6. Výslovný súhlas vlastníka pred merge a nasadením.

**Žiadne produkčné úpravy, migrácie, schvaľovanie obsahu, platené volania ani merge.**


---

## Aktualizácia po zosúladení s main (14. 11. 2026)

**Predchádzajúci stav `mergeable=false` a 272 commitov za `main` uvedený vyššie je už historický.**
Konflikty sa vyriešili, skutočný GitHub merge commit `7d7ef6ac67826fb14206cc7f3ff1850450414695` bol fast-forward prenesený do vetvy PR #1369 a naň boli vrátené úpravy. Overenie po aktualizácii vrátilo `mergeable=true`, `behind=0` a stále `Draft` bez produkčného merge.

Nová karta **Štatistiky návštevnosti** je zachovaná; odstránené **Registračné číslo** sa nevrátilo. Knip tooling bol integrovaný z PR #1368 do #1369 a #1368 bol zatvorený bez merge. Pridaný `tests/admin-main-reconciliation.test.mjs`.

**Čo zostáva:** posledný HEAD CI, TypeScript, Playwright, mobilné screenshoty a Safari sa musia vyhodnotiť pred schválením merge. Kompletný postup: `docs/audits/admin-main-reconciliation-20261114.md`.
