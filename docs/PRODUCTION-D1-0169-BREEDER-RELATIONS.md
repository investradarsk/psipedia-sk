# D1 0169 – prázdna SQL tabuľka pre chovateľské kluby

## Prečo samostatný PR
Admin a verejný web v PR #1414 budú pri zobrazovaní staníc a klubov čítať
`directory_breeder_club_relations`. PR #1414 preto **nesmie byť zlúčený skôr,
ako bude tabuľka vytvorená v produkčnej D1**.

Tento malý prípravný PR neobsahuje žiadny runtime reader tejto tabuľky.
Po zlúčení do main pridá do GitHub Actions iba bezpečný manuálny workflow
**Production D1 Breeder Relations 0169 (manual)**.

## Overená inventúra produkcie (17. 11. 2026)
Podľa read-only auditu používateľa:
- 0163–0168: 43/43 fyzických objektov existuje, bez zápisov v `d1_migrations`.
  To je kompatibilné s izolovanými D1 migráciami.
- 0169: 0/3 objektov, migrácia nebola nasadená.
- 535 staníc, 84 klubov, 7 starých JSON väzieb stanica→klub,
  38 existujúcich SQL väzieb klub→plemeno; nesmú sa prenášať do novej tabuľky.
- Stará migračná história končí na 0162.
**Samostatné 0169 nenahrádza audit presného DDL 0163–0168. Nenúti spúšťať
ani jednu nesúvisiacu migráciu a nezapisuje do `d1_migrations`.**

## Postup (len po schválení vlastníkom)
1. Zlúčiť najskôr *iba tento prípravný PR*, nie #1414.
   Runtime webu tým nedostane nový reader; nič sa nenasadí automaticky.
2. GitHub → Actions → **Production D1 Breeder Relations 0169 (manual)** →
   Run workflow → branch `main` → `mode = audit` →
   `confirmation = AUDIT-0169-psipedia-sk-db`.
3. Prečítať schema-only report. Očakávame `installed=false`,
   `newStationClubLinks=0` a nulové nezrovnalosti. Ak je schema
   neúplná/odlišná, STOP, **nie opakované Apply**.
4. V zálohovaných D1 Time Travel podmienkach a po výslovnom schválení
   spustiť **samostatný** workflow na `main`:
   `mode = apply`, `confirmation = APPLY-0169-psipedia-sk-db`.
   Tento krok vytvorí iba prázdnu tabuľku a dva indexy; Time Travel
   bookmark sa uloží do workflow artefaktu pred prvým zápisom.
5. Úspešný POSTFLIGHT vyžaduje `installed=true`,
   `newStationClubLinks=0` a nezmenené počty pôvodných väzieb,
   profilov, existujúcich tabuliek a migračnej histórie.
6. Až potom samostatne riešiť reset starých stanica/klub ↔ plemeno vzťahov
   a Notion anti-replay podľa PR #1414; **táto migrácia nikdy nevykoná reset**.
   Žiadne staré väzby sa z JSON neprenášajú.
7. Po nezávislom dokončení dátového cutoveru a kontrole CI môže PR #1414
   z Draft prejsť na Ready a byť nasadený. Nové vzťahy potom vyberať v Admine.

## Ochrany
- GitHub workflow výhradne `workflow_dispatch` a `main`,
  protected `production` environment a Cloudflare D1 token;
- audit je predvolený a vykonáva iba SELECT;
- apply potrebuje osobitný potvrdený reťazec;
- presné SHA-pinned SQL (jedna tabuľka + dva indexy, žiadne DELETE/INSERT);
- kontrola Cloudflare account, D1 name/ID, zámka `production-d1-migration`;
- odmietnutie čiastočnej schémy aj nekompatibilného DDL;
- žiadny zásah do `d1_migrations`, Notionu, chovateľských staníc,
  klubov, plemien, starých vzťahov ani analytiky.

**Neaktivovať PR #1414 pred dokončením 0169 a súvisiaceho čistého resetu.**
