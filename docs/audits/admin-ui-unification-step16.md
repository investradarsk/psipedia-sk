# Psipedia.sk – krok 16/18: Nastavenia, komponenty, šablóny, monetizácia, právne a navigácia

**Dátum:** 14. 11. 2026  
**PR:** #1369, Draft. **Bez merge, deployu, databázových zmien, platených API volaní či publikovania.**

## Overenie pred zmenami

- `/admin/nastavenia` používal jednu kartu s inline štýlmi mimo Admin V3 a samostatnú PWA mriežku s veľkými rozostupmi. `/admin/nastavenia/notion` má pôvodnú špecifickú dvojstĺpcovú navigáciu a tabuľku priorít; ich logika sa nemení.
- `/admin/komponenty` zahŕňa vizuálnu knižnicu, bannery, filtre, zdrojové použitie, návrhové editory a technický register. Knižnica mala samostatné hustoty kariet, veľké intro a v registri inline štýly. Živé verejné náhľady **nesmú zdediť nové globálne štýly**.
- `/admin/navigacia` umožňuje meniť, presúvať, zobrazovať/skryť a ukladať položky. Editor používal tri stĺpce a rozličné výšky tlačidiel; publikačné funkcie ostávajú.
- `/admin/monetizacia` obsahuje zoznam placementov, kampane a promoted entity, POST vytvorenie draftov a PATCH aktiváciu/pozastavenie/archiváciu. Používa legacy `admin-card` / `admin-form-grid` triedy. Opravené iba prezentačne.
- `/admin/pravne` má odlišne veľkú stavovú kartu, sticky panel registrácií a formulár s explicitným PUT ukladania. Kontroly sú stále zobrazené bez zásahu do pravidiel.
- Kanonický Admin V3 a jednotné formuláre V4 už existujú; netreba nový UI framework. Mobil sa nesmie posúvať vodorovne ako celý dokument.

## Implementované

1. Pridaný `app/admin/admin-settings-step16.css` s explicitnými opt-in modulmi, importovaný iba cez `app/admin/layout.tsx`. Všetky selektory sú pod `[data-admin-workspace]`. Úpravy zachovávajú zdieľané admin tokeny.
2. `application-settings`: Notion integračná karta používa klasický admin panel bez inline štýlov, PWA statusy a push action bar majú kompaktnejšie odsadenia, čitateľné zalamovanie a 44px akcie.
3. `notion-settings`: kompaktné sekcie, lokálna vodorovne posúvateľná tabuľka, 44px tlačidlá a 16px vstupy v mobile. **Bez zmeny priorít, obojsmerného prenosu, fetch/post či potvrdení.**
4. `visual-library`: menšie intro a informačné karty, jednotný panel bannerov a filtrov, interný katalóg na mobile ako jeden stĺpec; pás kategórií má **iba lokálny** horizontálny scroll. Vizuálne renderer komponentov, zobrazenie použitia aj návrhové editory ostali bezo zmeny. Technický register je naďalej voliteľný a zbalený.
5. `navigation-settings`: kompaktnejšie riadky, 44px akcie, normálne zalamovanie názvov/URL, responzívne stĺpce a mobilný wrap ovládania. Zachované drag/drop, šípky, automatické podmenu, potvrdzovanie mazania a ukladanie.
6. `monetization-settings`: klasické admin karty, kompaktné kampane, dvojstĺpcový desktopový formulár a jednostĺpcový mobilný formulár; zachované checkboxy, placementy, statusy a API volania.
7. `legal-settings`: menšia pripravenostná karta, rovnomerné sekcie, bez pevnej minimálnej šírky v mobilnom stĺpci, pôvodné registrácie a stavové odkazy sa nezmenili.

## Konkrétne súbory

- Routes: `app/admin/nastavenia/page.tsx`, `app/admin/nastavenia/notion/page.tsx`, `app/admin/komponenty/page.tsx`, `app/admin/navigacia/page.tsx`, `app/admin/monetizacia/page.tsx`, `app/admin/pravne/page.tsx`.
- CSS modules: `components/admin-pwa.module.css`, `components/admin-notion-field-settings.module.css`, `components/admin-visual-library.module.css`, `components/admin-component-registry.module.css`.
- Admin style entry: `app/admin/admin-settings-step16.css`, `app/admin/layout.tsx`.

## Testy

- `tests/admin-settings-step16.test.mjs`: read-only source kontrakty pre šesť modulov, prítomnosť kanonických handlerov a admin-only CSS scope.
- `tests/e2e/admin-settings-step16.spec.ts`: read-only izolované localhost E2E, 320/375/390/430/768/1440px a kontrola document overflow. Nespúšťa push, Notion prenosy, úpravy navigácie, monetizáciu ani zápisy právnych údajov.
- `.github/workflows/admin-typography-contracts.yml`: relevantné súbory a source test zahrnuté.

**Nerozbehol sa tu lokálny produkčný build ani ručný mobilný prehliadač.** GitHub CI, Playwright v izolovanom prostredí a vizuálne screenshoty presného HEAD treba overiť pred merge.

## Pred merge

- [ ] Úplné zelené relevantné CI/testy na poslednom HEAD (nepovažovať skipped za passed).
- [ ] PR Visual Evidence: 390px mobil a 1440px desktop, záznam HEAD SHA, screenshoty kritických stavov. `VISUAL_REVIEW_ROUTES` v PR používa vzorku najviac štyroch trás; **všetkých šesť** je pokrytých samostatnými E2E.
- [ ] iOS Safari s klávesnicou, dlhé texty, zapnuté a vypnuté PWA/Notion možnosti, veľký register a viaceré kampane.
- [ ] Zosúladenie dlhšie žijúcej vetvy #1369 s najnovším `main`, bez prepísania paralelných PR.
- [ ] Výslovné schválenie vlastníka pred merge.

**Nasleduje 17/18:** Posúdiť Knip nálezy a až po individuálnom overení bezpečne odstrániť potvrdený nepoužívaný kód / zastarané štýly.
