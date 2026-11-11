# Psipedia Admin – krok 3/10: jedna ochrana neuložených zmien

**PR:** #1318, vetva `fix/admin-stability-10-steps-20261111`  
**Charakter:** čisto klientská navigácia; bez mutácií produkčných údajov, Notion synchronizácie, D1 tabuliek a lifecycle API.

## Skutočná príčina kolízií v kóde

Pred opravou existovali rôzne nezlučiteľné spôsoby ochrany:
- Podujatia a organizácie registrovali vlastný document-capture `click` aj `window.navigation.navigate` listener; podujatia mali zároveň ďalší `beforeunload` cez `EditorWorkspace`.
- Adopcie, Pomoc psom a Stratené/Nájdené zachytávali iba odkazy *vo formulári*, nie globálny sidebar, breadcrumb alebo Ctrl+K.
- Adresár strážil najmä tlačidlo „Späť“; články mali vlastný `beforeunload`; e-shopy a Gemini prompty samostatné potvrdzovanie.
- Služby V3 používali blokujúci `window.confirm`, hoci na tom istom detaile môže byť rozpracovaný aj základný profil.

Tieto rozdiely sú preukázané statickou kontrolou. Či priamo spôsobovali konkrétne zamŕzanie používateľa, ostáva závislé od reprodukcie v prehliadači.

## Implementácia

### Spoločná navigačná brána

`components/admin-editor-navigation-guard.tsx` + `lib/admin-editor-navigation.ts`:

- Voliteľná registrácia jediného `document.addEventListener("click", ..., true)` a Navigation API `navigate` listenera **iba ak je editor dirty**. Všetky listenery sa čistia po unmount alebo uložení.
- Čistý editor neblokuje žiaden Link. Pri zmenách funguje presné overenie rovnakého originu, rozdielnej cesty/query a modifikovaných kliknutí. Hash-only prechod, nové karty a súbory sa ignorujú.
- Pri potvrdení používateľa sa zopakuje pôvodný `anchor.click()`, nie vymyslený `router.push` – zachová sa Next.js Link/história/URL.
- Programové Ctrl+K navigácie vysielajú cancelable intent s callbackom pôvodnej akcie; neobchádzajú ochranu draftu.
- Navigation API `traverse` sa obnovuje cez **presný destination key**, nie slepým `history.back()`, ktorý by mohol nesprávne spracovať Forward.
- Záznam v `<html data-admin-unsaved-editor>` upozorňuje existujúcu iOS full-document výnimku, aby dirty guard nepredbehla.
- Potvrdený odchod nastaví dočasný bypass; po 2 sekundách sa ochrana znovu aktivuje, pokiaľ sa prechod nedokončil.
- **Viac dirty častí na jednej stránke:** centrálna množina aktívnych guardov dá jednému potvrdeniu oprávnenie opustiť celý detail; nevzniká slučka dvoch modálov pri adresári + Services V3. Bez potvrdenia odchod nevykoná.
- Vlastný form state, save/revision tracking, Notion sync a D1 API zostali na pôvodných miestach.

### Rozsah zapojených komponentov

- `components/admin-editor-workspace.tsx`: jedno modálne potvrdenie pre **zatvorenie** aj pre externú zmenu sekcie; jedna registrácia `beforeunload`. Tým sú pokryté editory používajúce Workspace (články, plemená, podujatia, e-shopy, sekcie, šteniatka).
- `components/admin-event-editor.tsx`: odstránený duplicitný document capture/Navigation API/guard; existujúci uložený snapshot a `allowNavigationRef` pre úspešné vytvorenie zostali.
- `components/admin-organization-editor.tsx`: ručne zdvojený navigation handler nahradený spoločným hookom, stále vlastné form údaje/uloženie.
- `components/admin-unsaved-form-links.tsx`: naďalej spravuje inkrementálnu revíziu, file input a acknowledgment save, ale globálnu navigáciu deleguje. Adopcie, Pomoc psom a Stratené/Nájdené odstránili lokálny `onClickCapture`.
- `components/admin-directory-editor.tsx`: zrušené špeciálne zachytávanie jediného „Späť“ odkazu a stav `confirmDirectoryExit`; ochrana je teraz pre celý Admin.
- `components/admin-article-editor.tsx`: zrušený duplicitný `beforeunload`, Workspace rešpektuje ref pri úspešnom presmerovaní.
- `components/admin-breed-editor.tsx`: úspešné vytvorenie dostalo explicitný ref, aby na uloženom zázname nevyskočilo falošné upozornenie.
- `components/admin-quick-navigation-dialog.tsx`: Ctrl+K programové zmeny používajú spoločné cancelable intent rozhranie; iOS výnimka zostala.
- `components/admin-eshop-editor.tsx` a `components/admin-gemini-category-prompt-editor.tsx`: odstránené samostatné navigačné modály, teraz spoločný systém.
- `components/admin-service-profile-values.tsx`: nahradený blokujúci `window.confirm` vlastným zdieľaným guardom; databázové verziované zápisy nezmenené.
- `components/admin-mobile-document-navigation.tsx`: iOS fallback ustúpi rozpracovanému formuláru.

## Testy

Zmenené existujúce source-contract testy iba tam, kde kontrolovali odstránené duplicity. Doplnené:
- `tests/admin-editor-navigation-guard.test.mjs`: validácia same-origin path/query vs hash/external, existencia centralizovanej ochrany a jediného beforeunload ownera.
- `tests/e2e/admin-editor-navigation-guard.spec.ts`: čistý editor neblokuje sidebar, dirty editor umožní Zostať alebo Zahodiť bez zápisu, Ctrl+K neobíde potvrdenie.
- Test zaradený do existujúceho `npm run test:admin-pwa` bez ďalšej knižnice.

**Skutočné spustenie testov:** v kroku 3 zatiaľ nebolo vykonané. Nedeklarujeme úspešný build, Playwright ani vyriešenie všetkých zamŕzaní. Pri finálnom testovaní overiť iOS WebKit, Back/Forward v prehliadačoch bez Navigation API, simulovanú dlho trvajúcu RSC a súbeh dvoch dirty editorov. Ak prehliadač nevie spoľahlivo interceptovať History traversal, nemožno sľúbiť rovnakú SPA modal UX – natívny beforeunload stále chráni tvrdé navigácie.

## Nasleduje krok 4/10

Oddeliť hlavný admin obsah od sekundárnych D1/Notion čítaní a odstrániť blokovanie navigácie na zoznamoch a detailoch (hlavne `/admin/organizacie/128`). Final rebase na aktuálny `main` a úplné merania pred/po patria do kroku 10.
