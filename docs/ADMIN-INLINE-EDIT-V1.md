# PSIPEDIA – úpravy priamo v tabuľkách (Admin Inline Editing V1)

Cieľ: rovnaký spôsob práce v celej administrácii na desktope. Kliknúť „Upraviť v tabuľke“, upraviť bezpečné polia, **Uložiť/Zrušiť**, bez navigácie do detailu.

## Pravidlá

1. Jeden spoločný vizuálny komponent `AdminInlineRowActions`, `AdminInlineCellInput`, `AdminInlineCellSelect`. **Žiadne univerzálne API zapisujúce ľubovoľné polia.** Každá oblasť má vlastnú serverovú allowlist a doménový zápis.
2. Jediný upravovaný riadok, explicitné uloženie; nulový autosave. Pri filtrovaní, stránkovaní či zmene verzie riadku sa editácia nepoužije na iný riadok.
3. `updatedAt` a atómový compare-and-set, aby sa neprepísala práca iného editora. Ak dáta medzitým zmení Notion či automatizácia, používateľ dostane konflikt.
4. Použiť pôvodnú autentifikáciu, CSRF ochrany, validácie, Notion synchronizáciu a verejnú cache invalidáciu, kde ich doména vyžaduje.
5. **Neumožniť v generickej tabuľke** zmeniť identifikátory, slug, adresy/Google Place, obrázky, statusy s predpodmienkami, väzby, fyzické mazanie alebo služby z katalógu V3. Tie zostávajú v existujúcich editoroch alebo samostatných potvrdzovacích akciách.
6. Nezasahovať do verejného ani mobilného dizajnu, nepridávať D1 migrácie.

## Inventár a postupné rozširovanie

| Obrazovka | Stav | Priama úprava |
| --- | --- | --- |
| `/admin/pomoc-psom?category=utulky` | už v main (PR #1175) | názov, krátky popis, e-mail, telefón, web |
| `/admin/sluzby-pre-psov` | tento PR | názov, krátky popis |
| `/admin/adresar` | tento PR | názov, krátky popis, používa rovnaký komponent ako Služby |
| `/admin/podujatia` | tento PR | typ podujatia, označenie zrušenia |
| `/admin/organizacie` | tento PR | názov a krátky popis na karte organizácie s CAS a Notion sync, bez lifecycle |
| `/admin/pomoc-psom` – dočasná opatera, zbierky, dobrovoľníctvo | tento PR | názov a krátky popis cez doménový Help Cases CAS; bulk publikovanie ostáva oddelené |
| `/admin/pomoc-psom` – adopcia a stratené/nájdené | napojenia v samostatných canonical zoznamoch hotové | názvy/editácia mien v `/admin/adopcie` a `/admin/stratene-najdene`; spoločný agregovaný zoznam je ešte zvlášť |
| `/admin/adopcie` | tento PR | meno psa so zachovaním slugu, statusu, vzťahu na organizáciu a prepočítaním `search_text`; mobilné karty bez zmeny |
| `/admin/stratene-najdene` | tento PR | meno psa, aktualizácia `search_text`, záznam bez súkromných údajov a bez zásahu do moderovania |
| `/admin/pomoc` | nasledujúci adaptér | názov/stručný text podľa Help Cases API |
| `/admin/clanky`, `/admin/steniatka` | nasledujúci adaptér | titulok/krátky popis až po bezstratovom zachovaní editorial body/SEO |
| `/admin/plemena` | nasledujúci adaptér | vybrané redakčné textové polia s Notion konfliktmi |
| `/admin/facebook-obrazky` | nasledujúci adaptér | text, plánovanie a súhlas iba cez kalendár publikovania |
| Podporné administračné tabuľky (kontrola údajov, katalóg služieb, podnety, automatizácie, partneri) | samostatné doménové adaptéry | iba polia, ktoré už ich existujúce API bezpečne povoľuje |

**Zámerne nerozšíriť práva cez všeobecný PATCH.** Základ V1 a prvé dve domény sú priamo v tomto PR. Zvyšné adaptéry majú ísť po jednej oblasti s vlastnými integračnými testami, až potom ako hotové.

## Kód a testy

- `components/admin-inline-edit-controls.tsx` – vizuálny štandard pre riadok
- `components/admin-directory-dashboard.tsx`, `components/admin-event-dashboard.tsx` a `components/admin-help-unified-table.tsx` – adaptéry služieb, podujatí a natívnej Pomoci psom
- `app/api/admin/directory/[id]/route.ts` – presný dvojstĺpcový serverový CAS
- `app/api/admin/help/[id]/route.ts` – dvojpoľový CAS len pre natívne Help kategórie
- `tests/admin-inline-edit-cross-modules.test.mjs`, `tests/admin-help-inline-edit.test.mjs` – bezpečnostné regresie vrátane SQLite CAS a zachovania ostatných dát

### Doplnené v tejto iterácii

- `/admin/organizacie`: dva textové vstupy priamo v karte; doménový úzky CAS setter zapisuje výlučne `name` a `short_description`. Publikačný preflight, adresy a médiá zostávajú samostatné.
- `/admin/stratene-najdene`: meno psa priamo v riadku; CAS zachováva slug, typ, stav aj šifrované súkromné údaje, pri zmene prepočíta vyhľadávacie pole `search_text`. Archív a duplicity nie je možné meniť rýchlou úpravou.
- Testy `tests/admin-inline-edit-organizations-lost-found.test.mjs` vrátane SQLite ochrany súbežného zápisu.

- `/admin/adopcie`: meno psa sa upravuje v desktopovej tabuľke, s atómovou kontrolou `updated_at`. Mení sa len `name`, `search_text`, `updated_at`, `updated_by`; publikovanie, organizácie a súkromné údaje sa nemenia. Test `tests/admin-inline-edit-adoptions.test.mjs`.
