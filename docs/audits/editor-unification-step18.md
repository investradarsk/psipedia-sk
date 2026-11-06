# Psipedia.sk – krok 18/18: finálna regresia a zosúladenie PR #1222

**Stav:** implementačný krok dokončený na existujúcej vetve PR #1222. PR zostáva **otvorený Draft** – nie je zlúčený do `main`, nenastal produkčný deploy ani žiadna zmena D1/Notion údajov.

## 1. Audit konfliktu s main

- Pôvodný PR HEAD: `216f305d600bafd6bbc6eff21f94726ccc1b85e9`
- Aktuálny `main` použitý na zosúladenie: `b4bf7b5193a9ef03e1c9fa776f6c56652833f41d`
- Od spoločného predka `c3f8f6a4b2272e3aaf3135dee39e4e33333e870c` mal `main` **28 commitov** a zmenil **24 súborov**; do našich PR zmien zasahovalo **5** z nich.
- Priamo rovnaký obsah už mali `.github/workflows/gemini-automation-foundation-ci.yml`; bez prepísania.
- Novšiu verziu `main` sme bez straty preniesli pre `.github/workflows/pr-visual-evidence.yml` a `tests/admin-mobile-document-navigation.test.mjs`.
- **Ručne zosúladené dve komponenty:**
  - `components/admin-directory-editor.tsx`: zostal zjednotený admin shell, validácia skrytých polí a ochrana rozpracovaných zmien; z `main` sa pridala bezpečne obmedzená galéria chovateľských staníc (limit 6, len príslušná kategória, oddelené uloženie, `galleryBusy` guard, zachovanie aj načítanie existujúcich obrázkov).
  - `components/directory-profile-detail.tsx`: zostala spoločná šablóna/detailové akcie a verejná `PublicFoundation`; z `main` sa pridala galéria fotografií chovateľských staníc, iba pri neprázdnych overených obrázkoch, bez duplikátu hlavnej fotografie.
- Zvyšných **19 súborov** z `main` sa prevzalo bez zásahu do vlastných zmien PR (CI workflow, galériový model/store, Notion guardy, testy).
- Výsledný Git strom `80ea47d21f48de2495f6e95929cc0ee3cbee0b08` bol samostatne overený: všetkých 24 položiek má očakávaný blob SHA. Zlúčenie `main` **do vetvy PR**, nie opačne, sa vykonalo merge commitom `2602c70b0713b23ab172bc7ee7697778c56db552` s dvoma rodičmi (PR HEAD + `main`).
- Po tomto kroku GitHub hlásil `mergeable: true`, `mergeable_state: blocked`: kód už bez obsahového konfliktu, ale stále Draft a bez konečných výsledkov pravidiel/checkov.

## 2. Regresné kontroly kódu

**Statická kontrola 20/20:** všetkých osem editorov (články, plemená, služby, podujatia, Pomoc psom, adopcie, stratené/nájdené psy a organizácie), `switch` navigácia, existujúce save API, ochrana neuložených zmien, verejné/súkromné kontakty, stavové prechody, Lexical/galéria, hydratácia, klávesnicový fokus, mapová presnosť, formuláre a mobilné E2E scenáre.

**Statická kontrola 11/11:** kanonický `DetailHero` pre služby, mobilná pozícia média a titulku, prístup k neexistujúcej fotografii, natural image, galéria chovateľských staníc, zabránenie duplikátu hlavnej fotografie a existujúce rozloženie služby.

Opravený **preukázane zastaraný test** `tests/directory-profile-ux.test.mjs`: pôvodne hľadal priamo v `DirectoryProfileDetail` značky zo starého hero, hoci sa aktuálne renderujú v spoločnom `DetailHero`. Nové asercie sú viazané na skutočný zdroj komponentu aj mobilné CSS. Zostali nedotknuté testy bezpečného importu, záznamov a verifikácie galérií.

Tým sa neredukuje pôvodné pokrytie. Žiadne nové veľké workflow alebo duplicitné E2E matice neboli pridané.

## 3. Čo nie je potvrdené

- **Žiadne tvrdenie, že TypeScript/Next build, node:test, Playwright, axe alebo produkčný smoke test sú už zelené.** Toto pracovné prostredie má prístup k GitHubu, ale nemá autentifikovaný lokálny checkout projektu s jeho závislosťami a browser runnerom.
- Po zosúladení vetvy sa GitHub Actions automaticky spustili. Pri kontrole boli viaceré workflow čakajúce/spustené, a niektoré zámerne preskočené na **Draft** PR. Nečakáme na ich dokončenie.
- Pred finálnym merge musí byť overený TypeScript/Next build a existujúci cielený testovací balík vrátane `tests/admin-editor-mobile-a11y-step17.test.mjs`, `tests/public-service-event-template-step16.test.mjs`, `tests/directory-profile-ux.test.mjs`, `tests/public-details-v2-ui.test.mjs` a E2E pre editory vrátane desktop/390/320 px. Ak zlyhá, najskôr opraviť preukázanú chybu.
- Overiť, že GitHub na poslednom HEAD hlási `mergeable: true`, potom doplniť potrebné kontrolné výsledky a až po schválení PR označiť ako pripravený na merge.

**Zásada:** Žiadny zásah do produkcie, neprepísať Notion, neodstraňovať chovateľské galérie, neschvaľovať ani nemergovať PR automaticky.
