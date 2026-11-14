# Psipedia.sk – Work vizuálny audit, druhá várka (14. 11. 2026)

**PR:** #1369 (Draft). **Rozsah:** iba admin UI; nič nebolo nasadené ani mergované.

Podkladom je šesť zistení z manuálneho desktopového auditu, ktorý poskytol majiteľ. Pri verifikácii neboli testované mutácie uloženia ani synchronizácia a zmeny ich nemenia.

## 1. P2 – kontextová lišta Tiptap
- Predtým: jediná sticky lišta existovala aj na záložkách bez textového editora a zaberala 2–3 riadky; sekčné scroll offsety sa mohli prekrývať.
- Teraz: `AdminTiptapArticleScope` montuje lištu len pre `article-basics` alebo `article-blocks`. Nástroje sú **v jednom horizontálne posúvateľnom riadku**; nie sú odstránené farby, citácie, odkazy, zoznamy ani Undo/Redo. Link/farba sa stále otvára v existujúcom paneli.
- `ResizeObserver` a `useLayoutEffect` merajú výšku pred animáciou presunu; nontext záložky majú 0px Tiptap príspevok v `scroll-margin-top`, textové záložky používajú aktuálne nameranú výšku.
- Test: `tests/e2e/admin-work-audit-round2.spec.ts` prechádza Nastavenia → Bloky → Úvod a obsah na 390/1440px; kontroluje 1 riadok a prekrytie.

## 2. P2 – nejednoznačné uloženie plemena
- Audit kódu `save(status)`: pri už publikovanom profile dve tlačidlá (`type=submit` pri `status=published`, a `save("published")`) vykonávali rovnaký spôsob uloženia. Nešlo o odlišnú aktualizáciu z Notionu.
- Teraz je pri publikovanom plemene **jediné hlavné „Uložiť zmeny“**, stav `published` zostáva nezmenený.
- Pri koncepte sú **Uložiť koncept** a **Publikovať profil**, pretože majú reálne odlišný stavový účinok.
- Pomocný text záložky Publikovanie vysvetľuje obe možnosti podľa reálneho stavu.
- **Notion import** je explicitne ďalšia akcia s pôvodným potvrdením pred nahradením neuložených údajov.
- Bez zmeny `expectedUpdatedAt`, `changedFieldKeys`, server payloadu, PUT/POST, kontrolovaných údajov alebo writebacku do Notionu.

## 3. P2 – preplnená spodná lišta plemena
- Bežný save je vizuálne hlavný; do rozbaľovacej ponuky **Ďalšie akcie** boli presunuté existujúce `AdminNotionProfileImportButton`, `AdminRecordLifecycleActions` a prechod na FCI.
- Neodstránili sa žiadne lifecycle ani deštruktívne rozhodnutia; pôvodné modály a potvrdenia zostávajú v tom istom komponente.
- Rozbaľovacia ponuka sa otvára nad sticky lištou s minimálne 44px dotykovou plochou.

## 4. P3 – moderácia profilových recenzií
- Nový čistý `lib/admin-profile-review-labels.ts` mení len zobrazované texty:
  - PENDING_REVIEW → Čaká na kontrolu
  - VISIBLE → Zverejnená
  - HIDDEN → Skrytá
  - REJECTED → Zamietnutá
  - AUTHOR_DELETED → Odstránená autorom
  - REMOVED → Odstránená moderátorom
  - DIRECTORY_PROFILE → Profil služby v adresári
  - chovatelske-stanice → Chovateľské stanice
- Zrozumiteľnejšie vysvetlenia, štítky rizika/nahlásení, typy profilov a detail/história.
- **Hodnoty `option.value`, status porovnania, API, filtrovacie query a výpočty ratingu sa nemenia.**

## 5. P3 – prehľad Recenzií a testov
- Zmenšené KPI, navigačné karty, medzery, fonty a odkazy; priamo viditeľné úkony: Nový test, Spravovať testy, Otvoriť moderáciu, Upraviť kategórie, Spravovať e-shopy.
- Vysvetlenia pravidiel a 5 e-shopových dimenzií sú v prístupných rozbaľovacích blokoch.
- Odstránené interné výrazy „canonical modul“, „review workflow“, opakované štatistiky v kartách.
- Všetky pôvodné route destination linky zachované.

## 6. P3 – hlavička a filtre plemien
- Editor používa `EditorWorkspace.hidePageTitle` len na tejto stránke, kde už titulok zobrazuje `AdminShell`; stav/description/close zostávajú viditeľné. Ostatné editory zostali bez zmeny.
- Vyhľadávanie má štandardný štítok nad poľom. Reset filtrov má zreteľné tlačidlo, jednotný focus a vypnuté stavy; žiadna zmena `changeFilter` ani selekcie/bulk.

## Testy a otvorené kontroly
- `tests/admin-work-audit-round2.test.mjs` – 5 statických kontraktov, read-only workflow.
- `tests/e2e/admin-work-audit-round2.spec.ts` – vizuálne správanie, labely, kontextová lišta a menu bez zmeny uložených dát.
- Zmenený starší test `tests/reviews-admin-hub.test.mjs` kontroluje čitateľný text namiesto už odstráneného technického copy.
- [ ] Aktuálne CI z HEAD, TypeScript a Playwright so zaznamenaným výsledkom.
- [ ] Manuálne screenshoty iOS/desktop pred merge vrátane scrollu s klávesnicou a otvorenými modalmi.
- [ ] Ďalší Work audit: ostatné záložky plemien, Šteniatka, Sekcie, Psie meniny a Adresár.

**Stav:** implementované v PR #1369; **bez auto-merge**. Dizajnová oprava neznamená potvrdenie funkčného uloženia, ktoré nebolo testované.
