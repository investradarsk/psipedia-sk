# Psipedia.sk — PageSpeed mobil, päť krokov (PR #1320)

## Východiskové pozorovania, 12. 11. 2026

Zdroj: používateľom poskytnuté snímky mobilného PageSpeed Insights pre `https://psipedia.sk/` po zlúčení PR #1317. Sú to laboratórne diagnostiky z jedného merania, **nie automaticky dokázaný before/after výsledok aktuálne nasadeného SHA**.

| Diagnostika | Predbežne zaznamenané |
| --- | --- |
| CLS | 0,228; footer ~0,192, zvyšok ~0,036 |
| Render-blocking CSS | hlavné `/assets/index-*.css` ~183,4 KiB; odhad príležitosti ~1 720 ms |
| LCP hero | resource-load delay ~930 ms; TTFB ~320 ms; resource-load duration ~80 ms; render delay ~150 ms |
| Obrázky | potenciálna úspora ~78 kB |
| Externý cache TTL | `zsk_sr` logo a `agilityportal` obrázok bez TTL; Cloudflare beacon má vlastný TTL |
| Kritická reťaz | Lighthouse ~1 615 ms, obsahuje CSS a Cloudflare beacon |

**Nedáva sa z toho odvodiť presné zrýchlenie po PR.** Chýba rovnaká séria pred a po deployi; nepoznáme celkové lab skóre ani p75 INP.

## Rozsah jedného PR a vykonané zmeny

1. **CLS: homepage streaming.** `app/page.tsx` má pri `HomeBelowHero` viditeľný a aria-hidden rezervovaný fallback namiesto `fallback={null}`. `app/home-v2.module.css` drží footer bezpečne mimo úvodnej oblasti počas čakajúceho streamu (desktop aj mobil). Úvodný hero zostáva nezávislý od pomalších údajových dotazov. Tým cielime na zaznamenaný posun footer, nie na neexistujúci problém s rozmermi obrázku.
2. **CSS: plemená mimo globálneho CSS.** Všetky súvislé, špecifické štýly plemien z `/* Breed encyclopedia UI */` až po `/* Keep the editorial refinements ... */` (70 767 znakov) boli presunuté do `app/plemena/breed-reference.css`, importovaného len cez `app/plemena/layout.tsx`. Globálny CSS text sa zmenšil z 285 776 na 215 464 znakov (~70 312). Všeobecné mobilné `html/body` a scroll-anchor pravidlá zostali v globále. Tieto počty **nie sú skutočným transferom po kompresii**.
3. **LCP: presný preload.** Po D1 resolvovaní úvodnej hero fotografie sa vykreslí responsive `<link rel=preload as=image>` s rovnakými candidate-widths, `sizes` a high priority ako skutočný obrázok. Preload nie je natvrdo naviazaný na predvoleného labradora; rešpektuje editorský override. Konečná implementácia sa overí kontrolou jednej sieťovej požiadavky a HTML preload hlavičky po zostavení.
4. **Cache: fingerprinted statické assets.** Worker bezpečne obslúži iba verejné `GET /assets/*-[hash].css|js|font|image` cez `ASSETS.fetch`, s kontrolou MIME, status 200 a zákazu `Set-Cookie`; nastaví `public, max-age=31536000, immutable`. Výslovne obíde admin/API, HTML, URL bez hashu, query, Range, autentifikáciu a `workers.dev` preview. D1, Notion a súkromné HTML cache nie sú dotknuté. Externé `zsk_sr`, `agilityportal` a Cloudflare Web Analytics beacon nie sú pod našou cache kontrolou; bez licencie či dashboard nastavení ich neprepínať na lokálne URL.
5. **Regresie a overenie.** Nový úzky CI `PAGESPEED-MOBILE-5` spúšťa testy CLS, CSS scope, image preload, immutable cache a doterajšie verejné regresie. Hlavný workflow zostáva autoritou pre kompletný build, lint a integráciu.

## Meranie po nasadení

- Potvrdiť, že produkcia obsahuje **merge SHA tohto PR**, nie iba zelený GitHub merge; to isté pre starý baseline.
- Rovnaké URL, cache stav, cookies a geografická poloha Lighthouse runnera; 3 behy na mobile aj desktope.
- `scripts/web-perf-observability.mjs` už podporuje režim `baseline` s 8 URL × 2 zariadenia × 3 opakovania. Výsledky porovnať `scripts/web-perf-compare.mjs` **iba** s nezávislými produkčnými deploy SHA.
- Zaznamenať pôvodných 0,228 CLS a cieľ <0,1, výsledný CSS transfer na úvodnej stránke, LCP element a jeho resource-load delay, duplicate preload requests, TTFB, p75 INP (ak CrUX dostupné).
- Kontrolovať vizuálne obe šírky: hero homepage, návrat z plemena, atlas a plemenný detail, cookie banner, päta počas pomalého streamu, sekcie pod hero; cache SSR anonymnú aj autentifikovanú.
- Cloudflare Analytics beacon je zobrazený vo waterfall, ale jeho injekciu z webového dashboardu netreba meniť bez samostatného rozhodnutia a potvrdenia analytickej náhrady.

## Stav validácie

Vývojové kroky 1–5 zapísané do vetvy; výsledné Lighthouse čísla **NEZMERANÉ po nasadení**. GitHub CI/build, render a vizuálna kontrola sú samostatné release gates. PR zostáva draft a **nezlučuje sa automaticky**.
