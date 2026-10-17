# GEMINI-NOTION-FULL-FIELD-INTELLIGENCE-1

Základ po aktualizácii: fresh main `3d273603c65b8ea8bd7a1544c81bcfb3fbe91f1a` vrátane #849; pôvodný štart `af44771a2beeacf670adfa92a4bfd5446b15abec`, PR #848 potvrdene MERGED.
Bez merge, deploymentu, platených volaní, produkčných zápisov a migrácií. Živý koncept Nippo sa nemenil.

## Príčina a spoločné riešenie

Worker načítaval Notion metadata, ale model dostával pevný zoznam argumentov a builder zapisoval iba ich aliasy. Samostatné obsahové polia preto mohli zostať prázdne napriek faktom v opise.

Existujúci `GET /data_sources/:id` teraz poskytne modelu aktuálne názvy, typy, opisy, number format a existujúce výberové možnosti. Metadata so značkou `writable` dostane pri výskume aj pri prechode na funkcie. Z tej istej schémy sa pre každý beh vytvorí typovaný kontrakt `create_notion_draft({ fields, gemini_note? })`. Kľúče `fields` sú presné existujúce názvy Notion stĺpcov. Každé ďalšie funkčné volanie dostane rovnaký kontrakt.

Spoločná inštrukcia vyžaduje analýzu opisov, tabuliek, parametrov a relevantných podstránok, samostatné vyplnenie doložených faktov aj z vlastného opisu a prirodzenú odbornú slovenčinu. Významové priradenie robí Gemini, nie ručné parsovanie kynologického textu. Používateľské kategóriové prompty sa nemenia.

Všetkých 22 kategórií existujúceho registra používa tento mechanizmus: 10 Directory, 6 Events, 3 Help, Organization, Adoption a Lost/Found. Nevzniká nový worker, front úloh, databáza ani editor.

## Typy a presnosť

Podporované: title, rich text, select, multi-select, checkbox, number, date, URL, email, phone number a externé files. Súbory používajú verejnú HTTPS URL a existujúci Notion API tvar, bez interných file IDs, uploadu alebo zmeny R2 workflowu. Relations, people, formula, rollup a technické typy sú iba na čítanie.

- Čísla podporujú desatinnú čiarku, skupiny tisícov, rozpoznané jednotky a percentuálny formát. Prevod jednotiek sa vykoná len pri jednoznačnom cieli, napríklad `4000 g` → `4` pri `Hmotnosť (kg)`. Neisté rozsahy/približné čísla sa nehádajú.
- Select/multi-select používajú výhradne existujúce možnosti. Rozdiely diakritiky, veľkosti písmen a bežných oddeľovačov sa normalizujú; podporované sú základné áno/nie ekvivalenty. Zložitejšiu významovú voľbu robí Gemini podľa schémy, bez pridávania možností.
- Checkbox zachová explicitné false; neznámy stav sa nemení na false.
- Dátumy podporujú presný ISO/slovenský dátum, rozsahy a platné časové pásma. Neplatné dni sa nerolujú do ďalšieho mesiaca. `08/2024` sa nestane dátumom s vymysleným dňom.
- Neplatný nepovinný údaj neblokuje koncept. Poznámka uvedie pole a podľa bezpečnosti krátku hodnotu na kontrolu. Chýbajúce nerelevantné legacy aliasy Web/Organizátor v adopciách nevytvárajú upozornenia.
- Pôvodné argumenty zostávajú čitateľné iba pre kompatibilitu. Nová cesta fields nepoužíva pevné obsahové mapovanie.

## Zachované hranice a import

Spoločná politika chráni identity, slugy, kategórie, publikovanie, moderáciu, overenie/kvalitu, GEO/Google údaje, interné kontakty, sync hash a zámky. Nástroj ich neponúka a builder ich pri pokuse o zápis vynechá. Server vynúti existujúcu kategóriu/typ a súkromný stav; Directory marker nastavuje sám. Lost/Found naďalej chráni kontakty a presnú polohu aj v ľubovoľnom novom textovom poli, súbore a poznámke. Táto základná ochrana nenahrádza ľudskú kontrolu pred publikovaním.

Používa sa už existujúce pole Gemini poznámka; žiadne Notion stĺpce ani možnosti sa nevytvárajú. Poznámka zostáva oddelená od canonical obsahu a verejného profilu ako v #848.

Dispatch, podpis callbacku, append-only pôvod stránok, importné adaptéry, mapovania, zámky a existujúce editory sa nemenia. Technický kľúč číta identitu aj z fields; opis a poznámka ho nemenia. Zachované sú ochrany neistého POST a workflow replay. Možná obchodná duplicita vytvorí súkromný koncept s upozornením, technické opakovanie nevykoná druhý POST. Publikovanie zostáva manuálne.

Nové Notion obsahové stĺpce sa môžu vyplniť bez nového aliasu. D1 import naďalej prenáša existujúci canonical obsahový kontrakt; tento PR dynamicky nemení D1 schému ani nevytvára nové editorové polia.

## Overenie

Existujúce mocky a CI, bez nového testovacieho systému a bez skutočných Gemini/Notion/Psipedia požiadaviek:

- **331 offline worker/field testov:** všetkých 22 kategórií s dynamickým poľom bez pevného aliasu; šesť zdrojov s pokusom o systémový zásah, replay a možnou duplicitou. Pôvodné regresie #848 zostali zachované.
- **362 kontraktových testov:** foundation, dispatch/callback/provenance, canonical import, review/locks a obojsmerný sync.
- **Nippo regresia:** hmotnosť 4, plemeno, kríženec a zdravotné poznámky sa dostanú do Notion payloadu aj cez skutočný existujúci adopčný input adaptér. Čiastočný dátum zostane prázdny, informácia ostane v opise/poznámke. Bez upozornení Web/Organizátor a bez úniku poznámky do canonical payloadu.
- Existujúci Playwright Gemini review na **390/1280 px**, reject/restore/save a izolácia poznámky: prešiel. API autorizácia: prešla.
- **Build a validácia artefaktu:** prešli. **Lint:** 0 chýb, 103 warnings na novom main; cielený lint čistý.
- Config: **14 testov**; migration safety: **124 testov**; CI scope guard: prešli. Žiadne migrácie sa neaplikovali.

Živé správanie Gemini, prijatie generovaného JSON Schema poskytovateľom, aktuálne produkčné Notion metadata a reálny callback/import treba overiť až pri samostatne autorizovanom behu po nasadení. Offline testy dokazujú odovzdanie schémy a spracovanie výsledku, nie úspešnosť budúceho plateného výskumu alebo jeho faktografickú kvalitu.
