# Vyradenie starých Automatizácií — 2026-10-24

## Kontrakt
- PR #1019 už odstránil plánované `runDataAutomationSweep` a `runDataAutomationDiscoverySweep` z Cloudflare cronov.
- Pôvodné admin URL `/admin/automatizacie/**` sa presmerujú na `/admin/automatizacie-gemini`, adresové kontroly na `/admin/kvalita`.
- Pôvodné manuálne API `/api/admin/automation-*` vracia HTTP 410 a nevykoná spúšťanie ani zápisy.
- Pôvodné stavy a historické D1 záznamy sa **nemažú**. Žiadna D1 migrácia ani deštruktívny cleanup.
- Nové Gemini workflow, kvalita údajov, notifikácie, Notion synchronizácia a potrebné podporné `data-automation-*` utility zostávajú.
- `lib/data-quality-missing-hourly.ts` stále importuje `TavilyAutomationSearchProvider` a funkcie z `data-automation.ts`. Neodstraňovať ich len na základe názvu.
- Staré detailné admin URL sú presmerované na Gemini. D1 archívne údaje zostávajú zachované, ale cez vyradené rozhranie sa už nedajú editovať.

## Prevádzkové overenie pred uzavretím
1. `/admin/automatizacie` a staré záložky smerujú na Gemini; adresové kontroly na Kvalitu údajov.
2. Všetky legacy manuálne API vracajú 410 (vrátane /run a /search).
3. `worker/index.ts` nemá staré scheduled sweep calls; `runQualityMissingHourly` a Gemini zostávajú.
4. Manuálne overiť Gemini plánovanie, kvalitu návrhov, push a Notion po deploymente.
5. Nezahajovať čistky D1, nevymazávať historické profily.

Status: pripravené v PR na overenie, **bez merge a bez deploymentu**.
