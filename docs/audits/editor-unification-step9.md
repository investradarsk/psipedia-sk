# Psipedia.sk – krok 9/18: editor služieb (Adresár)

**Stav:** zmeny zapracované do otvoreného PR #1222; nie sú nasadené do produkcie. Na CI sa pri jednotlivom kroku nečaká.

## Zjednotenie ovládania

- Kanonický `AdminDirectoryEditor` má päť sekcií: Hlavné → Lokalita → Obsah → Kontakty → Médiá a dôvera.
- Používa existujúce `AdminSharedEditorNavigation` (`layout="sidebar"`, `mode="switch"`) a `AdminEditorSectionVisibility`, rovnaký mechanizmus ako pre editor plemien.
- Vždy je viditeľná iba jedna sekcia; ostatné zostávajú namontované (vrátane Lexical, autocomplete, kategóriových filtrov), len sú skryté.
- Desktop má bočné menu; úzke rozloženie vrátane Notion/Gemini modalu používa mobilný výber podľa *šírky editora* (CSS container query). Tlačidlá Predchádzajúca/Ďalšia fungujú bez odoslania formulára.
- Živý náhľad profilu, priebežné stavové označenia, horné akcie, galéria výrezu obrázka a pokročilý SEO drawer sa nemenia funkčne. Náhľad zostáva viditeľný aj pri prepnutí sekcie.
- Výsledky uloženia aj chyby sa ukazujú **nad** pracovnými sekciami; v prípade nesprávneho poľa sa vyberie jeho sekcia alebo otvorí SEO drawer.
- Natívna validácia už nesmie zastaviť formulár pre skryté pole bez vysvetlenia: `noValidate` dopĺňa explicitná kontrola existujúcich `required`, `type=email`, `type=url` atď. pri **oboch** akciách Uložiť a Publikovať; pri samotnom stiahnutí už publikovaného profilu sa kontrola preskočí, aby neplatný starší kontakt neblokoval stiahnutie. Server je aj naďalej rozhodujúci pre ostatné pravidlá.

## Zachované procesy

- `POST/PUT /api/admin/directory` aj samostatný `PATCH set-category-filters`; rovnaké dáta, kvalitatívne stavy a publikovanie.
- Samostatná vetva `PUT /api/admin/gemini-automation/notion-drafts/:id`, odmietnutie/obnovenie konceptu, iba neverejný import D1 a obmedzenie publikovania počas Notion kontroly.
- Ručné rozhodnutia o adrese, výber/overenie lokality, kontrola Google Places, kategórie, služby, kontakty vrátane interných neverejných polí, fotografie a SEO.
- Ochrana pred neuloženými zmenami, archivačný a trust režim, zdroje automatizácie, živý náhľad, existujúci `AdminEditorFooter`.
- Bez zmeny API, D1 schémy, Notion synchronizácie, platených Google Maps operácií či obsahu profilov.

## Kontrola pred merge

- Regresný kontrakt `tests/admin-editor-directory-single-section-step9.test.mjs`.
- Živé scenáre: 1280/1440 px a 320/390/430 px, vytvorenie/úprava, kategóriové filtre po prepnutí, Lexical, adresa/Google výber, kontakty, validácia skrytých polí, obrázky, SEO drawer, draft, publish/unpublish, Notion modal, archivovaný profil.
- Zlyhané CI/E2E opraviť pred **merge**; nečakať na ne pri začatí ďalšieho kroku.
- **Krok 10 nespúšťať bez samostatného pokynu používateľa.**
