# Psipedia.sk — krok 10/18: Adresár, Služby a profilový editor

**PR:** #1369 (Draft), vetva `chore/admin-visual-unification-step2-audit-20261114`. **Nič nemergované ani nasadené.**

## Zdrojový audit

- `/admin/sluzby-pre-psov` a `/admin/adresar` používajú rovnaké `AdminDirectoryCategoryNav`, `AdminDirectoryDashboard`, serverový filter a stránkovanie. Nie je vhodné vytvárať druhú kategóriovú navigáciu alebo meniť `GET` parametre.
- Kategórie sa na úzkych mobiloch zalamovali do veľkého počtu riadkov, kategóriové odkazy mali iba 35px minimálnu výšku a katalóg/technické nástroje zaberali plnú šírku stránky.
- Formulárový editor `AdminDirectoryEditor` už má `AdminSharedEditorNavigation`, opt-in `data-admin-form-system="v4"`, SEO drawer, Notion import a ochranu neuložených zmien.
- Pri **publikovanom kanonickom profile** boli dve vizuálne odlišné možnosti uloženia, ktoré spúšťali rovnaký `save("published")`: neutrálne `type=submit` pri `status=published && !notionDraft` a primárne tlačidlo `Uložiť zmeny`. Pri konceptoch ide naopak o reálne odlišné uloženie vs. publikovanie.
- Editorová pomocná horná lišta bola sticky nad sekciami. Spolu s `AdminSharedEditorNavigation` mohla zbytočne zväčšovať pevný vrchný blok.
- Akcie v zozname boli prevažne textové linky bez jednotnej 44px plochy.
- Katalóg Services V3 už používal virtualizovaný zoznam, inline edit a vlastné mobilné filtre; cieľom je zjednotiť len prezentačné pravidlá bez zásahu do týchto mechanizmov.

## Implementované

1. **Kategórie a modulová navigácia**:
   - `AdminDirectoryModuleNav` a `AdminDirectoryCategoryNav` majú minimálne 44px klikateľné plochy, jednotné farby/radius/padding a focus štýly.
   - Na mobile sú kategórie v jednom **lokálne horizontálne posúvateľnom riadku**; stránka samotná sa neposúva do strán.
   - Pôvodné adresy `/admin/sluzby-pre-psov?category=...` a aktuálny stav `aria-current="page"` zostávajú rovnaké.
   - Katalóg služieb a Návrhy úprav sú v rozbaliteľnej sekcii **Ďalšie nástroje adresára**. Obe adresy ostávajú dostupné.
2. **Zoznam profilov**:
   - Kompaktnejší filter formulár, 44px zvýraznené Akcie a AI kontrola, prístupné focus/disabled štýly.
   - `AdminRecordTable`, GET filtre, inline editácia, hromadné akcie, správa overenia, kategórie, archivácia s existujúcim potvrdením a stránkovanie sa nemenia.
   - Rozšírené prezentačné označenia `data-admin-directory-overview` / `data-admin-directory-list`; kratší pomocný text.
3. **Editor profilu**:
   - Publikovaný kanonický profil ponúka **jediné hlavné „Uložiť zmeny“**; odstránená len duplicitná neutrálna akcia, nie handler ani uloženie.
   - Koncept zostáva s **Uložiť koncept** a **Publikovať profil**. Gemini/Notion drafty si zachovávajú samostatnú logiku a zákaz nesprávneho publikovania.
   - `Aktualizovať z Notionu` a `Pokročilé a SEO` sú vo vizuálne sekundárnej rozbaľovacej ponuke **Ďalšie nástroje**, ktorá zachováva pôvodné komponenty, ich stavy a potvrdenia.
   - Pomocná vrchná lišta neprekrýva sekcie cez sticky pozíciu; pri scrollovaní zostáva pevná len hlavná admin navigácia. Obľúbený `AdminSharedEditorNavigation` a section-pager ostávajú.
   - Layout a polia preberajú spoločné tokeny článkového editora, s 44px ovládacími plochami.
4. **Katalóg služieb V3**:
   - Používa rovnaké prezentačné označenia filtrovania `data-admin-list-filters`, `data-admin-list-advanced`, `data-admin-list-results`.
   - Kompaktnejší desktop/mobile panel, popisy a rozostupy. Na mobile inputy 16px.
   - `useVirtualizer`, modely Services V3, inline úpravy, statusy, Notion mirror a bezpečné potvrdenia sa nemenia.

## Výslovné zachovanie dátového správania

Bez zmien API, D1/R2, Notion, oprávnení, archivačných potvrdení, verejných profilov, SEO payloadov, vytvárania kategórií, publikovania, sync pravidiel, `expectedUpdatedAt` a ochrany neuložených zmien.

## Testy

- `tests/admin-directory-visual-step10.test.mjs`: read-only kontrakty kategórií, filtrov, editorového uloženia, Notion/SEO nástrojov a Services V3.
- `tests/e2e/admin-directory-visual-step10.spec.ts`: izolované localhost Playwright viewporty 320/390/768/1440px; kategórie, dropdown nástrojov, form filtre, editor a katalóg. Bez odoslania zápisových formulárov.
- `.github/workflows/admin-typography-contracts.yml` zapojený zdrojový test a zmenené CSS/TSX súbory.

**Otvorené pred merge:**
- [ ] Potvrdiť CI/TypeScript/Playwright z posledného HEAD a vizuálne snímky mobilov/tabletov.
- [ ] Spracovať nové Work audit výstupy, ak sa zamerajú na Adresár.
- [ ] Zosúladiť PR s najnovším `main` a reálne overiť konflikty.
- [ ] Výslovné schválenie majiteľa.

## Samostatný PR #1368

PR #1368 (`chore(admin): Knip read-only audit — krok 1/18`) má iba 5 súborov: `knip.json`, `package.json`, `.github/workflows/knip-audit.yml`, `.gitignore`, dokumentáciu. **Žiadne mazané súbory alebo produkčné zmeny**. Jeho Knip workflow na `ff9cabce` skončil zelený. Nie je duplikátom hlavného vizuálneho PR #1369 a poskytne podklady pre neskorší krok **17/18**. Preto zostáva otvorený ako Draft (bez merge).

**Nasleduje krok 11/18:** Podujatia.
