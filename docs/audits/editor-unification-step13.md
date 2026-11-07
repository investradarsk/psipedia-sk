# Psipedia.sk – krok 13/18: editor adopcií

**Rozsah:** kanonický formulár `AdminAdoptionEditor` vrátane doterajších pomocných komponentov `AdminAdoptionEditorProfile` a `AdminAdoptionEditorDetails`. Zmeny sú pripravené v otvorenom **Draft PR #1222**. Žiadna zmena produkčných údajov ani nasadenie.

## Jednotné rozhranie
Editor adopcií teraz používa ten istý prezentačný systém ako službové a Help editory: `AdminSharedEditorNavigation`, `AdminEditorSectionVisibility` a `AdminEditorSection`. Na desktope je bočné menu, na mobile výber sekcie a pod obsahom ovládanie Predchádzajúca/Ďalšia.

Osem sekcií (každá je stále namontovaná v DOM; skryté panely sa **nevypínajú**):
1. Základné údaje – meno, slug a lifecycle stav
2. Plemeno a profil – väzba na plemeno, pohlavie, vek, veľkosť, hmotnosť a farba
3. Lokalita – kraj, okres a mesto
4. Povaha a kompatibilita – krátky opis, príbeh, povaha, potreby a kompatibilita domácnosti
5. Zdravie – zdravotné údaje a podmienky adopcie
6. Organizácia a kontakt – kanonická organizácia, snapshot kompatibilné údaje a kontaktné odkazy
7. Fotografie – hlavná fotografia, galéria a úprava výrezu
8. Stav a overenie – dátum posledného overenia

Lexical/textarea pretrváva pri prepínaní; hodnoty v neaktívnych paneloch zostávajú v `FormData`. `AdminPhotoGallery`, `ImageDisplayEditor`, náhľad, `AdminAutomationUpdateSuggestions`, Facebook a spoločný `AdminEditorFooter` zostávajú zachované. Štýly sú izolované v `admin-adoption-editor.module.css`.

## Validácia a bezpečnosť
- Formulár používa `noValidate`, pretože pri neaktívnej sekcii nemôže browser automaticky fokusovať skryté povinné pole. Pred uložením preto volá na **všetkých** namontovaných native inputoch `checkValidity()` a otvorí sekciu prvého neplatného prvku. Lexical bohaté texty a všetky ostatné doménové podmienky **naďalej validuje server**; chyby API otvoria relevantnú sekciu.
- Zachované `POST /api/admin/adoptions` a `PUT /api/admin/adoptions/:id` vrátane `expectedUpdatedAt`, optimistic locking a existujúcich stavových prechodov `DRAFT/ACTIVE/RESERVED/ADOPTED/ARCHIVED`.
- Počas výpadku možností plemien sa zachová už uložený `breedId` cez pôvodné skryté pole; nevynucuje sa žiadne premazanie väzby.
- Pri `ACTIVE` a `RESERVED` sa naďalej vyžadujú serverom kontrolované údaje vrátane kanonickej väzby `organizationId`.
- Žiadne zmeny D1, Notion, dát, lifecycle API alebo automatizačných promptov.
- Opravené kolízie HTML ID: prepínacie panely sú `adoption-personality` a `adoption-medical`, zatiaľ čo pôvodné vstupné polia/labely `adoption-temperament` a `adoption-health` zostali nezmenené.

## Testy a nasadenie
- Nové statické kontrakty v `tests/admin-editor-adoption-single-section-step13.test.mjs`: presne 8 panelov, kanonické formulárové polia, skrytá sekcia a pôvodná bezpečnosť.
- Rozšírený `tests/e2e/adoption.spec.ts`: pri šírkach 1440, 390 a 320 px sa bez uloženia prepne 8 panelov, skontrolujú sa zachované vstupy aj `FormData`, bez mutačných requestov.
- Pri začiatku kroku 13 na aktuálnom head SHA neboli dostupné nové GitHub Actions výsledky; to **nie je potvrdenie zelených kontrol**. GitHub hlásil konflikt PR s `main` (`mergeable=false`). Nevykonával som rizikovú rebázu/merge a PR zostáva Draft.
- Pred merge je nutné vyriešiť konflikt s `main`, spustiť a prejsť CI/E2E a ručne overiť publikáciu, návrat a mobilné rozloženie.

**Krok 14** sa nezačína bez ďalšieho výslovného pokynu používateľa.
