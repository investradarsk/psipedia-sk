# GEMINI + NOTION — samostatný pracovník (bez produkčnej aktivácie)

Architektúra: Psipedia admin -> existujúci D1 harmonogram -> Cloudflare Cron (len dispatch) -> GitHub Actions -> Gemini Interactions API s Google Search a vlastnými nástrojmi -> priame Notion API čítanie/zápis konceptov -> HMAC callback do Psipedia admin.

Nezavádza sa ďalšia D1 migrácia; používa tabuľky z 0113 a už aplikovanej 0119. Nie je potrebné spúšťať žiadnu migráciu. Psipedia nespracúva kandidátov, duplicity ani polia Notion. Signed callback nahrádza Notion webhook, pretože vie presne spojiť ID úlohy s výsledkom.

## Bezpečnostné vypínače (ponechať vypnuté bez osobitného súhlasu)

Cloudflare: GEMINI_EXTERNAL_AGENT_ENABLED predvolene unset; nastav true iba pre explicitný manuálny test externého pracovníka. NOVÁ nezávislá poistka GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED musí zostať unset/false, kým sa výslovne neschváli automatické plánované spúšťanie. Aj keď je manuálny režim zapnutý, cron bez tejto druhej hodnoty neodošle platenú úlohu. Secrets: GITHUB_ACTIONS_DISPATCH_TOKEN (token len pre dané repo, Actions write) a GEMINI_AGENT_CALLBACK_SECRET.

GitHub Actions secrets: GEMINI_AGENT_API_KEY, GEMINI_AGENT_NOTION_TOKEN (úzko oprávnená Notion integrácia), PSIPEDIA_AGENT_CALLBACK_SECRET (identický ako secret na Cloudflare).

GitHub Actions vars: NOTION_DIRECTORY_DATA_SOURCE_ID, NOTION_EVENTS_DATA_SOURCE_ID, NOTION_HELP_DATA_SOURCE_ID a GEMINI_AGENT_PAID_ENABLED. Platený režim funguje iba pri GEMINI_AGENT_PAID_ENABLED=true; inak skript nevolá Gemini ani Notion.

Notion ID pre Pomoc psom musí ukazovať na help-case data source so správnou schémou a byť oprávnené k integrácii; nepoužívajte sibling databázu iba s Name title. Diagnostické ID sú v docs/GEMINI-NOTION-EVENTS-HELP-CONTRACT-AUDIT.md; worker smeruje iba podľa konfigurácie.

## Bezpečnosť

- Jedna aktívna úloha globálne: existujúci čiastočný unique index v 0119.
- Externé úlohy dostávajú status RUNNING hneď pri rezervácii; starý Cron runner vyberá iba QUEUED. V externom režime je starý Cron runner navyše vypnutý.
- Nejednoznačný stav odpovede GitHub dispatch zostane RUNNING a blokuje nové úlohy, kým ho človek nepreverí. Bez automatického opakovania platených požiadaviek.
- Maximálne 5 konceptov na beh a najviac 9 požiadaviek Gemini Interactions (počiatočná + 8 nadväzujúcich). Konzervatívna poistka najviac 10 zaradených Gemini úloh mesačne v spoločnej fronte; nejde o priamy finančný limit.
- Číta sa celá cieľová Notion data source; neúplné načítanie sa odmietne. Kontrola duplicít a vyplnenie polí prebieha výhradne v agentovi.
- Adresár zachováva existujúce draft gates. Podujatia zapisujú iba Stav=Nápad/Na kontrolu; Help iba textové Psipedia stav=draft bez Slug. Vyžaduje sa verejný HTTPS zdroj; agent nikdy nezverejňuje.
- Mapovanie podľa overeného Notionu: **Adresár** má v poli `Kategória` technické slugs (`veterinari`, `salony-a-sluzby`…), preto sa nemenia; **Podujatia** majú v `Typ podujatia` slovenské jednotné hodnoty (`Výstava`, `Seminár`, `Tréning`, `Iné`…), preto worker mapuje URL slug na kanonický typ. Neznáme slugy podujatí sa odmietnu pred zápisom. Pre Pomoc psom treba pri akceptácii zvlášť potvrdiť skutočné polia.
- Neopakovať Notion POST /pages po neistom výsledku; pred opätovným spustením sa musí skontrolovať Notion.
- Callback je HMAC SHA-256 s obmedzenými číselnými údajmi a je platný iba raz počas RUNNING jobu.

## Kvalita nových adresárových konceptov

Samostatný pracovník pri nových profiloch služieb cielene dohľadáva **verejné kontaktné a profilové údaje** z primárnych zdrojov: telefón, e-mail, úplnú adresu (ulica, číslo, PSČ), okres, kraj, Facebook/Instagram, služby a doložené kvalifikácie. Pre veterinárov odmieta vytvoriť poloprázdny koncept, ak po validácii Notion polí nie sú dostupné aspoň dva z troch typov údajov: telefón, e-mail, úplná adresa. Neoverené hodnoty zostávajú prázdne. Nemení sa schvaľovanie, status ani publikovanie.

Existujúca Notion **Adresár** data source má oddelené URL polia **`Logo URL`** (nové, manuálne pridané 12. 10. 2026) a **`Hlavný obrázok URL`** (používa ho štandardná Psipedia synchronizácia pre hlavný obrázok). Gemini zapisuje iba **priame HTTPS URL obrázkov z domény oficiálneho webu subjektu** s rozpoznateľnou obrazovou príponou. Uprednostňuje titulnú fotografiu pre hlavný obrázok; ak neexistuje, môže použiť overené rastrové logo. SVG/GIF logo sa uchová iba v samostatnom poli `Logo URL`, nie ako hlavný obrázok pre aktuálnu R2 konverziu. Pri hlavnom obrázku sa dopĺňa zdroj webu a alt text. Samostatná synchronizácia loga na verejný web nie je súčasťou tejto opravy.

Tento kvalitativny kontrakt sa uplatní **len na nové externé Gemini koncepty** po merge a produkčnom nasadení; existujúce záznamy vrátane prvého testovacieho konceptu AmyVet sa samy spätne nedoplnia. Nie je to povolenie na automatický beh a nie je potrebná D1 migrácia.

## Dôležité obmedzenia a akceptácia

Google Search s custom functions v Gemini je stále Preview. Kompatibilitu so skutočnou schémou Notion a modelom gemini-3.8-flash treba potvrdiť kontrolovaným live testom až po výslovnom povolení.

Pevný rozpočtový strop 5 EUR nie je v tomto kóde presne vynútiteľný: po zapnutí nastavte kvóty / billing upozornenia u poskytovateľa a sledujte spotrebu. Žiadny platený test nesmie začať pred výslovným súhlasom.

Nastavovanie zostáva na /admin/automatizacie-gemini. GitHub workflow nemá plánovaný trigger, iba workflow_dispatch. Notion koncepty sa môžu existujúcou synchronizáciou dostať do D1, ale nesmú byť automaticky publikované. Oznámenie o výsledku sa ukladá do existujúceho systému admin upozornení a história zobrazuje počty; Notion-origin webhook a odkazy na každú novú stránku nie sú súčasťou tejto fázy. Odoslanie do iPhone push závisí od nastavenia už existujúcej služby administrátorských upozornení.

Pred akoukoľvek aktiváciou: preveriť staré QUEUED/RUNNING joby v 0119; overiť offline testy a build; povoliť iba jeden kontrolovaný manuálny beh s max 1 konceptom; `GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED` musí byť false/unset aj po zapnutí manuálneho režimu; overiť presnú schému Notion, účtovanie a stav histórie. Následná automatizácia vyžaduje osobitné explicitné povolenie druhej poistky. Nemergovať ani nenasadzovať bez schválenia.


## Kontrola a publikovanie nových konceptov priamo v administrácii

Nový externý pracovník pri vytvorení **adresárového** profilu v Notione zapíše
`Vytvoril = Gemini automatizácia`. Tento pôvod slúži ako explicitné označenie
konceptu a neudeľuje žiadne právo na automatickú publikáciu.

V `/admin/automatizacie-gemini` má každá karta služieb rozbaľovací blok
**Koncepty z automatizácie**. Jeho obsah sa na požiadanie administrátora
načíta **priamo z Notion data source** (kategória + pôvod), bez čakania na
hodinové zrkadlenie do D1. Každá položka otvorí vlastný admin náhľad,
odkaz na editáciu originálu v Notione a explicitné dvojstupňové potvrdenie
publikovania. Verejne overiteľné údaje sa nemenia samotným náhľadom.

Tlačidlo publikovania iba nastaví v konkrétnom Notion zázname
`Stav = Publikované` a `Psipedia stav = Publikované`.
Až následný hodinový `runNotionDirectorySyncSweep` vytvorí/zmení kanonický
profil v D1 a na verejnom webe; nie je to okamžité nasadenie, a preto
rozhranie hlási **Čaká na synchronizáciu**. Neexistuje automatické
publikovanie pri vytvorení Gemini konceptu. Nové Notion záznamy s
`Stav = Ready` a `Psipedia stav = Koncept` sa po importovaní do
adresára ukladajú ako kanonické koncepty, nie ako publikované profily.
Ručný editor `/admin/adresar/[id]` zostáva kanonickou cestou pre
ďalšie úpravy po synchronizácii.

Endpointy sú len pre autentifikovaného administrátora; znovu načítajú
identitu, kategóriu, Notion data source, pôvod a stav konceptu pred
zápisom. Zmeny metadát, tokeny a vyhľadávanie sú stále oddelené od
publikovania. Prvé známe testovacie AmyVet bolo manuálne označené
ako Gemini koncept, bez zmeny jeho nepublikovaného stavu.

## GEMINI-EXTERNAL-AGENT-RECOVERY-1 — offline režim a kompatibilita (13. 10. 2026)

- Worker používa REST /v1beta/interactions s modelom gemini-3.8-flash. Kontrakt: https://ai.google.dev/gemini-api/docs/interactions-overview a https://ai.google.dev/gemini-api/docs/function-calling.
- Volania sú sekvenčné, nie súčasne zmiešané: prvá požiadavka používa iba google_search. Až po stave completed s krokom google_search_call nasleduje previous_interaction_id s custom functions search_notion a create_notion_draft. Každé pokračovanie znovu posiela tools (turn-scoped). Tento postup obchádza známu Preview nestabilitu miešania nástrojov, ale produkčnú kompatibilitu treba potvrdiť live testom.
- Fail-closed stavy: in_progress, incomplete, failed, cancelled, neznámy stav; requires_action bez validných function_call/call_id; duplicitné identifikátory a chýbajúce Google Search dôkazy. Tieto stavy nespôsobia úspešný callback.
- Maximum deväť Interactions požiadaviek na job (výskum + prvý funkčný krok + sedem pokračovaní); timeout 150 s pre Search, 90 s pre funkcie. Bez odpovede sa automaticky neopakuje platená požiadavka.
- Logujú sa iba bezpečné kódy ako GEMINI_HTTP_400_TOOLS, GEMINI_TIMEOUT alebo GEMINI_STATE_INCOMPLETE a číselné metriky. Nie raw API chyby, kľúče, prompt ani súkromné Notion dáta.
- Neistý výsledok Notion POST /pages (timeout, sieťová chyba, HTTP 5xx alebo neplatné JSON) znamená NOTION_CREATE_UNCERTAIN. Bez automatického opakovania; pred novým jobom musí operátor skontrolovať Notion.
- Callback HMAC SHA-256 sa odošle po ukončení len raz. Ak výsledok doručenia nie je istý, proces skončí neúspešne. Najprv treba skontrolovať aktuálny stav jobu v Psipedii; callback naslepo neopakovať.
- Pred create_notion_draft musí prebehnúť search_notion v predchádzajúcom funkčnom kole; adresár navyše opakovane číta cieľový Notion pre duplicitné záznamy. Povolené sú iba koncepty.

### Offline akceptácia

Spustiť: node --experimental-strip-types --test tests/gemini-external-agent.test.mjs tests/gemini-external-worker-offline.test.mjs

Mock e2e test spúšťa workera ako subprocess s node --import a zablokovaným reálnym fetch. Všetky adresy sú explicitne mockované, neznáme URL zlyhajú. Syntetický GEMINI_AGENT_PAID_ENABLED=true existuje len v izolovanom testovacom podprocese s mock fetch a nie v GitHub Actions vars, Cloudflare alebo produkcii. Testované: úspešný draft a podpísaný callback; chybný HTTP 400 TOOLS; neúplná odpoveď; neznáme a nesprávne zoradené tools; neistý Notion create bez opakovania; odmietnutý callback bez opakovania.

### Čo ešte zostáva

1. Pred prvým manuálnym plateným behom samostatne schváliť rozpočet a aktiváciu, auditovať staré RUNNING/QUEUED joby, overiť konkrétnu Notion data source a jej schému, nastaviť externé kvóty/rozpočtové upozornenia. Prvý schválený job musí mať limit 1 koncept. Mesačná poistka počtu behov nie je tvrdá finančná hranica.
2. Potvrdiť živý end-to-end: vyhľadanie Google Search → Notion read/duplicate → Notion draft bez publikovania → podpísaný callback → história/notifikácia v admine; preveriť latenciu, účet a prípady zlyhania.
3. Až po úspešnom ručnom teste a ďalšom schválení môže vzniknúť plánovaný režim. Nezávislá poistka GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED zostáva dovtedy unset/false.

Tento PR nezapína GEMINI_AGENT_PAID_ENABLED, GEMINI_EXTERNAL_AGENT_ENABLED ani GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED, nespúšťa živé služby a nedotýka sa mapovania Events/Help (úloha 07).


## GEMINI-EXTERNAL-NOTION-INTEGRATION-2 — worker integration

Existing worker now calls `buildNotionEventsHelpDraft()` (including its `assertNotionEventsHelpUnique()` gate) for Events/Help. No second worker, bridge, CMS, migration or publication path is introduced. PR #808's sequential Interactions, request limits, Search-first function ordering, Notion uncertainty handling and one HMAC callback remain in place.

Actual worker capability, separate from the broader admin catalog:

| Section | Supported draft routes | Blocked routes |
| --- | --- | --- |
| Events | vystavy, preteky, seminare, treningy, stretnutia, dalsie | unknown slugs |
| Help cases | docasna-opatera, zbierky, dobrovolnictvo | adopcia, utulky, stratene-a-najdene; unknown slugs |
| Directory | veterinari, treneri, kynologicke-kluby, chovatelske-kluby, chovatelske-stanice, salony-a-sluzby, hotely-a-opatrovanie, vencenie, fyzioterapia, dalsie-sluzby | legacy psie-skoly / utulky-a-zachrana; unknown slugs |

Dedicated Help categories still require separate implementation against their existing canonical adoption, organization and lost/found agendas. They are rejected before job reservation in Psipedia and before Notion/Gemini calls in the worker. The register alone is not a capability declaration. Directory's existing functionality is preserved; this task's new category E2E coverage concerns Events and generic Help.

Events require the audited rich_text type, date start, organizer, location, summary, description and field-linked evidence. Optional start_time/end_time serialize verified HH:MM into Čas začiatku/Čas konca; end_date into Koniec. Current Europe/Bratislava date is computed at create time. Help writes the canonical category slug and rich_text Psipedia stav=draft, retains sources and evidence in Popis, and deliberately omits Slug. Optional contact/organization require evidence. No Ready, published status, Sync stav or publish API call is emitted by these routes.

The worker reads configured data-source metadata and a complete paginated snapshot initially and again immediately before every candidate POST. Wrong schemas/types, additional unaudited editorial gates, publish-only options, invalid/missing query results, partial property results and broken/repeated cursors stop the job without writing. Full snapshots include all categories for conservative duplicate detection; duplicates and ambiguous identities increment duplicate_count. Source matching also checks Help's embedded Popis URLs and secondary sources. Confirmed drafts are retained locally, so eventual consistency in a subsequent Notion scan cannot permit duplicate creation within the run. Workflow global concurrency remains unchanged; this cannot guarantee atomic uniqueness against independent human writers.

Only URLs from provider `model_output.content[].annotations[]` with `type=url_citation` in the completed Google Search research turn can back Events/Help candidate sources. Plain model text and create-function arguments cannot add provenance. This wire shape was checked against Google's generated Python SDK at commit f1499bb86c707d51b5b2684ff9423653cc74895c:
https://github.com/googleapis/python-genai/blob/f1499bb86c707d51b5b2684ff9423653cc74895c/google/genai/_gaos/types/interactions/urlcitation.py
and its textcontent.py / googlesearchresult.py siblings. Search result steps themselves carry search_suggestions, not source URLs. Missing citations fail closed. Redirect grounding URLs remain disallowed by the existing category contract; direct public citations must be confirmed before live acceptance. Citation provenance and model field attribution do not independently prove factual accuracy; human review remains compulsory.

Notion create timeout/network/5xx/invalid JSON/missing ID is uncertain and never retried. The signed callback updates only the original external RUNNING job through a conditional UPDATE; repeated or concurrent completions receive 409 and cannot create a second run-history entry. Callback delivery itself is never automatically retried.

Offline validation commands:

```
node --experimental-strip-types --test tests/gemini-automation-*.test.mjs tests/gemini-events-*.test.mjs tests/gemini-external-agent.test.mjs tests/gemini-external-worker-offline.test.mjs tests/gemini-notion-events-help-fields.test.mjs
npm run build
node scripts/check-ci-scope.mjs
```

Mocks cover all nine new routes, actual category schemas, wrong database/type, absent/unsafe/uncited source, missing evidence, incomplete/partial scan, complete pagination, fresh duplicate/ambiguous identity, stale-scan repeat creation, Gemini timeout, uncertain writes, concept limit and callback signatures/replay/concurrency. All network is intercepted in subprocesses. Synthetic paid flags are confined to those mock children. The existing CI workflow now runs the category helper suite alongside worker E2E tests and tracks all gemini-notion scripts.

Before one controlled live test: review/merge this PR separately; verify exact configured data source and integration read/write access using read-only inspection; recheck Help rows/taxonomy and all editorial gates; confirm direct citation wire data for the chosen model; inspect existing RUNNING/QUEUED jobs and uncertain Notion writes; approve budget and manual activation separately; use max_new_concepts=1; verify draft, signed callback, original job history and notification. Scheduled execution remains off. No live Gemini/Notion request, migration, production deployment or published-profile edit was performed by this integration task.
