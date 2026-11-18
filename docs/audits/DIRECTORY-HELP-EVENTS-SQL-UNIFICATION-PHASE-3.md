# Psipedia – SQL zjednotenie 3/4: Admin / verejný web / Notion – riadený cutover

Stav 17. 11. 2026: **pripravené a testované adaptéry**, produkčné prepnutie
**nie je aktivované**. Je to zámer: fáza 2 obsahuje zatiaľ iba návrh SQL
schémy, neexistuje potvrdený produkčný backfill. Prepínať verejné čítanie
skôr by znamenalo zobraziť neúplné profily.

## Čo pribudlo do PR #1413

### 1. Spoločný serverový SQL parity reader
Súbor `lib/directory-sql-cutover-parity.ts`.

- Pri porovnaní číta aktuálny `directory_profiles`, budúce SQL stĺpce
  `public_phone`, `public_email`, `facebook_url`, `instagram_url`,
  tabuľku ďalších kategórií, textových faktov a 21 select filtrov.
- Porovnanie používa **súčasné verejné/Admin resolvery** historického JSON
  aj presný platný register filtrov; v konfliktných prípadoch nehádame hodnotu.
- Výsledok obsahuje **iba názov poľa a typ rozdielu**, nikdy obsah kontaktu,
  zdrojový JSON, meno, adresu alebo citlivé údaje.
- Rozlišuje: nespravený backfill, rozdielnu hodnotu, historický alias po
  výslovnom vymazaní, existujúcu hodnotu iba v SQL, neznámy kľúč,
  nesprávnu kategóriu, neplatnú hodnotu filtra a chybný JSON.
- Ak nová schéma chýba, vráti `not_deployed`, nie falošný zelený výsledok.
- `no_detected_differences` **nie je** potvrdenie Notion parity ani
  povolenie vypnúť historické čítanie.

### 2. Bezpečný operátorský náhľad v Admin API
Existujúci chránený GET `/api/admin/directory/{id}?sqlParity=1` vykoná
iba SELECT kontrolu. Autorizácia existujúceho Admin API zostáva povinná.

Bežný GET bez tohto parametra sa **nezmenil**. Nový náhľad nemení uložené
profily ani ich verejné zobrazenie, nevolá Notion a nevyžaduje nový Admin UI.

### 3. Staged SQL writer pre oba smery budúcej synchronizácie
Súbor `lib/directory-sql-cutover-write.ts`.

- Jeden kanonický typ patch pre úpravy z Adminu aj Notion:
  iba zadané kontakty, druhé kategórie, schválené textové fakty a
  kategóriové Notion select filtre.
- Kontakty sú **čistý text**: neposudzuje sa email/URL/telefónny formát.
- `undefined` znamená bez zmeny; prázdny text znamená úmyselné
  vymazanie. `[]` pri ďalších kategóriách je explicitné zrušenie.
- Zápisové SQL kontroluje ID, primárnu kategóriu, stav záznamu,
  `updated_at` CAS a parameterizuje hodnoty.
- D1 batch používa kontrolu `changes()` po CAS: pri konflikte vyvolá
  SQL chybu **pred** zápismi vzťahových údajov a databázová transakcia sa
  musí vrátiť späť. Samostatné unit testy pokrývajú aj súbežnú úpravu.
- Odmieta cudzie filter ID, neplatné filter hodnoty, pokusy zapísať
  vzťahové Plemeno/Klub či voľný text na miesto Notion select.
- Writer **nie je volaný zo žiadneho produkčného handlera**. Nemá
  feature flag, ktorý by ho náhodou zapol bez migrácie a parity.

### 4. Existujúce Help a Events zostávajú na SQL
Pre `managed_events`, `help_cases`, `help_organizations`,
`adoption_dogs` a `lost_found_dog_reports` už existujú hlavné SQL
tabuľky. V tejto fáze im nevytvárame paralelné kópie ani nemeníme Notion
webhooky. Ich priame Admin/Notion/public zápisy a čítanie sa musia
overiť reálnymi záznamami pred deklarovaním produkčnej parity.

## Automatické testy

- `tests/directory-sql-cutover-parity-phase3.test.mjs`: stará schéma,
  porovnanie SQL s historickými hodnotami, explicitné vymazanie,
  neexistujúci záznam, neplatný JSON, select filtre, Admin autorizácia.
- `tests/directory-sql-cutover-write-phase3.test.mjs`: atomické
  inkrementálne zmeny, kategóriové väzby, prázdne hodnoty, CAS konflikt,
  pretek medzi preflightom a zápisom, neplatné polia a SQL injection.
- Zapojené do existujúceho PR workflow s izolovanou SQLite.

## Kritériá pred aktiváciou – platia ako blokátory

1. Overiť migračnú históriu po merge #1414 (0169 už existuje na main)
   a pripraviť samostatnú novú číslovanú migráciu až po auditnom preflight-e.
2. Schváliť a **aplikovať** číslovanú SQL migráciu až po zálohe a dry-run.
3. Získať reálny read-only report fázy 1; per-field backfill iba
   hodnoty, pri ktorých poznáme platný zdroj a pravidlo vymazania.
4. Dosiahnuť úplnú parity pre všetky publikované profily; zobraziť a
   vyriešiť konfliktné pole v Adminovi, nie získať iba testovací zelený stav.
5. Do rovnakého kontrolovaného nasadenia zahrnúť **všetky** zápisové
   cesty Admin / Notion / partner a **všetky** verejné SQL query (karty,
   filtre, vyhľadávanie, detail) vrátane druhých kategórií.
6. Potvrdiť E2E na reálnych 10 kategóriách, päť agend Pomoci psom,
   podujatia a Notion v oboch smeroch. Až potom je dovolené prepnúť
   čítanie a až vo fáze 4 odstrániť historický fallback.

**Výsledok PR vo fáze 3 je zabezpečený most ku cutoveru, nie ešte
produkčne aktivovaný jednotný SQL systém.** Bez bodov vyššie by
deklarovanie fázy 3 ako hotového produkčného prepnutia nebolo pravdivé.
