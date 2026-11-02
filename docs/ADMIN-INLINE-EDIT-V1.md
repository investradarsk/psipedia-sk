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
| `/admin/organizacie` | nasledujúci adaptér | opakovane použiť doménový PATCH útulkov pre povolené organizácie, nie lifecycle |
| `/admin/pomoc-psom` ostatné kategórie | nasledujúci adaptér | iba povolené polia jednotlivých domén adopcií, hlásení a pomocných prípadov |
| `/admin/adopcie` | nasledujúci adaptér | názov/stručný text podľa canonical Adoption API; status iba cez lifecycle |
| `/admin/stratene-najdene` | nasledujúci adaptér | názov/lokalita podľa Lost & Found API |
| `/admin/pomoc` | nasledujúci adaptér | názov/stručný text podľa Help Cases API |
| `/admin/clanky`, `/admin/steniatka` | nasledujúci adaptér | titulok/krátky popis až po bezstratovom zachovaní editorial body/SEO |
| `/admin/plemena` | nasledujúci adaptér | vybrané redakčné textové polia s Notion konfliktmi |
| `/admin/facebook-obrazky` | nasledujúci adaptér | text, plánovanie a súhlas iba cez kalendár publikovania |
| Podporné administračné tabuľky (kontrola údajov, katalóg služieb, podnety, automatizácie, partneri) | samostatné doménové adaptéry | iba polia, ktoré už ich existujúce API bezpečne povoľuje |

**Zámerne nerozšíriť práva cez všeobecný PATCH.** Základ V1 a prvé dve domény sú priamo v tomto PR. Zvyšné adaptéry majú ísť po jednej oblasti s vlastnými integračnými testami, až potom ako hotové.

## Kód a testy

- `components/admin-inline-edit-controls.tsx` – vizuálny štandard pre riadok
- `components/admin-directory-dashboard.tsx`, `components/admin-event-dashboard.tsx` – prvé dva nové adaptéry
- `app/api/admin/directory/[id]/route.ts` – presný dvojstĺpcový serverový CAS
- `tests/admin-inline-edit-cross-modules.test.mjs` – bezpečnostné regresie vrátane reálneho SQLite CAS a zachovania cudzích dát
