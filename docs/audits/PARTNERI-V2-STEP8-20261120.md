# Partneri V2 – krok 8/8, integračný preflight (20. 11. 2026)

PR #1467 zostáva Draft. **Zatiaľ NEMERGOVAŤ, NENASADZOVAŤ.**

## Git reconciliácia
- Bez force push: nový merge commit s rodičmi aktuálny `main` + pôvodný Partneri PR head.
- Prienik súborov oboch vetiev: `lib/partner-direct-profile.ts`.
- V tomto súbore sú zachované z `main` 0170 a 0173 SQL projekcie, verzionovanie a všetky ostatné existujúce operácie.
- Z Partneri PR zostali audit old/new, Admin upozornenie pri priamej úprave a CAS fail-closed.
- Nový strom vychádza z aktuálneho main; nezmenené súbory z novších commitov sa zachovali.

## Migračné kontroly
- `drizzle/0175_partner_private_chat.sql` v `main` zatiaľ neexistuje, posledný zistený súbor migrácie má číslo `0174`.
- 0175 zavádza nové privátne chatové D1 tabuľky; nesmie sa aplikovať skôr než read-only preflight produkčného ledgeru.
- Znova nepúšťať 0171 a 0172 ani historický migračný backlog. Novú migráciu vykonať len raz a pred nasadením Worker kódu.

## Otvorené release gates
- [ ] GitHub CI: TypeScript, lint, build, unit a integračné testy (neoverené v tomto kroku).
- [ ] Produkčný D1 `d1_migrations` ledger, live schéma a kolízie 0175.
- [ ] Skutočný Workers/R2/Notion staging E2E: návrhy, schválenia, editory a synchronizácia SQL.
- [ ] A/B izolácia partnerov, role, CSRF, súkromné sťahovanie príloh a 404 na `/media/quarantine`.
- [ ] E-mail + in-app upozornenia default ON; vypnutie každého zvlášť, bezpečné Resend retry, login/reset mimo opt-out.
- [x] Implementovaný ohraničený R2 orphan cleanup s 24-hodinovou ochrannou lehotou, D1 kontrolou referencií a checkpoint cursorom; súčasť pôvodnej 0175 migrácie.
- [ ] Overiť R2 cleanup v skutočnom Workers runtime a správanie pri výpadkoch.
- [ ] Mobilné UI, čítanie starých správ, polling a správnosť verejného zobrazenia.

**Žiadne produkčné nasadenie, migrácia ani úspešný E2E test sa týmto commitom nepotvrdzujú.**

### Preflight note
Pôvodne rezervované číslo 0190 spôsobovalo CI chybu chýbajúcej súvislej sekvencie 0175–0189. Keďže táto migrácia **ešte nebola nasadená**, je z bezpečnostných dôvodov pred merge prečíslovaná na 0175. Žiadna stará migrácia sa nespúšťa opakovane.
