# PRODUCTION-D1-0129-ROLLOUT-1 — Gemini manuálny poradovník

## Účel

Pripraviť samostatný, ručne schvaľovaný produkčný rollout migrácie
`0129_gemini_external_manual_queue.sql` z existujúceho návrhu [PR #852](https://github.com/investradarsk/psipedia-sk/pull/852).

**Tento PR nenasadzuje ani neaplikuje migráciu.** Produkčný apply je samostatná
operátorská akcia po merge a samostatnom schválení.

Migrácia **iba mení dva D1 indexy** na existujúcej tabuľke
`gemini_manual_background_jobs`:

- Odstráni starý globálny unikátny index pre `QUEUED` + `RUNNING`.
- Nahradí ho unikátnym indexom len pre `RUNNING` (najviac jedna platená úloha naraz).
- Pridá čítací index FIFO pre staršie manuálne potvrdené čakajúce úlohy.
- **Ponechá** unikátny index na `stable_key` pre aktívne úlohy, historické záznamy,
  nastavenia kategórií, všetkých 22 promptov, callback a Notion údaje.

SQL bajty musia zostať presne rovnaké ako v PR #852; SHA256
`ef44cca9fc23decee10714c2d7ba54fb54be49428856e82c5fd782cd19e37b1d`.

## Operátorský postup (iba po samostatnom produkčnom schválení)

1. Zabezpečiť, že 0128 bola aplikovaná (presná predchádzajúca migrácia v
   `d1_migrations`). Staršiu 0128 neopakovať.
2. Zaistiť, že **žiadne** Gemini úlohy nie sú v stave `QUEUED` ani `RUNNING`.
   Prípadné stále bežiace/nejasné platené úlohy riešiť manuálne; neoznačovať ich
   naslepo za dokončené. Existujúci plánovač musí počas rollout okna zostať pokojný.
3. Po merge tohto PR do `main` a **osobitnom schválení produkčného zápisu**:
   GitHub Actions → `Production D1 Migrate` → `Run workflow` na `main`.
   - `target_migration`: `0129_gemini_external_manual_queue.sql`
   - `confirmation`: `APPLY-0129-psipedia-sk-db`
   - `environment`: production, existujúce schvaľovanie prostredia.
4. Existujúci workflow vykoná chránený read-only preflight (presný ledger 0128,
   pin SHA256, správna D1, nulové QUEUED/RUNNING, staré indexy bez 0129 driftu),
   vytvorí D1 Time Travel recovery bookmark, opäť preverí databázu bezprostredne
   pred aplikovaním, následne vykoná **jeden** scoped SQL apply a postflight.
5. Po úspechu vyžadovať `APPLIED` a skontrolovať existenciu indexov
   `idx_gemini_manual_only_one_running` a `idx_gemini_manual_external_pending`,
   neprítomnosť `idx_gemini_manual_only_one_active` a zachovanie
   `idx_gemini_manual_active_category`. Kontrolovať aj výsledný report.
6. Až po úspešnej migrácii aktualizovať PR #852 na nový main, overiť jeho CI a
   následne vykonať **samostatný manuálny merge** PR #852.

## Neautorizované kroky

Žiadne automatické merge, produkčné ALTER/DROP/CREATE, deployment,
platené Gemini volania, zmeny historických jobov ani publikovanie.

## Offline overenie

- `node --test tests/production-d1-0129-rollout.test.mjs`
- `npm run test:migration-safety`
- `npm run db:check-migrations`
- Existujúce GitHub CI: migrácie, lokálna D1, Gemini, build, lint.
