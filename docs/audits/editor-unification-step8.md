# Psipedia.sk – krok 8/18: jednotný editor článkov

**Stav:** implementované v otvorenom PR #1222. Bez produkčného nasadenia a bez dátových migrácií.

## Čo sa mení

- Kanonický `AdminArticleEditor` používa `EditorWorkspace sectionMode="switch"` vytvorený v kroku 7. Zobrazí **presne jednu z deviatich sekcií**, na PC v bočnej navigácii a na mobile v rozbaľovacom výbere.
- Logické poradie: Základné údaje → Úvod a obsah → Bloky článku → Fotografie → Zaradenie a adresa → Prepojené plemená → Autor → Publikovanie → SEO a zdieľanie. Súčasťou formulára sú tlačidlá Predchádzajúca / Ďalšia.
- Sekcie zostávajú **namontované** a sú len `hidden`, takže rozpracovaný Lexical, blokový editor, vyhľadávanie plemien, kalendár a Facebook ovládanie nestrácajú svoj React stav pri prepínaní.
- Zachováva sa **živý náhľad** s možnosťou preskočiť do príslušnej sekcie (titulok, obsah alebo konkrétny blok) a editor výrezu fotografie.
- Keď sa formulár prepína po sekciách, natívna `required` validácia nemôže fokusovať pole v skrytej sekcii. Preto formulár používa `noValidate` a existujúce požiadavky pri stlačení `Uložiť` kontroluje explicitne pre názov, perex, úvod, slug a podsekciu. Chybové hlásenie a odpovedajúca sekcia sa zobrazia okamžite. Oddelené tlačidlá Publikovať/Naplánovať majú nezmenenú API a QA logiku.
- Pri chybách z publikačnej kontroly servera sa editor prepne na skutočné miesto problému: titulok/perex → Základ, úvod → Úvod, obsahový blok alebo zdroj → Bloky, iné publikačné podmienky → Publikovanie.
- Hlásenia o výsledku uloženia aj QA problémy sa zobrazujú nad formulárom, nie skryté na konci dlhej stránky; pôvodný `focusResult` stále funguje.
- Náhľad, fotografie, autor, témy, plemená, SEO, Facebook grafika/kalendár, rich text, video a bloky zostávajú v pôvodných komponentoch.
- `admin-content-editor-v3.module.css` obsahuje scoping len pre článkový single-section režim, responzívny pager a jedno dokumentové rolovanie.

## Zásadne zachované

- Existujúce `POST/PUT /api/admin/articles`, pôvodný JSON payload, `expectedUpdatedAt` a kontrola súbežných úprav.
- Publikovanie, plánovanie, stiahnutie, serverová QA brána, oprávnenia a dátumy.
- Pôvodné formáty dokumentov Lexical a článkových blokov; obrázky, ALT, caption, credit a nastavenie zobrazenia.
- Kontakty a profil autora; redakčné zaradenie a tematické kategórie.
- Facebook koncepty a schvaľovanie vrátane globálneho STOP, Notion synchronizácia.
- Nie sú pridané ani odstránené dátové polia, API, D1 migrácie ani Notion webhooky.
- Ostatné editory sú zatiaľ v pôvodnom scroll režime (okrem plemien z kroku 7).

## Overovanie

- `tests/admin-editor-article-single-section-step8.test.mjs`: 9 sekcií, hodnoty, validácia, náhľad, rozhranie API a izolácia od ostatných editorov.
- `tests/e2e/article-admin-editor.spec.ts`: aktualizované existujúce scenáre tak, aby sa pred interakciou vybrala príslušná sekcia (autor, foto, obsah, bloky, kalendár, QA, bezpečnosť); nový test zachovania Lexical hodnoty pri prepínaní a pri nevyplnenom povinnom poli.
- Akceptácia pred merge: desktop 1440/1280 a mobil 430/390/320 px, jedna viditeľná sekcia, bez vnoreného rolovania a horizontálneho pretekania; uloženie konceptu, naplánovanie, publikovanie, stiahnutie, draft recovery, obrázok, autor a bloky.
- **Nemergať**, pokiaľ zlyhávajú CI/E2E. GitHub kontraktné testy nenahrádzajú úplnú živú vizuálnu kontrolu.

## Ďalší krok

Krok 9: Služby pre psov. Zatiaľ nezačína; pokračovať len na príkaz používateľa.
