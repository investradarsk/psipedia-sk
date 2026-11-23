# Psipedia.sk – Partner podania – krok 7/8 (spoločný Admin)

Dátum: 23. 11. 2026. PR #1566 (Draft). Nezasahovať do paralelnej prestavby spoločného Admin V5 ani navigácie návratu na /admin; zmena používa existujúci AdminShell.

## Výsledok

Vzniká nové kompaktné pracovisko **/admin/podania – Podania a dopyty**. V ľavom menu v skupine Komunita nahrádza samostatnú položku Dopyty (pôvodné /admin/dopyty zostáva funkčné a dostupné v detaile). Partneri ako správcovia účtov zostávajú samostatnou sekciou.

Prehľad je iba **read-only projekcia nad existujúcimi D1 tabuľkami**. Nezavádza druhú databázovú frontu, tabulku notifikácií ani svoj vlastný schvaľovací endpoint.

### Zdroj údajov / hranice

| Typ | Kanonický zdroj | Kam smeruje Detail |
| --- | --- | --- |
| Nový partnerský profil a úprava, podujatie, adopcia, stratený/nájdený pes, Pomoc psom | moderation_submissions (PARTNER_ACCOUNT) + JOIN na kanonickú entitu | Existujúci Admin partner submissions/events/changes/help-submissions podľa typu a operácie |
| Historické verejné hlásenia vytvorené bez registrácie | moderation_submissions (PUBLIC_REPORTER) | Detail pôvodného kanonického Admin profilu, typicky /admin/stratene-najdene/{id} |
| Žiadosti o prevzatie služby/organizácie/podujatia | partner_claims + partner_resources | /admin/partners/claims/{id} |
| Žiadosti o prevzatie adopcie, strateného psa, prípadu pomoci | partner_help_claims | /admin/partners/claims/{id} |
| Dopyty na služby | directory_inquiries | /admin/dopyty?id={id}#dopyt-{id}, na pôvodnej stránke sa zobrazí správna strana s daným dopytom |

**Bez duplicít:** pomocný automatický APPROVED partner_help_claims s presným systémovým rozhodnutím `Schválený nový partnerský profil` sa nezobrazuje ako samostatná žiadosť o prevzatie. Jeho pôvodné vytvorenie je už v moderation_submissions. Bežné manuálne žiadosti a staré rozhodnutia sa neschovávajú.

**Bez úniku kontaktov:** spoločná SQL projekcia nečíta `lost_found_dog_private_details`, nešifrovaný ani zašifrovaný e-mail Partnera, telefóny či obsah podaní. Neoverený `PUBLIC_REPORTER.submitter_ref` sa nikdy neinterpretuje ako Partner ID. Súkromné kontakty má iba originálne Admin pracovisko a chat je dostupný po overení existujúceho Admin prístupu.

### Vzhľad a navigácia

- Minimalistická tabuľka, kompaktné riadky, bez nových dekorácií; lokálny CSS modul a žiadne zmeny AdminShell/globálne CSS.
- GET filtre `kind=all|PARTNER|PUBLIC|CLAIM|INQUIRY`, `state=pending|history|all`, `q` (profil/ID Partnera/podania).
- Predvolené **Na vybavenie**; SUBMITTED/PENDING_REVIEW/QUARANTINED a PENDING claims, nové/prečítané dopyty. RETURNED čaká na partnera, preto spadá do histórie a zostane nájditeľný cez Všetky.
- DB stránkovanie **30 riadkov**, SQL COUNT, bindované parametre, stabilné poradie podľa priority, dátumu a ID; filter nie je len nad načítanou prvou stranou.
- Odkazy **Otvoriť podanie / Detail**, **Profil**, **Partner**, **Správy** podľa dostupnej väzby. Cudzí report bez Partner účtu nikdy neukazuje tlačidlo Chat.
- Žiadne kopírovanie osobných údajov do nových URL. Dopyt možno otvoriť priamo na správnej strane pôvodného Admin zoznamu.
- D1 načítavanie je v samostatnej Server Suspense hranici, aby pomalý dotaz neblokoval vykreslenie celej Admin navigácie.
- Ak je zdroj nedostupný alebo migrácia chýba, prehľad oznámi chybu a ponechá odkazy na originálne agendy. Nezobrazuje falošne prázdny výsledok.

### Technické súbory

- `lib/admin-submission-inbox.ts` – typy, bezpečné filtre, jedna SQL `UNION ALL` projekcia, COUNT/stránkovanie, odkazy, privacy.
- `app/admin/podania/page.tsx` – Admin auth, GET filtre, Suspense a tabuľka.
- `app/admin/podania/podania.module.css` – kompaktný scoped vzhľad.
- `lib/admin-navigation.ts` – položka Podania a dopyty, aktivácia starej /admin/dopyty pod novou skupinou.
- `app/admin/dopyty/page.tsx` a `components/admin-inquiry-dashboard.tsx` – presný fokus a správna klientská stránka pri otvorení známeho ID.
- `app/admin/partners/page.tsx` – odkaz do spoločného prehľadu, bez zmeny existujúcich Partner detailov.

### Testy

- `tests/partner-intake-step7.test.mjs` – in-memory SQLite/D1-like fixture: profil a historický report, nová/zamietnutá/ukončená moderácia, prevzatie, automatické OWNER bez duplicitnej žiadosti, nové/vybavené dopyty, viazané vyhľadávanie, správne odkazy, anonymita verejného odosielateľa, nezobrazovanie DRAFT.
- `tests/admin-ia.test.mjs` – nové kanonické menu + starý dopyt pod správnym aktívnym menu.
- `.github/workflows/partner-auth-ci.yml` – doplnené triggery a nový regresný test.
- V súlade so žiadosťou používateľa **nečakáme na CI**; tento dokument netvrdí jeho zelený stav. Nevydávať runtime testy za vykonané.

## Zostávajúci krok 8/8

Úplná integrácia: kontrola zmien od najnovšieho main vrátane paralelných PR, kontrola aktuálnych Cloudflare D1 migrácií, Worker/Next/Vinext build a E2E všetkých šiestich agend, partner email/outbox, úlohy moderácie, Notion review locks. Obzvlášť pred merge: v PR #1566 už krok 3 deaktivuje anonymný lost-found POST; bez otestovania novej Partner cesty nie je bezpečné PR nasadiť.

**Stav: PR Draft, žiadny merge ani produkčné nasadenie.**
