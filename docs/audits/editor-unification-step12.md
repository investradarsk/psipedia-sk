# Psipedia.sk – krok 12/18: zjednotenie editora Pomoc psom

**Rozsah:** existujúci kanonický editor všeobecných prípadov a výziev `AdminHelpEditor`; zmeny len v otvorenom Draft PR #1222. Žiadne zmeny produkčných dát.

## Výsledné ovládanie
Editor teraz používa **rovnakú spoločnú komponentovú navigáciu** (`AdminSharedEditorNavigation` + `AdminEditorSectionVisibility` + `AdminEditorSection`) ako adresár. Po vybratí sekcie zostávajú ostatné sekcie **namontované, iba skryté**, aby sa nestrácala práca s Lexical textom, fotografiami ani rozpracovanými hodnotami. Na počítači je bočné menu, na mobile výber sekcie. Na konci formulára sú tlačidlá Predchádzajúca/Ďalšia.

Poradie sekcií:
1. **Základné údaje:** názov a krátky popis.
2. **Zaradenie a lokalita:** kategória, zodpovedná osoba alebo organizácia, kraj, mesto a spresnenie lokality.
3. **Prípad a pes:** celý príbeh, voliteľné údaje psa a dátumy.
4. **Výzva a zbierka:** hlavné tlačidlo/odkaz, vyzbieraná suma, cieľ a poznámka pred kontaktovaním.
5. **Fotografia a stav:** URL, titulná fotografia, vizuálne nastavenia, overené/urgentné/vybavené a Facebook.
6. **SEO:** existujúci kanonický SEO editor.

Zachovaný živý súhrn vrátane mobilu, sticky `AdminEditorFooter`, upload a `ImageDisplayEditor`. Správa je stále výlučne v `AdminHelpEditor`.

## Validácia a dáta
- Existujúce `POST /api/admin/help` a `PUT /api/admin/help/:id` sú nezmenené, vrátane plného doterajšieho payloadu.
- Pri skrytých povinných poliach editor explicitne otvorí správny panel; **server** stále rozhoduje o pravidlách publikovania a validite. Koncept vyžaduje názov, slug má zachovaný fallback z názvu.
- Pri publikovaní sa zobrazí panel pre chýbajúci krátky/dlhý popis, organizátora či mesto. Pri zbierkach zostáva existujúca požiadavka overenia a oficiálneho odkazu (nemožno ju obísť). Pri serverovej chybe sa otvorí relevantný panel.
- Nezmenené pravidlá `urgentne-pripady` pre legacy profil a whitelist `HELP_ADMIN_CREATE_CATEGORIES`.
- Nezasahovalo sa do Adopcií, Lost/Found ani Organizácií – tieto entity majú vlastné kanonické editory a samostatné plánované kroky. Notion synchronizácia, D1, API, mapy a automatizácie sú nedotknuté.

## Regresie a overenie
- Opravené duplicity HTML ID: sekcia lokality používa `help-place`, pôvodné vstupné pole `help-location` zostáva.
- Kontrakty: `tests/admin-editor-help-single-section-step12.test.mjs` overujú počet/poradie sekcií, pole v správnom paneli, Lexical, fotografie, SEO, URL/uloženie a ochranu pred stratou zmien.
- Playwright: `tests/e2e/admin-ux-unification.spec.ts` obsahuje scenáre pre 1440, 390 a 320 px, navigáciu bez zápisu a zachovanie hodnôt medzi panelmi.
- Statická kontrola: 6 otvorených/uzavretých panelov, všetkých 19 sledovaných vstupov presne raz, 1 formulár, 1 `AdminFormFeedback`, 1 kontextový provider a spoločná navigácia bez kolízií ID.
- CI ani produkčné E2E nie sú týmto zápisom automaticky potvrdené. Pred merge celého PR dokončiť CI, mobil/desktop QA a produktovú akceptáciu.

**Ďalší krok 13:** len na explicitný pokyn používateľa. PR #1222 ponechať ako Draft; nečakať na CI medzi krokmi, nemergovať.
