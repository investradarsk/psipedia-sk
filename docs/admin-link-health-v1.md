# Psipedia – kontrola nefunkčných odkazov (etapa 5/5)

Táto funkcia má dve bezpečne oddelené vrstvy. **Nezasahuje do článkov, profilov, Notion, D1, Cloudflare ani SEO nastavení**. Nič sa automaticky nevymaže ani neopraví.

## A. Rýchla kontrola v administrácii

Po nasadení otvor **Admin → Kvalita dát → Nefunkčné odkazy**:
`/admin/kontrola-odkazov`.

1. Voliteľne ponechaj zapnutých šesť hlavných stránok (homepage, články, plemená, adresár, podujatia, pomoc psom).
2. Ak chceš preveriť konkrétny článok alebo profil, vlož jeho verejnú URL **cestu** (napríklad `/clanky/nazov`). Môžeš vypnúť kontrolu základných stránok a overiť len vybraný záznam.
3. Klikni **Spustiť kontrolu**. Prehliadač načíta maximálne 8 verejných stránok a overí najviac 60 rôznych interných cieľov, vždy len 2 naraz. Z bezpečnostných dôvodov nezisťuje externé odkazy ani adresy administrácie a API.
4. Výsledok zobrazí **zdrojová stránka → cieľový odkaz → HTTP stav**. Nález kliknutím otvoríš v novej karte.
5. Stavy sú rozlíšené:
   - **Nefunkčný**: HTTP 404 alebo 410.
   - **Chyba servera**: HTTP 5xx; nemusí znamenať neplatný odkaz.
   - **Nepotvrdený**: timeout, ochrana 401/403, rate limit 429 alebo zablokovaná odpoveď.
   - **V poriadku**: HTTP 2xx/3xx.
6. Report môžeš uložiť ako JSON do svojho počítača. Nie je ukladaný do databázy ani nikam odosielaný automaticky.

Kontrola je **čisto čítacia**: len verejné GET/HEAD požiadavky bez prihlasovacích cookies. Sú v nej prísne limity a možnosť zastavenia. Dlhé hromadné kontroly alebo opravovanie profilov sa cez browser nevykonávajú.

## B. Automatická týždenná kontrola GitHub Actions

Workflow: `.github/workflows/link-health-audit.yml`.

- Spúšťa sa každý **pondelok o 03:17 UTC**, prípadne ručne cez **Run workflow**.
- Používa **Linkinator v8.1.0 (MIT)** – rovnaký checksum-pinned Linux binárny súbor ako existujúci `open-source-seo-suite.yml`. Žiadne nové produkčné npm závislosti.
- Skontroluje šesť pevných verejných stránok a najviac šesť ďalších URL, ktoré vyberie zo sitemap (po jednej z rôznych oblastí, s rotáciou vzorky každý týždeň).
- Nie je to kompletný crawler celého webu: **maximálne 12 vstupných stránok**, bez rekurzie, jeden súbežný HTTP požiadavok, timeout 8 sekúnd, iba odkazy na presnú doménu `psipedia.sk`.
- Rozlíši 404/410, 5xx a neoverené problémy. Aj keď Linkinator zaznamená pokazené odkazy, report sa uloží – neblokuje sa tým automaticky publikovanie.
- Na GitHub Actions → príslušný beh → **Summary** bude slovenské zhrnutie. V **Artifacts** pod `psipedia-link-health-<run_id>` bude JSON výpis, zdrojové stránky, stderr a Markdown report. Uchovávanie artefaktov: **30 dní**.
- Po nasadení je z admin obrazovky priama navigácia na GitHub workflow.

### Obmedzenia a náklady

- Týždenná kontrola začne až po merge workflow do hlavnej vetvy a pri povolených GitHub Actions. Reporty sa **neimportujú automaticky do administrácie**; v admine je samostatná manuálna kontrola a odkaz na výsledky GitHubu.
- Vzorka sa mení každý týždeň, ale nepokrýva automaticky všetky profily, články, obrázky ani externé zdroje. Zistiteľná chyba na stránke je podnet na ručnú kontrolu, nie istota, že obsah treba odstrániť.
- Žiadny Google Cloud API, platené skenovacie služby ani Cloudflare cron. Github Actions môžu čerpať minúty z príslušnej kvóty účtu a verejné GET/HEAD požiadavky majú bežnú minimálnu prevádzkovú záťaž.
- Aby sa nevyvolal masívny crawl, tento workflow nemá `--recurse` ani globálne `--sitemap` načítanie celého webu v Linkinatore; sitemap sa používa **iba na výber malej vzorky**.
- Súbory a prístupové údaje sa pri skene nečítajú; všetky HTTP kontroly majú povolené len verejné ciele.
- Čiastočne nedostupná sitemap neblokuje sken fixných šiestich stránok. Ak sken neoverí žiaden odkaz, report to výslovne označí, nie ako čistý výsledok.

## Čo skontrolovať po dokončení všetkých 5 etáp

1. Vo workflow zelená syntax, inštalácia checksum-pinned Linkinator a vytvorenie Summary + Artifacts.
2. Na `/admin/kontrola-odkazov` over základných šesť stránok a potom konkrétny zvolený profil.
3. Skontroluj rozlíšenie 404 vs. 403/429, timeout a obmedzenie počtu stránok/odkazov.
4. Odkazy na úpravu musia otvárať zdrojové stránky, nie automaticky meniť články.
5. Skontroluj, že na mobile zostalo rozhranie kompaktne použiteľné.

Podľa dohody sa CI neopravuje v priebehu etapizácie; teraz je hotových 5/5 bodov. Záverečné opravy riešiť, keď majiteľ oznámi **X**.
