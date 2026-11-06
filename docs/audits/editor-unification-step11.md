# Psipedia.sk – krok 11/18: používateľské rozhranie editora podujatí

**Rozsah:** dokončenie usporiadania existujúceho kanonického editora podujatí podľa spoločného `EditorWorkspace`. Zmeny sú len v otvorenom Draft PR #1222, nie na produkcii.

## Čo krok 11 mení
Po kroku 10 existovalo šesť panelov, ale organizátor, kontakty, vstupné a registrácia boli rozptýlené medzi sekciami Miesto, Popis a Fotografia. Krok 11 ich zoskupuje podľa reálneho workflow spravovania podujatia. Editor má **sedem** krokov:

1. **Základné údaje** – názov a krátky popis.
2. **Termín a typ** – kategória, začiatok/koniec, časy a označenie zrušeného podujatia.
3. **Miesto podujatia** – kraj, mesto, areál, adresa, existujúce manuálne mapové nástroje.
4. **Organizátor a kontakty** – organizátor, verejný telefón, verejný e-mail, web a registračný odkaz.
5. **Program a informácie** – podrobný popis/program (existujúci Markdown/Lexical), praktické pokyny/podmienky (existujúci Markdown/Lexical) a vstupné.
6. **Fotografia a URL** – slug, titulná fotografia, úprava zobrazenia a Facebook zdieľanie.
7. **SEO** – kanonický `AdminSeoFields`.

Používa už existujúcu spoločnú komponentovú navigáciu: na desktope bočné menu, na mobile výber sekcie a vo formulári Predchádzajúca/Ďalšia. **Všetky sekcie ostávajú namontované**, aby sa pri prepínaní nestrácali Lexical/Markdown ani iné rozpracované hodnoty. Opravené mapovanie klientských chýb na panel organizátora a kontaktov. Presunutý iba UI, nie obsahové dáta.

## Zachované kontrakty a hranice
- Rovnaké API `POST/PUT /api/admin/events`, `lib/event-store.ts`, ochrana rozpracovaných úprav a explicitná akcia publikovať/stiahnuť.
- Rovnaká validácia medzi konceptom, prvým publikovaním a úpravou už publikovaného podujatia; nekomplikovať pôvodné serverové pravidlá ani Notion zapisovanie.
- `description` je naďalej kanonický dlhší popis, v ktorom sa píše aj program/harmonogram. `practicalInfo` naďalej pokrýva podmienky registrácie a pokyny. Krok 11 **nevytvára** nový nekompatibilný formát programu.
- Nové voliteľné `contactPhone`, `contactEmail` a `admissionFee` zostávajú polia z kroku 10. Migrácia `0160` v PR je stále len pripravená, **nie spustená**; nie sú menené Notion databázy či webhooky.
- Žiadne produkčné úpravy, žiadne vymazanie obsahu, žiadna zmena adries Google Places a žiadne ďalšie platené Google API volania.

## Kontroly
- Pred krokom bola v CI identifikovaná E2E chyba: nejednoznačné `getByLabel("Organizátor")` po pridaní kontaktov. Opravený presný selektor.
- Testy `tests/admin-editor-event-ux-step11.test.mjs` kontrolujú poradie siedmich sekcií, jedinečnosť vstupov, priradenie údajov, validáciu a existujúce mutačné kontrakty.
- Upravené `tests/admin-event-editor-v3.test.mjs`, `tests/admin-editor-event-single-section-step10.test.mjs` a `tests/e2e/admin-event-editor-v3.spec.ts`; E2E pokrýva desktop 1440 px, mobil 390/320 px, vytvorenie konceptu, publikovanie, vrátenie z neúplných sekcií, kontrolu neuložených zmien a nezmazanie údajov pri prepínaní.
- CI/E2E nemá byť blokujúcou podmienkou na **implementáciu nasledujúceho kroku**, ale pred merge celého PR #1222 musí byť overené. Po dopracovaní všetkých 18 krokov prepnúť Draft na Ready for review a spustiť plnú vizuálnu a regresnú akceptáciu.

**Ďalší krok 12:** Pomoc psom (samostatný pokyn používateľa); neštartovať automaticky.
