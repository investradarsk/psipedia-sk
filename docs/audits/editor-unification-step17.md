# Psipedia.sk – krok 17/18: mobilné zobrazenie a prístupnosť editorov

## Rozsah

Použitý je **jeden zdieľaný navigačný systém** pre osem kanonických rodín: články, plemená, služby, podujatia, Pomoc psom, adopcie, stratené/nájdené psy a organizácie. Zmeny sú výhradne v existujúcom **Draft PR #1222**. Žiadne zápisy do produkčnej databázy, zmeny publikačných API, Notion synchronizácie ani redakčných údajov.

## Preukázané problémy a opravy

1. **Klávesnicový fokus po prepnutí sekcie.** V samostatných editoroch s prepínaním panelov sa pôvodne aktualizovalo len `activeId`. Nový `AdminSharedEditorNavigation.navigate()` po používateľskom prepnutí a vykreslení sekcie bezpečne zameria príslušný viditeľný `[data-admin-editor-section]`. Pri prvom hydrate a v režime `scroll` fokus nemení.
2. **Hydratácia na mobile.** `AdminSharedEditorNavigation` teraz používa `useSyncExternalStore` s odlišnými serverovým a klientským snapshotom: `switch` tlačidlá aj mobilný `select` sú pred pripojením React handlerov deaktivované. Natívne scroll/hash odkazy zostávajú bez JavaScriptu funkčné.
3. **Ovládanie čítačkou obrazovky.** Tlačidlá prepínania panelov majú `aria-controls` s ID svojho panelu; mobilný `select` má dostupný popis aj prepojenie na aktuálnu sekciu. Existujúce `aria-current` zostáva zachované. Sekcie, ktoré sú skryté, sa neničia a ich formulárové hodnoty sa nestrácajú.
4. **Viditeľný fokus.** Zdieľané `AdminEditorSection` a obyčajné sekcie v `EditorWorkspace` majú vizuálny `:focus-visible` indikátor. Neprepisuje sa focus trap existujúcich dialógov ani prístupnosť iných komponentov.
5. **320 px mobil.** Dlhé názvy sekcií, mobilný select a dolné tlačidlá/hlásenia majú bezpečné `min-width:0`, `max-width:100%` a zalamovanie textu. Select na úzkych mobiloch používa 16 px písmo kvôli obmedzeniu nežiaduceho iOS priblíženia. Zachovaný min. 44 px cieľ dotyku a `safe-area-inset`.
6. **Rešpektovanie zníženého pohybu.** Spoločná navigačná vrstva dopĺňa `prefers-reduced-motion`, bez zásahu do pôvodných editovacích stavov a sieťových operácií.

## Existujúce testy zosúladené s novým editorom

- `tests/e2e/admin-ux-unification.spec.ts`: odstránený zastaraný predpoklad hash odkazov v adresári. E2E teraz skutočne prepína sekcie cez tlačidlo alebo select, kontroluje fokus, viditeľnosť, retenciu údajov, horizontálne pretekanie a accessibility pomocou axe.
- `tests/e2e/adoption.spec.ts`, `tests/e2e/lost-found-dogs.spec.ts`, `tests/e2e/admin-organization-publication.spec.ts`: doplnené očakávanie `toBeFocused()` po výbere sekcie. Ich existujúca matica zostáva **1440 / 390 / 320 px** bez rozširovania počtu pomalých testov.
- `tests/admin-editor-unified-navigation-step3.test.mjs`: upravená existujúca statická asercia na nové hydraulicky bezpečné `navigationReady`.
- **Nový malý statický kontrakt** `tests/admin-editor-mobile-a11y-step17.test.mjs`: zdieľaná navigácia, focus, hydratácia, desktop/mobile CSS, footer a všetkých osem editorov.

## Presný stav overenia

- Overené čítaním zdrojových súborov na HEAD: osem editorových rodín používa `switch` navigáciu; spoločný klientsky guard, `aria-controls`, focus po aktivácii, CSS pre 320 px a upravené E2E sú prítomné.
- Skutočný **Playwright browser run**, axe výstup, TypeScript/Next build ani GitHub Actions ešte na HEAD nie sú potvrdené. Statická kontrola nie je dôkazom úspešného behu. V kroku 18 je potrebné získať konečné výsledky a opraviť každé konkrétne zlyhanie.
- PR #1222 zostáva **Draft** a GitHub hlási `mergeable_state=dirty`, teda merge konflikt s `main`. Pred finálnym zlúčením musí byť bezpečne vyriešený; **teraz nemergovať**.

**Ďalší krok 18/18:** celková regresia, kontrola PR konfliktov a čistenie, až po novom pokyne používateľa.
