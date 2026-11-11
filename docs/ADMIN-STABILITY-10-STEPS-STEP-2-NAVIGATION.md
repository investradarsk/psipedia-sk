# Psipedia Admin – krok 2/10: stabilizácia prechodov a bezpečná obnova

**PR:** #1318 · **Vetva:** `fix/admin-stability-10-steps-20261111` · **Základ:** main po merge PR #1311  
**Režim:** bez zápisov do D1/Notion, bez produkčnej migrácie, bez zmeny lifecycle alebo tabuliek.

## Implementované opravy

### 1. Mobilné menu už nezablokuje obrazovku pri čakaní na RSC

Súbor: `components/admin-navigation.tsx`.

**Predtým:** otvorený mobilný drawer čakal so zatvorením až na zmenu `usePathname()`. Ak požiadavka na ďalšiu route trvala dlho alebo vôbec nedobehla, ostalo aktívne prekrytie obrazovky a `document.body.style.overflow = "hidden"`. Používateľ nemohol normálne ovládať zvyšok Adminu.

**Teraz:** klik na platný interný Admin odkaz v mobilnom draweri spustí okamžité zatvorenie pri `onClickCapture`, ešte pred soft navigáciou, aby sa uvoľnil overlay aj scroll. Modifikované kliknutia, nové karty, externé ciele a zachytenie už zrušené iným guardom sa neprepisujú. Ochrana rozpracovaného formulára ostáva na svojom mieste. `closeDrawer` s vynúteným presunom fokusu sa pri navigačnom kliknutí nepoužíva.

### 2. Otvorenie draweru nevyvolá zbytočný prefetch Admin stránky

Súbor: `components/admin-navigation.tsx`.

**Predtým:** po otvorení drawera programovo zameraný prvý link spustil `onFocus` a `router.prefetch`, aj na mobilnom zariadení bez hoveru. Na autentifikovaných D1-heavy RSC trasách to vytváralo zbytočnú konkurenciu pri načítavaní.

**Teraz:** prefetch na skutočný pointer/desktop zámer je povolený iba na zariadení s `(hover: hover) and (pointer: fine)`. Existujúci `prefetch={false}` a iOS dokumentová výnimka zostali zachované.

### 3. Verejný Ctrl/Cmd+K a overlay nezasahujú do Adminu

Súbor: `components/site-header.tsx`.

Root layout obsahuje verejný `SiteHeader` aj na `/admin`. Pred opravou boli aktívne dva nezávislé global `keydown` handlery Ctrl/Cmd+K (verejné vyhľadávanie a Admin command palette). Verejná vrstva okrem toho vedela uzamknúť `body.style.overflow`.

Na Admin trasách sa verejná klávesová skratka už neregistruje a verejný vyhľadávací overlay ani jeho scroll-lock efekt sa nespustia. Admin `Ctrl+K` zostáva funkčné.

### 4. Skutočne prijatý router transition možno bezpečne obnoviť

Súbory:
- `instrumentation-client.ts`,
- `lib/admin-navigation-recovery.ts`,
- `components/admin-navigation-recovery.tsx`,
- `components/admin-navigation-recovery.module.css`,
- `app/admin/layout.tsx`.

Globálny document-capture listener už **nespúšťa indikátor Admin navigácie predtým**, než ju môže editorový dirty guard zrušiť. Na Admin trasách sa pending stav odvodzuje od existujúceho `onRouterTransitionStart`, teda od skutočne prijatého soft prechodu (`push`, `replace`, `traverse`).

Prijatý prechod vyšle izolovanú udalosť s *validovaným interným Admin cieľom*; recovery komponent čaká 12 sekúnd na route commit. Po 12 sekundách sa zobrazí malý **neblokujúci** panel:
- `Skúsiť znova` zopakuje soft navigáciu cez router (okrem browser history traversal, aby nevznikol nesprávny history záznam),
- `Otvoriť v novej karte` bezpečne otvorí presnú internú trasu ako nový dokument, pričom pôvodný rozpracovaný editor zostane nedotknutý,
- `Zavrieť upozornenie` iba skryje panel.

Panely nezasahujú do odpovedí API, nikdy samy nerobia reload alebo mazanie údajov a pri skutočnom route commit sa skryjú. Ak je hlavné JS vlákno zablokované ťažkým synchronným výpočtom, timer nemusí bežať; to sa musí osobitne profilovať v krokoch 6/9.

**Zachované:** existujúce iOS document fallbacky pre `/admin` a `/admin/clanky`, Link/Back/Forward, serverové `Suspense`, editorové dirty guardy, TanStack tabuľky z PR #1311.

## Pridané regresné testy

- `tests/admin-navigation-recovery.test.mjs`: same-origin URL validácia, odmietnutie externých/unsafe cieľov, 12-sekundové časovanie.
- `tests/e2e/admin-stability-navigation.spec.ts`: jediná Admin Ctrl+K paleta, release mobilného drawera pri spomalenej RSC, simulovaný zaseknutý prechod s bezpečnou otvoriteľnou kartou a sekvencia Admin → Plemená → Články → Back → Forward.
- Unit test pridaný do existujúceho npm príkazu `test:admin-pwa` (bez novej závislosti).

## Stav overenia a zostávajúce riziká

**Overené staticky:** konkrétne konfliktné event handlery, predchádzajúce životné cykly mobilného prekrytia a navigačného indikátora; zdrojový kód zmien a navrhnuté cesty sú na pracovnej vetve.

**Zatiaľ neoverené runtime:** browser Playwright, čas RSC requestov, rozdiely iOS WebKit v standalone PWA, správanie po reálnom deployi, príčina konkrétneho pádu organizácie #128. Žiadne tvrdenie o zmeranom zrýchlení alebo vyriešení všetkých zamŕzaní sa zatiaľ nerobí. Testy pripravené na neskoršie spustenie; nečaká sa na CI medzi krokmi.

**Ďalší krok (3/10):** zjednotenie ochrany neuložených zmien a jej vzťahu k Link, programovej navigácii a browser history vo všetkých editoroch. Návrhy na dátovú / D1 optimalizáciu patria do krokov 4–6.
