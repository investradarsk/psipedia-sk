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
| `/admin/pomoc-psom` – adopcia a stratené/nájdené | tento PR | meno psa aj v spoločnom prehľade, cez bezpečné pôvodné API adopcií a hlásení |
| `/admin/adopcie` | tento PR | meno psa so zachovaním slugu, statusu, vzťahu na organizáciu a prepočítaním `search_text`; mobilné karty bez zmeny |
| `/admin/stratene-najdene` | tento PR | meno psa, aktualizácia `search_text`, záznam bez súkromných údajov a bez zásahu do moderovania |
| `/admin/pomoc` | nasledujúci adaptér | názov/stručný text podľa Help Cases API |
| `/admin/clanky`, `/admin/steniatka` | tento PR | krátky popis s atómovou CAS kontrolou; Lexical, titulok, slug, SEO, väzby a médiá zostávajú nezmenené |
| `/admin/plemena` | tento PR | úvodný text so zachovaním FCI identity, SEO a väzieb; draft Notion writeback |
| `/admin/facebook-obrazky` | tento PR (len ručný koncept) | názov a text neschváleného ručného konceptu, bez zmeny schvaľovania či dátumu; ostatné príspevky v plnom editore |
| Katalóg služieb V3 | tento PR | názov a význam neaktivovaných DRAFT položiek a povolených vstavaných služieb, cez kanonické CAS API bez zmeny kategórií, ID a synonym |\n| Podporné administračné tabuľky (kontrola údajov, podnety, automatizácie, partneri) | samostatné doménové adaptéry | iba polia, ktoré už ich existujúce API bezpečne povoľuje |

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

### Redakčné sekcie (ďalšie dokončené adaptéry)

- `/admin/clanky`, `/admin/steniatka`: používajú jeden admin zoznam a jedno API `managed_articles`. Rýchla úprava má striktne jediný vstup `excerpt` a používa atomický `updated_at` compare-and-set, prednastavené redakčné dáta a Lexical JSON vôbec nezapisuje. Draft content writeback z pôvodného článkového API zostáva dostupný.
- `/admin/plemena`: rýchlo meniteľné len `intro` v `managed_breeds`, poradie/editácia FCI, názov, slug, fotografie a SEO bez zmien. Pri draft zázname sa zachováva existujúci Notion editorial writeback.
- Regresné testy `tests/admin-inline-edit-articles-breeds.test.mjs` preverujú, že editácia nemôže omylom prepisovať ďalšie polia a rešpektuje konflikty verzie.

### Zostáva po tejto etape

1. Facebook obrázky – inline text je hotový len pre ručné, neschválené koncepty; Notion a článkové príspevky a všetky pokusy o publikovanie zostávajú v plnom editore. Plánovanie a schvaľovanie zostáva v kalendári publikovania.
2. Katalóg služieb V3 – inline názov a popis je hotový iba v povolených DRAFT a built-in položkách. Aktívne/konfliktné možnosti zostávajú pod doménovým lifecycle schvaľovaním.
3. Agregovaný zoznam `/admin/pomoc-psom` pre adopcie a stratené/nájdené – tento PR už doplnil aj spoločnú tabuľku, s verzovaním a bez obchádzania doménového API.
4. Ďalšie špecializované administračné tabuľky: Podnety, Dopyty, Tipy, Hodnotenia, automatizácie a údaje kvality. Ich doménové pravidlá a API sa musia posúdiť individuálne.
5. Pred merge: kompletná oprava zlyhaných CI na PR #1176 a manuálne otestovanie ukladania / konfliktov. 

### Facebook obrázky a katalóg V3 (nové adaptéry)

- FB: `PATCH /api/admin/facebook-images/:id` používa `requireAdminMutation` s prísnou kontrolou pôvodu a iba `title` a `caption`; striktný `version` CAS. Neschválený ručný koncept, bez `article_id`, `notion_page_id`, súhlasu a bez odoslania: neovplyvňuje `scheduled_at`, status, schválenie, obrázok ani publikačné pokusy.
- V3: existujúci `PATCH /api/admin/service-catalog/options/:id` validuje názov, popis, synonymá a duplicity; in-row editor posiela nemenné `categories` a `group` spolu s `expectedVersion`. Žiadne generické SQL ani nový D1 kontrakt.
- Testy: `tests/admin-inline-edit-facebook-catalog.test.mjs` vrátane čistej klientsky bezpečnej konfigurácie triedenia adopcií `lib/adoption-admin-sorts.ts`.

- `/admin/pomoc-psom`: adopcie a stratené/nájdené používajú rovnaké rýchle upravovanie mena psa ako samostatné kanonické moduly; test `tests/admin-help-unified-dog-inline-edit.test.mjs`.

## Operačné zoznamy – aktuálna etapa

- **Dopyty** (`/admin/dopyty`): desktop má jeden editovací riadok pre stav `new/read/resolved` s `Uložiť/Zrušiť`; používa existujúce `PUT /api/admin/inquiries/:id`. Prijatá správa, kontakty a súhlasy sú nemenné. Mobil si zachováva pôvodné rýchle stavové tlačidlá.
- **Tipy** (`/admin/tipy`): desktop upravuje stav + *internú* poznámku cez existujúci `PUT /api/admin/news-tips/:id`. Uloženie nepresadí stav lokálne, ak server vráti chybu; Zrušiť obnoví začiatok interného textu. Pôvodný čitateľský text, kontakty a mobilné tlačidlá zostávajú nezmenené.
- **Hodnotenia článkov** (`/admin/hodnotenia`): desktop mení len moderačný stav `new/reviewing/resolved/dismissed`; pôvodné hodnotenie, text a väzba na článok sa nemenia. Server už kontroluje pôvod mutácie. Na mobile zostávajú pôvodné stavové akcie.
- **Podnety na úpravu profilov**: bez voľnej inline úpravy navrhnutého textu, pretože ide o dôkazné podanie používateľa. Zachované sú existujúce schvaľovanie a zamietanie s potvrdzovaním, bez skrytej zmeny dôkazného obsahu.
- Regresie `tests/admin-inline-edit-ops-queues.test.mjs` zahrnuté vo foundation teste.

### Čo zostáva

1. Admin tabuľky pre automatizácie a Kvalita dát: doménové práva, dávkové akcie a odlišné serverové kontrakty; nemajú podporovať generický zápis do polí.
2. Zvyšné pomocné a technické zoznamy (partneri, e-shopy, recenzie profilov, importy, auditné logy): skontrolovať ktoré obsahujú reálne redakčne editovateľné údaje, ktoré sú iba read-only či podliehajú schvaľovaniu.
3. CI: prejsť všetky zelené/červené checks po zmenách a odstrániť zostávajúce regresie. Tento PR sa nemerguje pred týmto krokom.


## Gemini a Kvalita údajov – desktopové adaptéry (PR #1176)

- **Gemini** (`/admin/automatizacie-gemini`): nový kompaktný prehľad 22 kategórií umožňuje pri každej upraviť `enabled`, frekvenciu v minútach (5–43 200), prípadný deň týždenného cyklu a limit konceptov (0–100). Každý riadok používa explicitné `Uložiť/Zrušiť` a existujúci `PUT /api/admin/gemini-automation` s doménovou serverovou allowlist. Žiadny automatický beh, manuálne spustenie, STOP ani platený prepínač sa tým nevolá. Hlavný STOP a externé bezpečnostné prepínače zostávajú nadradené. Pôvodný editor kategórie a mobilné ovládanie sú zachované; súbežne rozpracovanú detailnú kartu treba pred úpravou v tabuľke uložiť alebo zrušiť.
- **Kvalita údajov** (`/admin/kvalita`): otvorený nález možno priamo pred schválením opraviť len pre verejné polia kategórie `web`, `social`, `phone` a `email`. Zmena sa zapíše až tlačidlom **Schváliť upravený údaj**, nie pri opustení vstupu. Používa pôvodný `POST /api/admin/data-quality/missing/:id`, ale prijíma presne `action` a voliteľnú `value`. Server validuje hodnotu, kontroluje, či profil stále nemá dané pole, a ponecháva atómový `updated_at` CAS aj otvorený stav návrhu. Manuálne opravená hodnota aktualizuje evidenciu rozhodnutia; pôvodný zdrojový odkaz sa pri odlišnej hodnote neprisvojuje. Obrázky, adresy, registrácie, dátumy, statusy a súkromné kontakty nie sú editovateľné cez tento adaptér; ich pôvodné schvaľovanie zostáva.
- Mobil: nová úprava je skrytá pri šírke najviac 899 px; existujúce mobilné rozhodnutia a editor zostávajú.
- Regresie: `tests/admin-inline-edit-gemini-quality.test.mjs` sú zahrnuté do `test:foundation`. Pri merge ešte treba potvrdiť aktuálny stav CI, prípadné súbežné zmeny a manuálne otestovať uloženie i konflikt.


- **Recenzie profilov** (`/admin/recenzie-profilov`): pri recenzii v stave `PENDING_REVIEW` pribudla desktopová akcia **Upraviť stav → Schváliť/Zrušiť** s explicitným potvrdením. Používa kanonický `PATCH /api/admin/profile-reviews/:id` so stavovým CAS. Akcie `REJECT`, `HIDE`, `REMOVE` a `RESTORE` zostávajú len v pôvodnom moderátorskom detaile, ktorý vyžaduje dôvod, kde je potrebný. Text a hodnotenie používateľa sa nikdy neprepisujú.

**Naďalej nedokončené:** ďalšie administračné moduly (partneri, e-shopy, importy), samostatný Facebook publikačný workflow, technické/auditné zoznamy a finálna kontrola.
