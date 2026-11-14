# Psipedia.sk — krok 17/18: Vyhodnotenie Knip a bezpečné čistenie

**Dátum:** 14. 11. 2026  
**Hlavný vizuálny PR:** #1369 (Draft), `chore/admin-visual-unification-step2-audit-20261114`.  
**Samostatný read-only Knip PR:** #1368, `chore/knip-readonly-audit-step1-20261114`.  
**Knip vykonaný na SHA:** `ff9cabce4479c8a9817824a3dc7863257a67bf24`.  
**Úspešný Actions run:** [43628661039](https://github.com/investradarsk/psipedia-sk/actions/runs/43628661039), artefakt `psipedia-knip-43628661039-1` (uložený do 28. 11. 2026).

## Podložené výsledky reportu

Rozbalený `findings.json` (264 súborových záznamov) obsahuje:

| Kategória Knip | Počet | Interpretácia |
| --- | ---: | --- |
| Unused files | **32** | Kandidáti, **nie potvrdené** nepotrebné súbory |
| Unused exports | **440** | Kandidáti na odstránenie exportovaných symbolov, nie automaticky celých funkcií |
| Unused types | **192** | Typy, ktoré neboli staticky referencované v grafe |
| Duplicate groups | **4** | Potenciálne spoločné deklarácie; nemusia byť sémanticky rovnaké |
| Unlisted imports | **3** | `playwright`, `miniflare`, `postcss` použité priamo v testoch; bez schválenia nemeníme `package.json` |

**Úspech workflowu neznamená, že repozitár nemá nálezy**: používa `--no-exit-code`. PR #1368 nie je merged, takže Knip konfigurácia nie je predpokladom buildu PR #1369.

## Overená zmena v kroku 17

**Odstránený:** `components/admin-deferred-details.tsx` (729 znakov).

- Knip ho označil ako nepoužívaný súbor.
- Zdrojový GitHub search po `AdminDeferredDetails` a `admin-deferred-details` nevrátil žiadne použitie v `main`.
- Súbor mal rovnaký SHA na `main` aj vo vetve #1369.
- Bol to izolovaný React wrapper bez API, routy, registrácie, migrácie či externého side effectu.
- Nový read-only test `tests/admin-knip-cleanup-step17.test.mjs` overuje neprítomnosť súboru a importov v `app`, `components`, `lib`, `scripts`, `workers`.
- **Bez odstránenia alebo zmeny ďalších súborov**; pôvodné explicitné `<details>` v ostatných editoroch ostali.

## Ručné triedenie 32 hlásených súborov

| Súbory / skupina | Rozhodnutie | Dôvod |
| --- | --- | --- |
| `components/admin-deferred-details.tsx` | **Odstránený 1/32** | Žiadna nájdená referenčná cesta; viď vyššie |
| `public/sw.js` | **Zachovať** | PWA service worker sa registruje URL, nie statickým importom (`/sw.js`) |
| `ops/google-places-budget-guard/index.js` | **Zachovať** | Samostatný operačný/billing vstup mimo Next.js importového grafu; bez zásahu do limitov |
| `examples/open-source-lab/src/App.jsx`, `examples/d1/db/schema.ts`, `examples/d1/app/api/notes/route.ts` | **Zachovať** | Úmyselné vzorové/experimentálne entrypointy; nie produkčný admin |
| `components/admin-unsaved-navigation-dialog.tsx` | **Ponechať na ďalšie overenie** | Je explicitne referencovaný v teste `tests/admin-unsaved-navigation-shared.test.mjs` a inventárnom skripte; prípadné odstránenie vyžaduje zvlášť revíziu kontraktu |
| `components/admin-rich-text-editor.tsx` | **Ponechať na ďalšie overenie** | Testy sekcií a organizácií ho explicitne spomínajú, starý editor nemožno bez regresie zmazať |
| `components/admin-breed-notion-extras.tsx` | **Ponechať na ďalšie overenie** | Testy a API pre Notion-only polia; dynamické/už historické väzby sa musia vyhodnotiť po synchronizácii s `main` |
| `components/admin-automation-schedule-fields.tsx` | **Ponechať na ďalšie overenie** | Import zo skupiny automatizačných komponentov; riziko odstránenia celý podgraf naraz |
| `lib/data-automation-{canonical-apply,cluster-admin,direct-discovery-recovery,lifecycle-apply,search-admin}.ts` | **Ponechať na ďalšie overenie** | Možné legacy integračné API / migrácie; nie je bezpečné mazať podľa statického grafu |
| `components/admin-automation-{candidate-review,category-sources,lifecycle-review,search-controls,source-detail,source-manager,source-settings}.tsx` | **Ponechať na ďalšie overenie** | Starý automatizačný editor tvorí prepojený podgraf; nutné overiť routy a používané runbooky |
| `components/admin-canonical-apply-review.tsx`, `components/admin-gemini-concept-review.tsx`, `components/admin-gemini-notion-publish.tsx`, `components/admin-tavily-root-detail.tsx` | **Ponechať na ďalšie overenie** | Citlivé schvaľovanie, import, publikovanie a externé API, žiadne automatické mazanie |
| `components/breed-crawl-index.tsx`, `components/directory-category-overview.tsx`, `components/directory-club-filters.tsx`, `components/directory-club-results.tsx`, `components/home-dog-name-day-entry.tsx` | **Ponechať na ďalšie overenie** | Verejné/legacy komponenty mimo prioritného čistého admin cleanupu |
| `app/admin/automatizacie/_components/automation-availability-state.tsx` | **Ponechať na ďalšie overenie** | Error fallback pre automatizácie môže mať nepriamy alebo budúci vstup |

**Záver:** Nemažeme 31 z 32 nálezov, kým nie sú dostatočne preukázané ako nepoužívané na aktuálnom `main` a PR #1369. Zvolené odstránenie sa týka jedného izolovaného wrappera a nie je prezentované ako kompletné vyčistenie celého repozitára.

## Potenciálne duplicitné exporty — bez zmeny API

Knip pomenoval tieto štyri skupiny, no automatická deduplikácia by bola riziková:

1. `lib/organization-fundraising-contract.ts`: `ORGANIZATION_FUNDRAISING_METHOD_TYPES` vs `PUBLIC_ORGANIZATION_FUNDRAISING_METHOD_TYPES`
2. `lib/adoption-store.ts`: `listPublicAdoptions` vs `getPublicAdoptions`
3. `lib/gemini-automation-identity.ts`: `normalizeGeminiText`, `normalizeGeminiName`, `normalizeGeminiCity`
4. `lib/gemini-automation-pilot.ts`: `GEMINI_DIRECTORY_HARD_MAX`, `GEMINI_PILOT_HARD_MAX`

Tieto symboly môžu mať podobnú implementáciu, ale rôznu semantiku, integračné väzby či zámerné aliasy. **Bez zásahu v kroku 17.**

## Čo ešte treba pred merge

- [ ] **Re-scan na presnom HEAD #1369** s Knip konfiguráciou z #1368, po zosúladení s aktuálnym `main`, inak report ostáva snapshotom staršej vetvy.
- [ ] Spustiť `node --test tests/admin-knip-cleanup-step17.test.mjs`, TypeScript, relevantné testy a zostavu; CI úspech nie je už teraz potvrdený.
- [ ] Zosúladiť #1369 s `main` bez prepísania súbežných PR. Pred kontrolou 17/18 bola vetva výrazne diverged; `mergeable=false`.
- [ ] Zvyšných 31 kandidátov riešiť len samostatnými, preukázateľne bezpečnými úpravami; neodstraňovať ich kvôli číslu v reporte.
- [ ] Pre vizuálne zmeny krokov 2–16 stále treba PR Visual Evidence, desktop/mobil 1440/390 a reálne iOS Safari.

**Nasleduje 18/18:** záverečný audit adminu na poslednom HEAD, izolované Playwright screenshoty, typografia, mobilný overflow, funkčná regresia, merge konflikty a rozhodnutie o pripravenosti na merge.
