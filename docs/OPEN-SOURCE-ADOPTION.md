# PSIPEDIA.SK — otvorený kód bez ďalšej registrácie

Stav k 24. 10. 2026. Jeden konsolidovaný PR pre **bezpečný pilot 10 UI knižníc**
a **nezávislé SEO diagnostiky**. Žiadny merge, deployment, nová externá služba,
prístupové tokeny ani zmeny produkčného UI.

## Desať overených projektov (funkčný pilot, nie produkčné nasadenie)

| Názov | Zdroj a licencia | Pilot |
|---|---|---|
| Radix UI | https://github.com/radix-ui/primitives (MIT) | Prístupný dialóg |
| TanStack Table | https://github.com/TanStack/table (MIT) | Tabuľka 3 000 položiek |
| Zod | https://github.com/colinhacks/zod (MIT) | Validácia |
| TanStack Virtual | https://github.com/TanStack/virtual (MIT) | Renderovanie viditeľných riadkov |
| React Dropzone | https://github.com/react-dropzone/react-dropzone (MIT) | Drag & drop fotografií |
| dnd-kit | https://github.com/clauderic/dnd-kit (MIT) | Klávesnicové aj myšové radenie |
| React Hook Form | https://github.com/react-hook-form/react-hook-form (MIT) | Formulár |
| Fuse.js | https://github.com/krisk/Fuse (Apache-2.0) | Tolerancia preklepov |
| Lucide | https://github.com/lucide-icons/lucide (ISC) | Ikony |
| Lexical | https://github.com/facebook/lexical (MIT) | Oddelený textový editor |

**Prečo pilot?** Existujúce Psipedia editory, interné CSS a číselníky, kanonické
D1/Notion identifikátory a blokový formát článkov fungujú inak než generické
knižnice. Plošná výmena bez migračných testov by riskovala stratu obsahu. 
V `examples/open-source-lab/` sú všetky knižnice skutočne použité v React 19 UI,
ale pilot nemá žiadny produkčný prístup.

**Ďalší technický gate pred produkciou**: overiť výsledný bundle, kompatibilitu
s Vinext a Cloudflare Workers, mobil 320/390 px, a11y, testy zachovania dát
a kompatibilitu čítania/zápisu v existujúcich editoroch. Vybrať len knižnice,
ktoré merateľne zlepšia reálne komponenty. Nepridávať desať globálnych
runtime dependencies len preto, že existujú.

## SEO — reálne integrované externé nástroje

- **SiteOne Crawler**: https://github.com/janreges/siteone-crawler (MIT),
  checksum-pinned v2.5.1, 6 konkrétnych verejných stránok, 1 req/s, 1 worker,
  HTML/JSON/TXT report.
- **Linkinator**: https://github.com/JustinBeckwith/linkinator (MIT),
  checksum-pinned v8.1.0, jedna nerekurzívna verejná homepage, max 1 request
  naraz, interné URL. Report JSON.
- **Vlastný existujúci auditor**: `scripts/audit-production-site.mjs`,
  obmedzený na 12 prechádzaných HTML stránok, 1 súbežná požiadavka; navyše
  kontroluje sitemap, canonical a interné odkazy. Nie je to nový crawler.
- **Google schema-dts**: https://github.com/google/schema-dts (Apache-2.0)
  — zatiaľ zámerne NEINŠTALOVANÉ do produkčnej aplikácie; existujúce JSON-LD
  testy pokrývajú entity. Typy sú kandidát pre postupné mapovanie.
- **Google Lighthouse CI**: https://github.com/GoogleChrome/lighthouse-ci
  (Apache-2.0) — zatiaľ NEINŠTALOVANÉ: projekt už má existujúce samostatné
  Lighthouse merania a porovnania. Nezdvojovať platenie/merania.
- **sitemap.js**: https://github.com/ekalinin/sitemap.js (MIT)
  — zatiaľ NEINŠTALOVANÉ: dynamická sitemap je naviazaná na D1, parity kontroly
  a validovaný edge cache. Použiť len pri skutočnej potrebe sitemap indexu
  alebo keď sa potvrdí prekročenie limitov 50 000 URL/50 MB.
- **Unlighthouse**: https://github.com/harlan-zw/unlighthouse (MIT):
  doplnkový *voliteľný* offline/lokálny nástroj na viacstránkové Lighthouse
  kontroly, nie nový cron v Cloudflare.

## Spustenie a overenie

1. Bez sieťových testov: GitHub PR job `offline` vykoná kontraktové testy
   a build izolovaného demoprojektu cez npm. Nenahrádza existujúce CI.
2. Lokálne: `cd examples/open-source-lab && npm install --no-package-lock && npm run dev`.
3. Až po merge: v GitHub Actions spustiť **Open-source adoption and SEO checks**
   ručne s `live_seo=true`. Žiadny automatický crawl pri PR.
4. Výstup v GitHub Actions Artifacts: `seo-open-source-<run_id>`, retenčná lehota
   14 dní. Hlášky o chybách z live webu treba preveriť pred opravami, najmä
   pri plánovaných redirectoch a dočasnej nedostupnosti.
5. **Vyhodnotenie indexácie v Google** aj naďalej vyžaduje Search Console;
   nástroje tu kontrolujú technické predpoklady, nie Google index coverage.

## Bezpečnostné a licenčné hranice

- Žiadny nový účet, platený SaaS, API kľúč ani zmeny produkčných nastavení.
- Pri inštalácii závislostí sa nepreberá neoverený build kód do produkcie.
- Nástroje pre live web sú presne pripnuté na release a SHA256 digest.
- GitHub job má iba read-only permissions.
- `package-lock.json` koreňovej aplikácie zostáva nezmenený.
- Pred produkčným použitím treba uchovať príslušné licenčné oznámenia.
