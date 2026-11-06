# Psipedia.sk – krok 14/18: editor stratených a nájdených psov

**Rozsah:** iba kanonický `AdminLostFoundEditor` a jeho existujúce lokálne CSS. Zmeny sú pripravené v spoločnom otvorenom **Draft PR #1222**, nie na produkcii.

## Spoločný editor

Pôvodný rozťahaný formulár používa zdieľané `AdminSharedEditorNavigation`, `AdminEditorSectionVisibility` a `AdminEditorSection`. Na desktope je bočná navigácia, na mobile jeden výber sekcie, dole Predchádzajúca/Ďalšia. Neaktívne sekcie sa iba skryjú a **neodmontujú**, takže sa zachovajú rozpracované hodnoty `useState`, texty Lexical, výber plemena, galéria a moderátorská poznámka.

Sedem panelov:
1. Typ a stav prípadu – LOST/FOUND, aktuálny stav, slug.
2. Pes a plemeno – meno, fyzické vlastnosti, čip, `breedId` alebo neznáme plemeno.
3. Popis a identifikácia – hlavný popis, rozpoznávacie znaky, obojok/postroj (Lexical).
4. Dátum a bezpečná lokalita – dátum udalosti, posledný výskyt, kraj, obec a **približná** presnosť/súradnice.
5. Kontakt a súkromie – súkromná kontaktná osoba, telefón a e-mail, zdroj a verejná anonymizovaná poznámka.
6. Fotografie a galéria – pôvodný upload, nastavenie výrezu a `AdminPhotoGallery` (limit 8) na jednom mieste.
7. Životnosť a moderácia – expirácia, súkromná poznámka a samostatná akcia na označenie duplicity.

K hlavnej fotografii a galérii sa dostaneš spolu; upload, `ImageDisplayEditor` a privátny náhľad zachovávajú pôvodné zdroje. Pripojených bolo aj 26 prístupných `htmlFor` + `id` väzieb medzi štítkami a formulárovými ovládacími prvkami. Všetky ID sú jedinečné.

## Zachované bezpečnostné a dátové kontrakty

- Zachované `POST /api/admin/lost-found`, `PUT /api/admin/lost-found/:id` a samostatné `POST /api/admin/lost-found/:id/duplicate`, ochrana pred neuloženými zmenami, pôvodné `allowedLostFoundTransitions`, `AdminEditorFooter` a stavové tlačidlá. Nové hlásenie stále vzniká výhradne ako `DRAFT`.
- Skryté povinné polia sa nedajú bezpečne obslúžiť natívnou HTML validáciou. Použité `noValidate` a explicitná kontrola pred uložením, ktorá otvorí konkrétny panel; doménová validácia API/servera je autoritatívna a zostáva nezmenená.
- Pre neverejný stav DRAFT sa nemenia serverové požiadavky. Pri ostatných stavoch sa preverí dátum, obec/kraj, opis s aspoň 20 znakmi; pri ACTIVE LOST tiež posledný zaznamenaný výskyt.
- Presná súkromná adresa nie je pridaná a pri mapách zostáva upozornenie na anonymizáciu. Žiadna nová platená Google API požiadavka. Súkromné PII sú stále oddelené od verejného náhľadu a podľa doterajšieho serverového kontraktu sa šifrujú.
- Nezmenené D1/Notion, webhooky, automatizácie, verejné stránky a databázové migrácie. Žiadne mazanie profilov či fotografií.

## Regresné overenie

- `tests/admin-editor-lost-found-single-section-step14.test.mjs`: presné poradie siedmich panelov, jedno namontovanie uploadu a galérie, súkromné kontaktné údaje, pôvodné API, lifecycle a duplicate akcia.
- `tests/e2e/lost-found-dogs.spec.ts`: šírky 1440, 390 a 320 px; navigácia cez všetky panely, zachovanie rozpracovaných mien, mesta a neverejných kontaktov a žiadna mutačná požiadavka počas prepínania.
- Statická kontrola zdrojového kódu: **7 otváracích a 7 zatváracích panelov**, **1 formulár**, **1 provider**, **26 správne pripojených labelov**, žiadne duplicitné HTML ID a žiadne osamotené `htmlFor` referencie.
- GitHub Actions na aktuálnom SHA neposkytli nové výsledky; statická kontrola nie je náhradou za reálne CI/E2E. PR stále hlási konflikt s `main` a zostáva Draft. Pred finálnym merge treba konflikt bezpečne vyriešiť, potvrdiť testy a mobilný vizuál.

**Nasledujúci krok 15:** až po výslovnom pokyne používateľa.
