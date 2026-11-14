# Psipedia.sk — vyriešenie konfliktov PR #1369 a uzavretie PR #1368

**Dátum:** 14. novembra 2026  
**Rozsah:** zosúladenie admin UI vetvy s aktuálnym `main`, bez merge do produkčného `main` a bez deployu.

## GitHub HEAD a výsledok

1. Pôvodný PR #1369 bol Draft a `mergeable=false`; vetva nemala nové upstream úpravy.
2. Dve sémantické kolízie: `app/admin/nastavenia/page.tsx` (nové Štatistiky) a `components/admin-organization-editor.tsx` (odstránené Registračné číslo). Pri prenose Knip príkazov pribudla na zosúladenie aj aktualizácia `package.json`.
3. Pri reálnom zlučovaní boli tieto tri súbory dočasne nastavené na presný upstream `main`, aby GitHub vytvoril skúšobný bezkonfliktný merge commit.
4. GitHub vytvoril merge commit `7d7ef6ac67826fb14206cc7f3ff1850450414695`; overené cez `compare_commits`, že je potomkom oboch vetiev. GitHub vetva #1369 bola **fast-forward** aktualizovaná na tento commit pomocou expected-SHA lease a `force=false`. Nebol vykonaný force-push ani prepis histórie.
5. Na tento spoločný stav sa následne **vrátili úpravy admin vzhľadu**: kompaktné karty v Nastaveniach (vrátane štatistík a Notion prepojenia), kompaktnejšie označenia editora organizácie (bez registračného poľa) a oba Knip scripts pridané k aktuálnemu `package.json`.
6. Po obnove vizuálu GitHub vrátil `mergeable=true`, porovnanie `main...HEAD` `behind=0`. Stále je **Draft, open, merged=false**.

## Zachovanie funkcií a dát

- **Nová analytika:** karta `Štatistiky návštevnosti`, route `/admin/nastavenia/statistiky` a registrácia v admin navigácii zostali zachované.
- **Organizácia:** odstránený vstup `Registračné číslo` sa nevrátil; stavy publikovania, existujúce uloženie a naviazanie Notion ostali.
- **Vizuál:** `data-admin-content-module="application-settings"` a `organizations-editor`, admin tokeny a pôvodné zmeny všetkých krokov ostali zachované.
- **Knip:** do PR #1369 prenesené `knip.json`, `.github/workflows/knip-audit.yml`, `docs/audits/knip-step1.md`, `.gitignore` pravidlo `/reports/knip/` a dva `audit:knip*` scripts. Knip je read-only a neodstraňuje kód.
- **PR #1368:** zatvorený **bez merge**, výsledok jeho úspešného auditu je zdokumentovaný v kroku 17/18. Uzavretie nevymazáva GitHub Actions artefakty okamžite; platí ich retenčná lehota.

## Kontroly

- Pridaný `tests/admin-main-reconciliation.test.mjs`, zapojený do existujúceho `admin-typography-contracts.yml`; zdrojový kontrakt overuje oba vyriešené konflikty, aktuálnu nav route a prítomnosť Knip skriptov.
- **CI, TypeScript, Playwright, screenshoty a iOS Safari nie sú týmto krokom potvrdené.** Mergeability znamená iba, že sa Git vetvy dajú zlúčiť, nie že aplikácia prešla testami.
- Pred finálnym merge #1369 skontrolovať posledný HEAD, CI workflow, screenshoty a iba následne dať explicitné schválenie vlastníka.

## Záver

**PR #1369:** bezkonfliktný a synchronizovaný s vtedy aktuálnym `main`, ale Draft a zatiaľ bez schváleného CI / vizuálnych dôkazov.  
**PR #1368:** zatvorený bez merge; Knip auditná infraštruktúra ostala v #1369.
