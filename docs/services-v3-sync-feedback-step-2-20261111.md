# Služby V3 — pravdivé výsledky synchronizácie (krok 2/6)

Dátum: 2026-11-11. Tento krok dopĺňa existujúce PR #1319; nemení produkčnú D1, Notion obsah ani migračné schémy.

## Problém

Kanonický profilový editor `components/admin-service-profile-values.tsx` doteraz využíval zo serverovej odpovede iba `selection`, nie `notionProjection`, `notionFieldSync` ani `warning`. Aj pri zlyhaní Notion mohol ukázať „Uložených: N možností.“. Server tiež niekedy označil Notion `synced` na základe nesúvisiacich aktualizácií iných profilových polí, nie na základe skontrolovanej kanonickej relácie.

## Uplatnené pravidlá

1. **D1 je nezávislý výsledok.** Po úspešnom `PATCH` sa príslušná voľba považuje za uloženú v Psipedii, aj keď Notion nie je dostupný. Neúspešný prenos do Notion nesmie dodatočne označiť D1 ukladanie ako neúspešné.
2. **Kanonická Notion relácia je osobitne verifikovaná.** `notionFieldSync=synced` len pre `serviceRelationSync=pushed|pulled`; `unchanged` pre explicitne skontrolovanú, nezmenenú reláciu; `pending` pri `skipped`, neúplnej schéme alebo chybe; `unlinked` bez potvrdeného prepojenia; `disabled` pri vypnutej automatike.
3. **Neúspešná projekcia služieb sa neschová.** Pri `notionProjection=deferred` editor hlási čakajúcu kontrolu, aj keby iný podsystém odpovedal `synced`.
4. **Prázdne/nezistené výsledky neznamenajú úspech.** Staršia API odpoveď bez `notionFieldSync` sa v zhrnutí označí `pending`.
5. **Hromadné uloženie je čiastočne obnoviteľné.** Zvolený editor odosiela jednu kanonickú voľbu za druhou. Pri chybe neprepíše predchádzajúce potvrdené zmeny a spočíta len úspešné D1 odpovede. Nevybavené položky zostanú ako rozpracované; pri konflikte sa odporúča obnoviť údaje.
6. **Upozornenia sú zrozumiteľné.** Text od servera sa zobrazí najviac raz pre rovnaké upozornenie, zhrnutie obsahuje počty stavov a v hlavičke je vizuálny status pre výsledok Notion.

## Overenie

- `tests/service-catalog-sync-feedback.test.mjs` obsahuje scenáre pre `synced`, `unchanged`, `pending`, `unlinked`, `disabled`, `deferred`, chýbajúce odpovede, duplicitné varovania a čiastočné uloženie.
- Existujúci `tests/notion-directory-sync.test.mjs` stále kontroluje invariant, že synchronizácia je až po D1 výbere a projekcii.
- Zdrojové kontroly v teste strážia, že iné profilové synchronizačné počítadlá nie sú dôkazom synchronizácie kanonickej relácie.

## Limity

Tento krok nezaručuje opravu starých Notion konfliktov, nevytvára profilové prepojenia ani nemení pravidlá Notion→Admin importu. To ostáva pre kroky 3–6. Stav označený `pending` je potreba overenia, nie automaticky strata uloženého údaja.
