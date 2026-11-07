# Psipedia.sk – krok 10/18: editor podujatí

**Stav:** zapracované do otvoreného PR #1222, bez produkčného nasadenia. CI/E2E sa vyhodnotí pred merge, nie ako podmienka pre každý ďalší krok.

## Ovládanie
- Kanonický `AdminEventEditor` teraz používa `EditorWorkspace sectionMode="switch"` a šesť sekcií: Základné údaje, Termín a typ, Miesto a organizátor, Popis a informácie, Odkazy a fotografia, SEO.
- Na desktope je navigácia bočná, na mobile výber. Sekcie zostávajú namontované, len sa skrývajú; hodnoty Lexical/Markdown, výber, mapové komponenty, obrázky a SEO sa pri prepínaní nezahadzujú.
- Pod formulárom je pager Predchádzajúca / Ďalšia. Hlásenia o chybe/uložení sú nad formulárom.
- Explicitná validácia zobrazuje sekciu nevyplneného poľa. Koncept vyžaduje len názov a slug, ostatné podmienky sa kontrolujú pri prvom publikovaní. Pri existujúcom publikovanom profile sa nepridávajú nové klientské blokácie; stiahnutie z kalendára musí fungovať aj pri starších neúplných údajoch.

## Nové kontaktné údaje
- Verejný telefón organizátora (`contactPhone`), verejný e-mail (`contactEmail`) a voľný text vstupného (`admissionFee`) sú voliteľné.
- Migrácia `drizzle/0160_event_contacts_admission.sql` pridáva tri stĺpce; existujúce záznamy zostávajú nedotknuté. Zapisuje sa cez pôvodné `POST/PUT /api/admin/events` a `lib/event-store.ts`.
- Starí volajúci, ktorí nové polia pri `PUT` neposielajú, ponechávajú uložené hodnoty. E-mail a maximálne dĺžky sú serverovo kontrolované.
- Na verejnom detaile podujatia sa zobrazia iba vyplnené polia, telefón/e-mail ako kontaktné odkazy. Pozor: `0160` treba aplikovať **pred nasadením kódu**, keďže SQL INSERT/UPDATE číta nové stĺpce.
- Notion tabuľky, webhooky, mapové potvrdenia, automatizácie, schvaľovanie a obchodné pravidlá nie sú súčasťou tejto úpravy. Nové polia nie sú automaticky pridané do existujúceho Notion modelu.

## CI chyby nájdené pri začatí kroku 10
- BREEDS-ADMIN E2E po kroku 7 používal skryté polia bez prepnutia sekcie – test opravený pre nový workflow.
- ADMIN-EVENT-EDITOR-V3 pilot E2E čakal navigačné tlačidlo v pôvodnom scroll režime; test zmenený na aktuálny single-section workflow.
- ADMIN-EDITOR-WORKSPACE-V3 axe identifikoval kontrast bieleho textu pri hover aktívnej položky; opravené cielené CSS a hover selektor.
- Regresné scenáre sú v `tests/admin-editor-event-single-section-step10.test.mjs` a `tests/e2e/admin-event-editor-v3.spec.ts`. Živé CI/E2E ešte potrebuje potvrdenie; nie je dôvod ho blokujúco čakať pred ďalším krokom.

**Ďalší krok 11:** nezačať bez explicitného pokynu používateľa. Na začiatku ďalšieho kroku opäť skontrolovať nové X.
