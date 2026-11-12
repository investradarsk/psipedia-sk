# Psipedia.sk – Admin stabilita, krok 8/10: chybové hranice a bezpečná obnova

**PR:** #1318 · **vetva:** `fix/admin-stability-10-steps-20261111`  
**Zásahy:** čítanie a prezentácia chýb, bez produkčných D1 zápisov, migrácií, Notion synchronizácie či zmeny API publikovania.

## Zistené slabiny

1. `/admin/organizacie/[id]` používal `Promise.all` pre kanonický profil a lokality. V prípade neexistujúceho záznamu a nezávislého zlyhania čítania lokalít mohla následná SQL chyba zakryť skutočný 404. Pri existujúcom zázname sa naopak **nesmie** substituovať prázdny zoznam lokalít po SQL chybe: takéto hodnoty by mohli pri save vymazať potvrdenú adresu.
2. Doplnkové panely redakčnej kontroly, duplicitných návrhov, fundraisingu a automatizačných návrhov už boli oddelené v kroku 4, ale po zlyhaní poskytovali len statickú hlášku bez explicitného retry.
3. V doménovom čítaní `help-organization-admin-store.ts` `completenessHints()` a `toCandidate()` predpokladali, že legacy textové polia sú vždy string. Ak starší / importovaný záznam vráti `NULL` (napr. `resolved_city`, `short_description`, `description`), volanie `.trim()` môže padnúť ešte pred vykreslením editora.
4. `app/admin/error.tsx` mal obnovenie celej stránky a retry bez kontroly markera neuloženého editora. Chýbala samostatná obrazovka pre **detail organizácie vs. neexistujúci ID**.
5. Chýbal špecifický `loading.tsx` pre detail organizácie pri úplne pomalom kanonickom načítaní.

## Zmeny

### Rozlíšenie 404 / D1 chyby / chyby lokality

`app/admin/organizacie/[id]/page.tsx`:
- Striktne validuje kladné dekadické `id` (`/^[1-9][0-9]*$/` a `Number.isSafeInteger`); nepovoľuje JS koercie `0x80`, `1e2`, ani čísla mimo safe integer.
- Kanonický profil a lokality sa stále štartujú **súbežne**, teraz `Promise.allSettled`, a výsledok vyhodnotí čisto testovateľný `resolveOrganizationEditorReads()`.
- Zamietnutý profil => pôvodná príčina D1 chyby sa propaguje do error boundary.
- Profil `null` => pravdivý **404**, aj keby nezávislá locations query zlyhala.
- Platný profil + zamietnutá locations query => chyba detailu, nie editovateľný prázdny adresný zoznam.
- Platný profil + úspešné lokality => pôvodný editor so všetkými údajmi.
- Zápisové endpointy, `expectedUpdatedAt`, explicitná adresná operácia, Notion mirror a publikovanie sa nemenili.

`lib/organization-admin-read-state.ts` je čisto čítací, testovateľný pomocník bez Next/Cloudflare runtime závislosti.

### Legacy NULL v textových poliach

`organizationAdminReadText(value)` premení `null`/nestringové čítacie hodnoty na prázdny **UI text**. Funkcia sa aplikuje na voliteľné/opisné reťazce a `completenessHints` len pri čítaní; nemení D1, nemigráruje dáta ani nevyplní automaticky pole na serveri.

**Pozor:** neplatný lifecycle stav ďalej vyhadzuje chybu, nie je maskovaný ako DRAFT; povinný `name`, `slug` a polia pri uložení ďalej podliehajú pôvodnej validácii. Ak sú texty prázdne, preflight vytvorí pôvodné warningy/blockery. Tým je možné otvoriť starší koncept a opraviť ho, ale nie bez potvrdenia používateľa prepísať jeho zdroj.

### Detail loading/404/error

Pridané segmentové obrazovky:
- `app/admin/organizacie/[id]/loading.tsx`: viditeľné načítanie profilu a lokality, nie biela stránka.
- `app/admin/organizacie/[id]/not-found.tsx`: záznam nie je k dispozícii, bezpečný návrat na zoznam.
- `app/admin/organizacie/[id]/error.tsx`: dedikovaná chybová hranica „Detail organizácie sa nepodarilo načítať“.

Spoločné `AdminErrorRecovery` používa aj `app/admin/error.tsx`. Bez automatického reloadu alebo refreshu. Retry `reset()` je vlastná akcia, reload je druhá, výslovná akcia. Ak je stále mountnutý dirty editor (`data-admin-unsaved-editor`), obe akcie vyžadujú dodatočné explicitné potvrdenie. K dispozícii sú bezpečné odkazy do novej karty, aby používateľ mohol zistiť stav iného záznamu bez opustenia konceptu. Technické detaily error message/stack sa používateľovi nezobrazujú; v browser console je len digest/kód chyby. Pri páde renderu **nie je možné bez overenia tvrdiť, či predchádzajúci save už prebehol**, preto to recovery UI netvrdí.

### Doplnkové panely – retry len keď je bezpečný

`AdminOptionalReadError`:
- Manuálne tlačidlo `Skúsiť načítať znova` použije existujúci `router.refresh()` iba vtedy, keď nie je dirty marker.
- Pri dirty editore obnovu nespustí, zobrazí informáciu, že najprv treba uložiť rozpracované údaje. Formulár a jeho state sa nemenia.
- Tlačidlo je `type="button"`, nespustí ukladací `submit`.
- Fundraising pri čítacej chybe zostáva nedostupný, neotvára prázdny editovateľný list.
- Rovnaká reakcia je použitá pri redakčnej kontrole, duplicite, fundraisingu a proposals.

## Regresie

- `tests/admin-error-recovery-step8.test.mjs`: **runtime** test čistej klasifikácie canonical 404 / location failure / canonical D1 failure a legacy string decoder, plus source-contract test bezpečného retry a detailových fallback obrazoviek.
- `tests/organization-admin-read-recovery-integration.test.mjs`: integračný test skutočného `getOrganizationPublicationAdminById(128)` na syntetickom D1 readeri vrátane legacy NULL, chýbajúceho záznamu, invalid lifecycle a D1 failure.
- `tests/e2e/admin-error-recovery-step8.spec.ts`: pripravené read-only Playwright kontroly neplatného dekadického a príliš veľkého ID; nezasahujú do obsahu.
- Aktualizované staršie source-contract testy `tests/admin-editor-read-performance.test.mjs`, `tests/admin-page-streaming-step4.test.mjs` a `tests/admin-mobile-document-navigation.test.mjs`, ktoré zámerne odkazovali na predchádzajúcu podobu detailovej/error architektúry.
- `npm run test:admin-error-step8` je zapojený do `test:admin-pwa` bez nových závislostí.

**Dôležitá hranica verifikácie:** zatiaľ neprebehlo spustenie celej npm/Node/Playwright testovacej sady ani build na tejto branch. Reálny obsah produkčného záznamu #128, jeho skutočný error log a runtime latencia nie sú v tomto kroku dostupné. Test s ID 128 je **syntetický**, nie živý profil. Nie je potvrdené, že toto bola jediná príčina pádu.

## Zostávajúce úlohy

- **Krok 9/10:** skutočné Playwright Chrome/Safari-like/mobile testy, kontext zlyhania požiadaviek, RSC error fallback, retry, no-dirty vs dirty, SQL parity a výkonnostné merania. Overenie správania po návrate z PWA.
- **Krok 10/10:** zosúladiť PR #1318 s najnovším `main` (vetva bola na konci kroku 7 už výrazne pozadu), prípadné konflikty a pravdivá build/CI správa. Nečakať na CI medzi krokmi.
