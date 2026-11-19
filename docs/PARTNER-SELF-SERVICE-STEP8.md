# Partner samoobsluha – krok 8/8: záverečný audit a bezpečný rollout

## Stav v PR #1437

**Kód krokov 1–8 je pripravený na audit, nie na okamžitý merge či produkčné nasadenie.**
Tento krok obsahuje opravu skutočného SQL partial-save problému a galerijného upload-only prepisovania, databázový regresný test a read-only migračný preflight.

### Rozsah

1. Jedna externá správa OWNER na kanonický záznam a neobmedzený počet rôznych záznamov na účet.
2. Partner session, registrácia, autorizácia, existujúce claimy a nové návrhy.
3. Schválenie nových služieb/organizácií, podujatí, adopcií, stratených/nájdených hlásení a pomoci.
4. Priamy post-approval zápis do kanonickej D1 bez kopírovania verejného profilu do druhej tabuľky; administrácia drží SEO, stav publikovania, interné a súkromné údaje.
5. Ochrana pred stratou údajov: len zmenené polia, verzia `updated_at`, OWNER v SQL, ochrana stavu médií, štandardné audit eventy.
6. Nové Help záznamy po schválení zostávajú DRAFT/draft, až následne ich môže publikovať administrátor.
7. Cache a geoprojekcie sa po aktualizácii obnovujú best-effort; neúspešná invalidácia **nie je** úspešnou synchronizáciou Notion.
8. Notion per-field trojcestný reconcile: neprepisovať konflikt na rovnakom poli bez hodnovernej field-revision informácie.

## Kritické zistenia auditu

### 8A – opravený chybový zápis pri jednotlivom verejnom poli Pomoci psom

Pôvodný Step 5 SQL pri zmene napríklad iba telefónu posielal parametre aj pre nepoužitý `search_text` výpočet. Výsledkom mohla byť chyba počtu bind parametrov. Nový `lib/partner-help-search-index.ts` vráti presne SQL priradenie a jeho parametre iba ak sa mení niektorý indexovaný stĺpec. Regresia `tests/partner-step8-regression.test.mjs` skúša reálne SQLite ukladanie iba kontaktu a indexovaného mesta a potvrdzuje zachovanie ostatných hodnôt.

### 8B – opravená implicitná strata galérie pri upload-only úprave

U Help adopcií a stratených/nájdených psov teraz vynechaný `galleryUrls` znamená „ponechať aktuálnu galériu“, nie „vyprázdniť ju“. Server číta existujúci kanonický `gallery_json`, uplatní 6-fotografový limit a unikátnosť a len explicitne odoslaný zoznam môže fotografie zmazať. Každý zápis má `updated_at` CAS proti súbehu.

### 8B2 – SQL-first adresár 0170 (priamy zápis nesmie zostať iba v JSON)

Partner editory teraz v spoločnom D1 batchi nastavujú zmenené SQL kontakty `public_phone`, `public_email`, `facebook_url`, `instagram_url` a zároveň používajú existujúce bezpečné 0170 mirror plannery pre kategóriové filtre, ordinačné hodiny (kde je schválené SQL pole) a sekundárne kategórie. SQL mirror má jediný `changes()=1` CAS guard priamo za kanonickým UPDATE; ak pôvodný zápis neprejde, celá transakcia sa vráti. Explicitné vymazanie kontaktu je **prázdny reťazec**, nie `NULL` (to znamená nemigrovaná hodnota). SQL mirror neoddeľuje publikačné statusy od Adminu.

**Preflight navyše vyžaduje fyzickú 0170 schému** vrátane kontaktných stĺpcov a tabuliek `directory_profile_filter_values`, `directory_profile_public_facts` a `directory_profile_additional_categories`. Migrácie 0171/0172 samy osebe 0170 nenahrádzajú. Aktuálny main má ďalšie opravy 0170 / Notion; pred merge sa musí uplatniť najnovší main a potvrdiť, že žiadny Partner writer nezaostáva za kanonickými verejnými read modelmi.

### 8C – chýbajúci spoľahlivý čas úpravy identického poľa Notion ↔ D1

Notion `last_edited_time` je timestamp celej stránky, nie jednotlivého poľa. Keď sa to isté pole zmení na oboch stranách po poslednom potvrdenom baseline, automatické „najnovšie vyhráva“ **nie je dokázateľné**. Aktuálne správne bezpečné správanie je explicitný `CONFLICT` bez tichého prepísania údajov. **Podmienka produkčnej aktivácie:** schválenie tejto konfliktovej politiky alebo vybudovanie per-field prenosu potvrdených revízií a auditovaného LWW pre všetky relevantné typy. Neoznačovať ako „hotová LWW synchronizácia“.

### 8D – synchronizácia vetvy s aktuálnym main

Prvý audit odhalil, že PR branch bol pozadu o **41 commitov**, vrátane novších opráv `lib/notion-directory-sync.ts`, `lib/directory-reviewed-sync-lock.ts`, `lib/directory-store.ts` a verejného filtrovania. **Nesmie sa force-pushnúť ani nahradiť main zo starého branch headu.** Aktualizovať PR vetvu z aktuálneho `main`, vyriešiť najmä `package.json`, zachovať novšie zmeny 0170/synchronizácie, a znovu spustiť všetky testy. Takisto znovu overiť počet behind commitov (main sa priebežne mení).

**Následný stav:** do PR vetvy bol zlúčený najnovší `main` v merge commite `1f351af2f99ee04a024d46b70a5af56bbe744143`; pri následnom porovnaní bolo `behind_by=0`. Naďalej je povinné overiť, že branch je aktuálny aj v okamihu merge a že nové testy prejdú na tomto kombinovanom kóde.

### 8E – posledný CI bol červený / Partner security workflow na Draft preskočený

Posledný overený výsledok mal zelený lint, migrácie, vizuálne a výkonové kontroly, ale globálny unit/integration gate zlyhal na viacerých testoch `directory-change-requests.test.mjs`, `directory-clubs.test.mjs`, `rendered-html.test.mjs`. Ich zdroje sa v tomto PR nemenili; nie je preto bezpečné označiť ich za spôsobené krokmi 1–8 ani za opravené. Potrebný je nový beh **po aktualizovaní main**, s diagnostikou všetkých zostávajúcich chýb. Samostatný `Partner platform security and UX` workflow bol počas Draft automaticky preskočený; musí reálne prejsť pred merge. Testy Step 7 DRAFT/claim v poslednom dostupnom globálnom logu prešli.

## Produkčný rollout – presné poradie a stop-podmienky

0. Vetva už prevzala `main` (`behind_by=0` pri audite). Pred merge opätovne overiť najnovší SHA, zachovanie 0170 SQL kontaktov/filtrov a nulové kritické konflikty.
1. Potvrdiť, že aktuálne verejné dáta sú v **kanonickej D1**, exportovať a bezpečne odložiť backup produkčnej databázy, záznam o presnom SHA a odkazy na pôvodné verzovanie.
2. Vykonať v produkcii **iba read-only** `scripts/partner-self-service-0171-0172-preflight.sql`: žiadne duplicitné aktívne membershipy, preveriť historické role, aktívnosť accountov, existujúce tabuľky a `PRAGMA foreign_key_check`. Každý nejasný výsledok = STOP. Pozrieť produkčnú históriu migrácií a či 0171/0172 už nie sú fyzicky prítomné; nepridávať slepo ich objekty.
3. Pred produkčným code deployom pripraviť **oddelený owner-authorized schema rollout**: iba explicitný manuálny dispatch / Cloudflare D1, správny databázový účet, presné kontrolované SQL, bez generického replay všetkých migrácií. Branch PR obsahuje obe SQL definície, ale generický `production-d1-migrate.mjs` ich zámerne **nepovoľuje**.
4. Ak bol prevádzkový postup potvrdený, aplikovať **0171**. Znova overiť jeden aktívny OWNER na resource, trigger/index a audit konverzie starých rolí; žiadne automatické rušenie prístupov.
5. Až po úspešnej kontrole 0171 aplikovať **0172**. Overiť tabuľku `partner_help_claims`, tri FK stĺpce, CHECK, tri jedinečné APPROVED indexy, tri PENDING indexy a `foreign_key_check`.
6. Spustiť zodpovedajúcu verziu Partner kódu **až po pripravenosti DB**, s plánom na vypnutie partner operácií pri náleze chyby. Pozor: ak merge do main sám spúšťa deploy, migračné poradie sa musí pripraviť ešte pred merge alebo technicky zabezpečiť feature gate; samotný Draft PR nie je automatická ochrana.
7. Testy Admin ↔ D1 ↔ Notion ↔ verejný web na izolovaných testovacích záznamoch: kontakt-only, zmena názvu, galéria upload/remove, status publikovania, pomoc/udalosti/adresár v každej kategórii, revokácia počas uloženia, súbežná zmena Notion a Admin, cache, SEO, audit a notifikácia.
8. Iba s dôkazom úplného zeleného CI, bezpečnej schémy, vyriešených Main konfliktov a schválenej Notion konfliktovej politiky označiť PR Ready; až potom merge a kontrola prevádzky. Pri zlyhaní **STOP – nič neprepisovať a nevynucovať merge**.

### Spustiteľné testy

```bash
npm run test:partner-step8
npm run test:partner-platform
npm run test:partner-auth
npm run db:check-migrations
npm run db:validate-clean
npm run lint
npm run build
```

**Nepoužívajte na 0171/0172** bežný `wrangler d1 migrations apply --remote` bez preflightu a odsúhlaseného scope: spustenie celej pripravenej migračnej reťaze by mohlo aplikovať ďalšie neaktivované migrácie. Workflow pred produkciou musí explicitne kontrolovať iba dvojicu plánovaných SQL súborov.
