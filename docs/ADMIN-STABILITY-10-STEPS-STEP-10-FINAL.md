# Psipedia.sk – Admin stabilita: finálna integrácia, krok 10/10

**Jediný PR:** #1318, `fix/admin-stability-10-steps-20261111`.  
**Rozsah:** bezpečná integrácia opráv v krokoch 1–9 s najnovším main, regresie, typový audit, lokálny SQL benchmark a nezávislé build diagnostiky. Bez produkčných D1/Notion zápisov, migrácií alebo deploy.

## Integrácia najnovšieho main

- Pri začatí kroku bola vetva približne **73 commitov pozadu**; porovnanie s merge-base `c1657f0af95a9a6ff2399b3acc9816a075e4c786` ukázalo **95 súborov PR**, 40 súborov zmenených na main, z nich iba **jeden prekrývajúci sa**.
- Súbor `components/admin-service-profile-values.tsx` bol konfliktom dvoch nezávislých úprav: main pridal spoľahlivé výsledky D1/Notion zápisov (`summarizeServiceChoiceSync` a `ServiceChoiceSyncFeedback`), PR pridal `useAdminEditorNavigationGuard` pre neuložené hodnoty. Obe funkcie zostali; nevynútené dvojité `window.confirm()` bolo odstránené.
- GitHub Git tree založený na main tree `e368408f43e9922792563a75d36663ac31809d09` bol obohatený o všetkých 95 zmien PR. Vytvorený bol **riadny dvojrodičovský merge commit** `93064276ceeebfe78611103b2c961f60adc04c3e` (rodičia pôvodná vetva a main `0d74e108aa2c1c43c16a26ccc2c10576a893766d`), nasledovaný bezpečným non-force fast-forwardom PR vetvy.
- Po merge GitHub nahlásil **`mergeable: true`, 0 commitov behind main**, PR zostáva **draft** a nie je zlúčený do produkcie.

## Skutočné výsledky prvého CI behu

GitHub Actions sa prvýkrát reálne spustil na merge commite `93064276...`:
- `npm ci` **úspešne**.
- `npm run test:admin-stability-step9` vrátane všetkých Node regresných testov krokov 1–9 **úspešne**.
- `npx tsc --noEmit --pretty false` **zlyhalo** s približne 1 001 chybami v celom rozsiahlo refaktorovanom repozitári (súbory app/lib/DB/web, nielen naša vetva). Neexistuje dôkaz, že pôvodný main bol plne typecheck-clean.
- Benchmark a build z toho istého workflow sa v tomto prvom pokuse nespustili (následkom zlyhanej TS kontroly).

## Opravy po logoch CI

- `components/admin-navigation.tsx`: zrušený neúmyselný návrat boolean z `onInvalidate` a návrat DOM hodnoty z cleanup efektu.
- `components/site-header.tsx`: void cleanup; stabilné, nenulové referencie menu/trigger vo vnorených event listeneroch.
- `components/admin-adoption-editor.tsx` a `components/admin-organization-editor.tsx`: bezpečné typovanie runtime-guarded invalid form input; pôvodné ukladacie API, hidden section a validačné pravidlá nezmenené.
- `components/admin-directory-editor.tsx`: explicitný boolean a prázdny fallback v reakcii na voliteľné polia odpovede odkontrolovania.
- `tests/admin-merge-step10.test.mjs`: strážny test oboch zlúčených funkcií Služieb V3, bezpečnej navigácie a TS úprav.
- Aktualizované testovacie kontrakty, aby odkazovali na aktuálny vstupný bod `test:admin-stability-step10`.

## Typy bez predstierania čistého main

Keďže main už môže obsahovať stovky historických diagnostík, nový `scripts/admin-type-regression-gate-step10.mjs` porovnáva **dva skutočné TypeScript behy** v CI:
1. **Presný base SHA** PR v nezmenenom `git worktree`, s rovnakou lokálnou inštaláciou npm.
2. Aktuálny head PR.

Oba výstupy uchová na diagnostiku. Porovnáva typy chýb, súbory a správy ako multiset a zlyhá, ak pribudne nový diagnostický problém alebo nemožno overiť zber. **Úspešný výsledok znamená „bez nových TS chýb oproti main“ – nie „celý repozitár má 0 TS chýb“**. Úplná náprava historických typových chýb nepatrí do stabilizačného PR. Tým zostane gate použiteľný bez maskovania regresií.

## CI workflow

`.github/workflows/admin-stability-regressions.yml` teraz:
- `permissions: contents: read`, `pull_request` a voliteľný manuálny dispatch.
- `npm ci` a **`npm run test:admin-stability-step10`**: všetky Node a kontraktové testy vrátane nového merge scenára.
- Syntetická SQLite benchmark diagnostika **pred typovými chybami**, takže sa výsledky vždy vyprodukujú, ak testovacia sada prejde.
- TypeScript regresný gate vs. base SHA, nie slepé prísne vynucovanie historicky chybného main.
- Reálny `npm run build` s `continue-on-error: true` ako **nezávislá diagnostika**, keďže je možné, že pôvodný main má iné neblokujúce build problémy. Jeho chyba musí byť v reporte uvedená, nie interpretovaná ako úspešný build.
- Upload oboch typecheck logov a JSON SQLite benchmarku ako retenčne obmedzené CI artifacts.
- Workflow nezískava produkčné tajomstvá a nikdy nevykonáva publikovanie, produkčný D1 zápis ani nasadenie.

## E2E a zostávajúce riziká

- Autentifikované read-only Playwright E2E pre mobilné menu, Back/Forward, iPhone emuláciu a dirty editor zostávajú pripravené, ale **neboli vykonané na skutočnej prihlásenej PWA**. Chromium s iPhone user agent nie je fyzické Safari/WebKit.
- Produkčný profil `/admin/organizacie/128` bol chránený fail-closed logikou a testovaný na syntetických read fixtures; pôvodný živý error digest a presná príčina jeho pádu sú stále neoverené.
- Časy SQLite benchmarku nie sú Cloudflare D1 latencie a nezaručujú percentuálne zrýchlenie iOS.
- Produkčnú D1/Notion a existujúce publikovanie, služby, migrácie a API kontrakty netreba meniť kvôli tomuto PR.

## Kritériá rozhodnutia o PR

**PR #1318 treba ponechať ako draft**, ak zlyháva ktorákovek nová regresná kontrola, TypeScript delta gate alebo zostáva podstatná nezdiagnostikovaná build chyba. Až po vyhodnotení CI a ideálne reálnom mobilnom smoke teste je vhodné vyžiadať review a rozhodnutie používateľa o zlúčení.

Prehľad z tejto dokumentácie je statický stav počas kroku 10. Autoritatívne sú **najnovší commit, konkrétne GitHub Actions job logs a statusy**. Zlyhaný/pending workflow nemožno označiť za úspešný.
