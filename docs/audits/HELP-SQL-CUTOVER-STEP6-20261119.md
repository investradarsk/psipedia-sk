# Pomoc psom – finálny bezpečný SQL rollout (6/6, PR #1463)

**Stav:** pripravený kód a chránené kontroly v jednom Draft PR; **produkčný cutover, oprava chýbajúcich hodnôt, skutočné porovnanie s Notionom a produkčný backup zatiaľ NEBOLI vykonané.**

## Prečo už nepridávame migráciu

Cieľové SQL tabuľky už existujú. V krokoch 1–5 sme opravili deklarácie schémy, pravidlá zdieľaných SQL čítaní a zápisov, zámky, konzistentné kategórie v sitemape a pripravili **iba neexecutujúci** backfill plánovač. Nový SQL súbor 0175/0176 by bez preukázanej medzery skôr vytvoril kolíziu.

Technické polia `gallery_json`, `source_data_json`, `seo_json` a image display JSON sú **stĺpce existujúcich SQL tabuliek**, nie automaticky druhá databáza. Ich odstránenie sa týmto PR nezadáva.

## Jediná nová owner-controlled GitHub Action

**GitHub → Actions → Production Help SQL cutover verification (manual, no writes)**

Súbor: `.github/workflows/production-help-sql-cutover.yml`.

- PR event: iba SQLite/schema/read-only bezpečnostné testy, **nikdy bez produkčných tajomstiev**.
- `workflow_dispatch` na **aktuálnom main**, pod ochranou `environment: production`, s oprávnením `contents: read`; kontroluje presnú identitu repo, produkčnej D1, SHA a schémy.
- Používa rovnaký concurrency group `production-d1-migration` ako existujúce produkčné migrácie; nedá sa spustiť súbežne s nimi.
- Z pôvodného `scripts/production-editorial-storage-readonly.mjs` vyžiada aktuálne agregované počty bez PII, ID a textov.
- `scripts/production-help-sql-cutover.mjs` preverí výlučne pevným allowlistom `SELECT name FROM pragma_table_info('...')` 11 základných Help/partner/Notion/PII tabuliek a ich stĺpce; neaplikuje migráciu.
- Overí dostupnosť D1 Time Travel recovery bodu a uloží iba skrátený SHA-256 **fingerprint**, nie samotný bookmark ani databázový export.
- Získa z agregátov `blocked` alebo `structural_check_passed`. Ak chýba SQL schéma, existuje nezmapovaná historická adopcia/organizácia, sú prítomné staré lost-found SQL záznamy vyžadujúce typovú kontrolu, sú možne chýbajúce polia alebo osirelé Help Notion mapovania, workflow **zlyhá bezpečne**.
- Výstup je iba `.production-help-sql-cutover/report.json` a počtový inventár, retencia 14 dní. Nič do D1/Notion neukladá.

### 1. Pred Merge – povinné nezávislé kontroly

1. V PR musí byť zelené celé CI vrátane `npm run test:foundation`, nové step 6 offline testy, read-only D1 inventory PR job, sitemap a partnerské regresie. **Žiadne právo merge na základe jedného zeleného jobu.**
2. Skontrolovať aktuálny `main` a ostatné otvorené PR; na produkcii musia byť bez konfliktov existujúce partner SQL `0171/0172`. Tento PR nezavádza nové číslo.
3. Získať **nezávislý bezpečný read-only produkčný dôkaz** (existujúci Action `Psipedia – D1 canonical inventory` na main alebo Cloudflare read-only query), že zmenené public čítania neskryjú žiadny unikátny publikovaný legacy lost-found prípad. **Nový workflow nemožno pred prvým merge zavolať cez Actions UI na PR vetve**, pretože GitHub `workflow_dispatch` vyžaduje workflow na default branche.
4. Skutočne porovnať Admin → D1 → Notion → web pre reprezentatívne nové, publikované, archivované, odkontrolované a partnerom spravované záznamy v každej agende. Presnú hodnotovú zhodu nevie potvrdiť agregovaný SQL inventár.
5. V Cloudflare urobiť bezpečnú **nezávislú zálohu** a overiť proces obnovy. Time Travel recovery bookmark **nie je samostatný backup**. Neexportovať databázu do verejného GitHub artefaktu.
6. Pri akomkoľvek nesúlade, nezmapovanom legacy detaile, nepresnej Notion synchronizácii či chybnom URL/SEO: **STOP**, PR nemergovať. Nezverejňovať PII v CI/logoch.

### 2. Po bezpečne odsúhlasenom Merge – audit (jeden manuálny Action)

Actions → **Production Help SQL cutover verification (manual, no writes)** → Run workflow na `main`.

- **Mode:** `audit`
- **Confirmation:** `AUDIT-HELP-SQL-psipedia-sk-db`
- **Backup confirmation:** prázdne
- **Parity confirmation:** prázdne

Ak vygeneruje `blocked`, **žiadny ďalší krok, žiadne vymazanie/ALTER**. Červenú kontrolu treba vyriešiť konkrétnym bezpečným doplnením (nie hromadným resetom). `structural_check_passed` iba potvrdzuje štruktúru a agregáty, NIE Notion field-level paritu, publikovanie ani úplnosť zálohy.

**Pozor:** ak bežné CI/CD nasadzuje main automaticky, samotné Merge môže uviesť webové čítacie zmeny do produkcie **skôr**, než následný audit dobehne. Preto je premerge read-only kontrola povinná a návod nesľubuje automatický prednasadzovací zámok, ktorý v repozitári zatiaľ nie je potvrdený.

### 3. Po nezávislom funkčnom overení – postflight

Znovu ten istý Action, stále len read-only:

- **Mode:** `postflight`
- **Confirmation:** `POSTFLIGHT-HELP-SQL-psipedia-sk-db`
- **Backup confirmation:** `INDEPENDENT-BACKUP-VERIFIED`
- **Parity confirmation:** `ADMIN-NOTION-PUBLIC-PARITY-REVIEWED`

Tým vlastník **potvrdzuje, že nezávisle overil** zálohu a reálne hodnoty; testy to za neho nemerajú. Action po novom prejde rovnaké SQL počty, schému a checkpoint, bez UPDATE/DELETE.

Overiť ručne: dostupnosť `/pomoc-psom`, všetkých troch všeobecných kategórií, `/organizacie`, adopcií, stratených/nájdených; staré historické URL, sitemap, správne publikovanie/stavy, galérie, kontakty a zamknuté profily. Pri chybách zastaviť ďalšie čistenie.

## Rollback – bezpečnosť viacerých súbežných sekcií

- **Žiadny automatický D1 Time Travel restore.** Celodatabázová obnova by potenciálne zmazala práve uložené úpravy iných sekcií (adresár, plemená, podujatia). Rozhodnúť musí majiteľ a musí existovať plán obnovy konkrétnych zmien.
- Ak nastane chyba verejnej stránky po Merge, prioritne **vrátiť kód pred konkrétnym PR (revert/deploy predchádzajúcej verzie)**, pričom D1 zostane nezmenená.
- Ak ide o chybu Notion synchr./partn. oprávnení, pozastaviť príslušnú sync cestu a overiť D1 hodnoty; nikdy nerobiť hromadný import zo starej kópie naslepo.
- PR neobsahuje `DROP`, `DELETE`, automatický backfill executor ani migráciu. Automatická obnova ani fyzická záloha nie sú týmto Action predstierané.

## Záverečný výsledok 6/6

**Dokončené v kóde:** jeden PR, schémové vyrovnanie, read-only inventúra, idempotentný a manuálne kontrolovaný plánovač, SQL vlastníctvo, zámky, odstránenie duplicitných verejných listingov, protected verification Action, regresné testy a runbook.

**Nie je dokončené v produkcii:** potvrdenie reálnej paritnej hodnoty Notion/Admin/Public, vykonanie chýbajúceho per-field backfillu (iba ak existujú schválené receipts), samostatná záloha, prípadné preklopenie historických permalinkov. Pred tým nie je bezpečné tvrdiť „kompletná migrácia je hotová“ ani vymazať SQL technické JSON.

**Pravidlo:** jeden PR namiesto ďalších šiestich, ale bezpečnosť údajov má prednosť pred nulovým počtom kontrol.
