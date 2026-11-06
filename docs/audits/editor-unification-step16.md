# Psipedia.sk – krok 16/18: verejné detaily služieb v spoločnej šablóne podujatí

## Rozsah

Pôvodný 18-krokový plán určuje **krok 16: Verejné služby** (veterinári, salóny a ďalší poskytovatelia). Implementácia je na vetve existujúceho **Draft PR #1222**; žiadne produkčné zmeny ani nový PR.

### Zistenie pri audite
- Verejný `EventDetail` už používal `DetailHero`, `PublicDetailLayout`, `PublicFoundation` a zdieľané dizajnové tokeny.
- Verejný `DirectoryProfileDetail` už slúžil **všetkým 10 kategóriám služieb** cez jeden komponent a používal `DetailHero`, `PublicDetailFlow` a `PublicDetailLayout`. Mal samostatne poskladanú akčnú navigáciu a nemal rovnakú `PublicFoundation` vrstvu.
- Kompaktná fotografia služby je zámerná: dovolí zobraziť logotypy/menšie profilové fotografie bez roztiahnutia do pomeru fotografie podujatia. Jej existujúci `mediaPresentation="compact"` ostáva.

## Zapracované

1. `DetailHeroActions` v `components/detail-primitives/detail-primitives.tsx`: spoločné semantické `nav`, prístupný názov, vizuálna trieda z kanonickej šablóny a testovateľný `data-public-detail-actions`.
2. `components/event-detail.tsx`: prepojený pôvodný blok `Registrácia/Oficiálna stránka` na `DetailHeroActions`; zachované časy, dátumy, organizátor, vstupné, telefón, e-mail, archívne/cancelled stavy aj mapa.
3. `components/directory-profile-detail.tsx`: v rovnakom akčnom komponente sú `Poslať dopyt`, podmienene `Zavolať` a podmienene `Navigovať`. Zachované existujúce adresy, podmienka bezpečných presných mapových údajov a kontakt `#kontakt`.
4. Celý detail služby používa rovnakú typografickú a farebnú `PublicFoundation` ako podujatie a nesie `data-public-service-detail-template="shared-event-service"`, bez zmeny kanonických údajov či public route.

## Dôležité špecializácie, ktoré sa NESMÚ stratiť

- Všetky kategórie: spoločné rozloženie hero/obsah/sidebar + príslušný kategóriový štítok.
- Veterinári a ďalší odborní poskytovatelia: `Odborné informácie`, fakty, kvalifikácie a cenník, len keď sú k dispozícii.
- Salóny a ostatní poskytovatelia: existujúci katalóg `Poskytované služby` a prípadné otváracie hodiny.
- Verejné kontakty: telefón, e-mail, web/siete, formulár `DirectoryContactForm`; nič nie je domyslené z neúplných údajov.
- Mapy: `isApproximateMapItem` naďalej zakazuje presnú navigáciu pre približnú lokalitu; žiadne nové Google API volania a súkromné údaje sa nezverejňujú.
- `ProfileReviewSection`, súvisiace plemená, ďalšie profily v lokalite a partnerská správa zostávajú.
- **Mobilné poradie** blokov zostáva: O službe → Adresa a kontakt → Poskytované služby → Odborné údaje → Otváracie hodiny → Mapa → Zdroje/Recenzie/V okolí → Dopyt.
- Event detail si zachováva svoju kalendárovú špecializáciu, dátumy a registráciu. Neboli pridané nové DOM fakty, ktoré by duplikovali adresu alebo kontakty.

## Kontroly

- `tests/public-service-event-template-step16.test.mjs`: zdieľané hero a akčné navigácie, zachované kompaktné fotografie služieb a všetky kategóriové bloky, bezpečnostné mapové pravidlá, kontakty, udalostné atribúty.
- `tests/public-details-v2-ui.test.mjs`: existujúce vizuálne/Playwright fixtúry doplnené o kontrolu jednej akčnej navigácie, prístupného názvu a identifikátora spoločnej šablóny. Už zahŕňajú varianty `directory` a `event` pri šírkach 1440, 768, 430, 390, 375 a 320 px vrátane prázdnych, dlhých a obrázkových stavov.
- Statická kontrola aktuálneho zdrojového kódu potvrdila 1 akčnú navigáciu na každý detail, nezmenené kontakty, map gate, dopytový formulár a kategóriové sekcie.
- **CI a E2E výsledky ešte neboli potvrdené.** Na GitHub HEAD neboli dostupné nové workflow výsledky. PR stále hlási konflikt s `main`, preto pred finálnym merge treba bezpečne zosúladiť vetvy a spustiť plný regresný priechod.

## Čo sa nemení

Žiadne zmeny D1/Notion synchronizácie, verejných dát, formulárového API, kategorizácie, SEO URL ani bezpečnostných pravidiel. Nenahrádza sa mapa, nespúšťajú sa nové platené Google volania, nepovoľuje sa auto-publikovanie a nevzniká nový PR.

**Krok 17:** mobil a prístupnosť až po ďalšom používateľskom pokyne. **Krok 18:** úplné regresné testy a vyčistenie až následne.
