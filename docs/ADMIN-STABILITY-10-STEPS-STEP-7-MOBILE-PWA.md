# Psipedia.sk – Admin stabilita, krok 7/10: iOS, mobilné menu, PWA a push

**Jediný PR:** #1318  
**Vetva:** `fix/admin-stability-10-steps-20261111`  
**Záruka:** bez migrácie, D1/Notion zápisov, publikovania či zmeny endpointov.

## Zistenia z existujúceho zdrojového kódu

1. `AdminMobileDocumentNavigation` už používal na iOS dokumentový prechod na `/admin` a `/admin/clanky`, ale pri potvrdenom zahodení zmien sa `data-admin-unsaved-editor` odstránil až po odchode komponentu. Ochrana preto mohla preskočiť dokumentový fallback práve pri potvrdenom opakovaní linku.
2. Mobilný drawer v `AdminNavigation` drží `document.body.style.overflow = "hidden"`. iOS standalone PWA môže zmraziť/obnoviť dokument aj počas otvoreného menu, čím sa na obrazovke ponechá nereagujúca vrstva alebo zámok scrollu.
3. `AdminNavigationRecovery` držal 12-sekundový watchdog aj pri prerušení života PWA na pozadí.
4. `AdminPwaRegistration` pri prvom prechode zo starého root scope service workera vykonal `window.location.reload()`. Tento reload nevyžaduje navigáciu používateľa a môže zničiť rozpracovaný formulár.
5. `public/sw.js` pri push kliknutí používal `existing.navigate(target)` a obchádzal dirty-form guard. Aj samotné `openWindow(target)` pri už otvorenej standalone iOS PWA nemusí garantovať vznik oddeleného okna.

## Implementácia

### iOS dokumentový fallback po potvrdení

`components/admin-editor-navigation-guard.tsx`:
- Pri výslovnom potvrdení odchodu dočasne nastavuje `data-admin-exit-authorized` a po vypršaní existujúceho 2-sekundového povolenia ho odstráni.
- Pri unmount posledného dirty editora odstráni aj autorizačný marker.

`components/admin-mobile-document-navigation.tsx`:
- Ak je editor dirty a prechod nebol potvrdený, nesmie automaticky vykonať hard navigation.
- Po potvrdení je dokumentový fallback na iOS povolený pre pôvodné dve rizikové trasy, aj keď dirty marker ešte existuje.
- Ostatné prehliadače a admin trasy pokračujú pôvodnou Next navigáciou.

### Mobilný drawer a watchdog

`components/admin-navigation.tsx`: pri `pagehide`, `pageshow` a `visibilitychange:hidden` zatvorí drawer a obnoví predošlý `body.style.overflow`; všetky event listenery sa korektne odstránia. Draft a jeho obsah sa nemenia.

`components/admin-navigation-recovery.tsx`: pri `visibilitychange:hidden` vyčistí zastarané notifikácie o prechode. Pôvodný watchdog pre skutočné 12-sekundové zdržanie zostáva.

### PWA registrácia bez automatického reloadu

`components/admin-pwa-registration.tsx`:
- Starý root `/sw.js` scope sa odregistruje a nový sa registruje výlučne s `/admin/` scope.
- Odstránené automatické `window.location.reload()`, sessionStorage migračný marker a akýkoľvek auto refresh počas editácie.
- Stav online/offline sa obnovuje na `pageshow` a pri návrate do popredia pomocou `visibilitychange:visible`.
- Service worker naďalej **neinterceptuje fetch**, neukladá admin odpovede a nemá offline mutation queue.

### Push bez straty neuložených zmien

`public/sw.js`:
- Zhodná otvorená Admin karta sa iba aktivuje (`focus()`).
- Ak je otvorená iná Admin karta, worker ju **nepresmeruje** a nevolá `openWindow()`. Namiesto toho posiela `postMessage({ type: "psipedia-admin-push-intent", url: safeAdminPath(...) })` a aktivuje existujúcu.
- Ak žiadne Admin okno neexistuje, `self.clients.openWindow(target)` naďalej priamo otvorí bezpečný cieľ.
- Cieľ je vždy obmedzený na admin trasu a je validovaný aj v klientskom prijímači.
- Ak postMessage zlyhá, Admin sa stále aktivuje bez straty draftu.

`components/admin-pwa-registration.tsx` zobrazí malý neblokujúci panel s odkazom `Otvoriť upozornenie`; odkaz je normálny Next Link, ktorý musí prejsť cez existujúcu ochranu neuložených zmien. Panel je možné zavrieť. Offline hlásenie a push oznámenie zdieľajú jeden vertikálny kontajner s rešpektovaním mobilného safe-area, aby sa neprekrývali a neblokovali ostatný obsah.

## Regresie

- `tests/admin-mobile-pwa-step7.test.mjs`:
  - **Realistická izolovaná simulácia pôvodného `public/sw.js` pomocou Node `vm`**: rovnaký cieľ aktivuje existujúcu kartu; iný cieľ posiela správu; nespúšťa nepovolené presmerovanie ani `openWindow` už otvorenej PWA; bez okna sa otvorí admin cieľ; externý URL sa bezpečne odmietne.
  - Source kontrakty: ochrana pri potvrdenom odchode, scope migrácia bez reloadu, PWA resume, mobile drawer scroll unlock a lifecycle listener cleanup.
- `tests/admin-pwa.test.mjs`: upravený pôvodný kontrakt, ktorý predtým vyžadoval `existing.navigate(target)` – teraz ho explicitne zakazuje.
- `tests/e2e/admin-mobile-pwa-step7.spec.ts`: pripravené Playwright read-only iPhone scenáre BFCache drawer obnovy a push odkazu pri dirty formulári.
- `npm run test:admin-mobile-step7` pridané do existujúceho `test:admin-pwa`. Bez nových balíkov.

**Overenie:** zdrojové zmeny, kontrola testovacích kontraktov a GitHub commit áno. Skutočné lokálne Node testy, Playwright, iOS Safari na fyzickom zariadení, build/CI a reálne meranie frekvencie zamrznutia **neboli vykonané**. Ani úspešný statický audit preto neznamená potvrdené odstránenie všetkých iOS zamrznutí.

## Známe zvyšné riziká / pokračovanie

- Dirty editor pri niektorých Safari back/forward prechodoch bez Navigation API ostáva limitom pôvodného Step 3 guarda. Mechanicky nesimulovať `history.pushState` ani cyklické `back()` bez browser testov.
- iOS standalone `openWindow()` môže byť obmedzené; existujúci Admin sa preto zámerne nepresmerúva a používateľ musí kliknúť na bezpečný odkaz.
- Krok 8: zotavenie chybových komponentov a detailu organizácie #128, kontrola bielej obrazovky.
- Krok 9: Playwright E2E na simulovanom iPhone + ideálne skutočné iOS Safari, výkon a memory.
- Krok 10: integrácia s najnovším `main`, Build/CI, finálny bezpečnostný prechod a regresie.
