# Psipedia.sk – krok 15/18: kanonický editor organizácií

**Rozsah:** výhradne `AdminOrganizationEditor` a jeho prezentačné štýly. Všetky zmeny sú pridané do existujúceho **Draft PR #1222**. Žiadne nasadenie, úpravy produkčných dát, D1 migrácií ani Notion.

## Jednotná navigácia a panely

Namiesto pôvodného posúvania medzi štyrmi sekciami teraz používame spoločný systém `AdminSharedEditorNavigation` + `AdminEditorSectionVisibility` + `AdminEditorSection`, ktorý už používajú ostatné redakčné editory. Na desktope je navigácia v ľavom stĺpci, na mobile výber sekcie; pod obsahom sú tlačidlá Predchádzajúca/Ďalšia.

Všetky panely zostávajú **namontované** a neaktívne sa iba skrývajú, čo zachováva vstupy, Lexical a stav editora:
1. **Základné údaje:** kanonická identita (názov, právny názov, slug, IČO/registračné číslo, typ a informačný stav).
2. **Verejný obsah:** krátky popis, podrobný popis, súčasné Lexical vstupy, pôvodný textový ukladací kontrakt.
3. **Kontakty:** výhradne verejné e-mailové, telefónne, webové a sociálne odkazy; súkromné PII sem nepatria.
4. **Obrázok a zdroj:** už existujúci upload, súčasné médium, voľba výrezu a URL zdroja.

Editor nepoužíva nové API ani nový systém médií. Štýly sú izolované v `components/admin-organization-editor.module.css`.

## Ukladanie a bezpečnosť

- V rámci jedného formulára sa používa `noValidate`: pre **všetky** namontované natívne prvky sa pred mutáciou volá `checkValidity()`. Ak je povinné/neplatné pole v skrytej sekcii, editor ju otvorí a zobrazí prístupnú správu, namiesto nefunkčného natívneho fokusovania.
- Server ďalej samostatne kontroluje povolené hodnoty, statusy a všetky doménové zmluvy.
- Zachované `POST /api/admin/organizations`, `PUT /api/admin/organizations/:id`, `expectedUpdatedAt`, ochrana `mutationPending`, lokálna ochrana proti neuloženým zmenám a kontrola súbežných úprav.
- Stav `ARCHIVED` zostáva iba na čítanie; publikovanie/archivácia sa ďalej spravuje v samostatnom zozname, nie vo formulári. Zostáva zachované prijímanie návrhov automatizácie a správne ukladanie rozpracovaného stavu.

## Testy

- `tests/admin-editor-organization-single-section-step15.test.mjs`: kontrakt štyroch panelov, všetky dôležité polia, Lexical, ochrany API/publikovania, odozva pri chybe v skrytom poli, mobilné pravidlá.
- `tests/e2e/admin-organization-publication.spec.ts`: pôvodný vytvor/ulož scenár upravený na navigáciu medzi panelmi, doplnené kontroly pri šírkach 1440/390/320 px na zachovanie rozpracovaných polí bez API mutácie a test neplatného e-mailu v skrytej sekcii.
- Vykonaná **statická kontrola zdrojov**: 4/4 otvorené a zatvorené panely, jeden formulár, jedna správa o uložení, jeden provider, žiadne duplicitné HTML ID ani nezapojené `htmlFor` štítky.
- V čase kroku 15 GitHub Actions na aktuálnom HEAD neposkytli výsledok. Statická kontrola **nie je** dôkazom o zelenom CI, TypeScript build ani úspešnom Playwright E2E.
- Pull request zostáva Draft a GitHub naďalej hlási konflikt s `main`. Pred konečným merge treba bezpečne zosúladiť vetvy, spustiť a potvrdiť testy a vizuálne preveriť mobil.

Krok 16 začať až na výslovný pokyn používateľa.
