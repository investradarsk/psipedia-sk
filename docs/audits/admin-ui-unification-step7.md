# Psipedia.sk — zjednotenie adminu, krok 7/18: mobilná stabilita

**Dátum:** 14. 11. 2026  
**Vetva:** `chore/admin-visual-unification-step2-audit-20261114`  
**PR:** #1369 (Draft). **Nie je povolený merge/deploy ani mutácia produkčných dát.**

## Zdrojový audit

Kroky 2–6 a dve várky Work auditu už zjednotili typografiu, medzery, formuláre, navigáciu, publikovanie, filtre a niektoré mobilné panely. Nový krok 7 cieli na konkrétne zostávajúce riziká pri úzkych viewportoch a soft klávesnici:

1. **Sticky editorový spodok a selektor sekcií:** `components/admin-editor-workspace.module.css` používa `.pageWorkspace .navigation { position: sticky }` a `.pageWorkspace .pageActions { position: sticky; bottom: 0 }`. Pri aktívnom inpute/textarea/rich texte môžu znížiť viditeľný priestor nad soft klávesnicou.
2. **Mobilný dialóg:** `dialog.workspaceModal[open]` pri ≤820px používal `width:100vw`, `height:100dvh`, bez výslovného `box-sizing` a safe-area paddingu. Riziko pri okrajoch iPhonu a rozdielnych viewport jednotkách.
3. **Tiptap popover:** paleta má 8 stĺpcov s 30px dotykovými plochami, HEX input a vloženie odkazu majú na mobile písmo pod 16px a farebný panel neudáva `box-sizing:border-box` (pri `width:100%` sa môže rozšíriť paddingom).
4. **Plemená – ďalšie akcie:** menu je absolútne pozicionované od tlačidla `left:0`, s až 300px šírkou. Keď je tlačidlo v zalomenej pravostrannnej footer lište pri 320px, menu môže vyjsť za pravý okraj.
5. **Dlhé predformátované bloky:** page-mode content neobmedzoval lokálne horizontálne posúvanie `<pre>` elementov.

Toto sú zdrojovo podložené riziká; bez skutočného iOS screenshotu nemožno tvrdiť, že všetky boli potvrdené vizuálne.

## Implementácia

- **Page-mode EditorWorkspace:** pri `@media(max-width:820px)` a fokuse skutočného textového ovládania (`input` bez file/hidden/checkbox/radio, `textarea`, `[contenteditable=true]`, `[role=textbox]`) sa `navigation` a `pageActions` dočasne zmenia zo sticky na `position:static`. Nestratia sa: používateľ sa k nim dostane bežným posúvaním, bez prekrývania soft klávesnicou. Pri blur sa vrátia do pôvodného sticky režimu. Značka `:has` je scoped iba na jednu `.pageWorkspace`; mení CSS, nie React state, save či navigation guard.
- **Modal EditorWorkspace:** mobilný dialóg zostáva fullscreen, ale používa `inset:0`, `box-sizing:border-box`, `width:100%; max-width:100%`, `height:100dvh` a safe-area padding. Vnútorný scroll modal editorov je zachovaný.
- **Tiptap popover:** `box-sizing:border-box` a `max-width:100%`; mobilná paleta so 4 stĺpcami, 44×44px swatches, 44px tlačidlá, 16px pre HEX a link input, výška popoveru obmedzená na `min(55dvh,420px)` s vnútorným scrollovaním. Všetky farby/odkazy a formátovacie funkcie zostávajú k dispozícii.
- **Plemená:** `Ďalšie akcie` pod 820px používa `position:fixed` prichytené k pravému bezpečnému okraju viewportu, max výšku/scroll a šírku rešpektujúcu safe area. Import z Notionu ani lifecycle handlery sa nemenia.
- **Dlhý kód:** výhradne `<pre>` v page-mode editore môže rolovať lokálne, nie celý dokument. Žiadne globálne `overflow-x:hidden`.

## Testovanie

**Node kontrakty:** `tests/admin-mobile-stability-step7.test.mjs` v existujúcom read-only workflow `.github/workflows/admin-typography-contracts.yml`.

**Playwright:** `tests/e2e/admin-mobile-stability-step7.spec.ts` je read-only a smie bežať iba na izolovanom localhost hoste. Overuje:
- 320, 375, 390, 430, 768, 1440px: po fokuse inputu editora plemien sú sekčný nav a spodná lišta `position:static` pri ≤820px a po blur zase sticky; 1440px zostáva sticky.
- 320/390/430px: rich-text článku, farebný popup nevybočí zo šírky viewportu, farebné tlačidlá majú min. 44×44px a HEX input 16px.
- 320/375/390/430/768px: menu ďalších akcií sa zobrazí v rámci viewportu.
- Všetky overované viewporty: `document.documentElement.scrollWidth <= clientWidth + 1`.

**Otvorené pred merge:**
- [ ] CI a Playwright na aktuálnom PR HEAD bez predošlých chýb.
- [ ] Skutočný iPhone / Safari: soft klávesnica, scroll fokusu, spodná bezpečná oblasť, otvorená paleta, otvorené menu a real viewport pri zmene orientácie.
- [ ] Reálne screenshoty presného HEAD na mobile 320/375/390/430, tablete 768 a desktope 1440.
- [ ] Zhodnotenie nasledujúcich Work auditov: Šteniatka, Sekcie, Psie meniny, Adresár a zostávajúce záložky plemien.

**Bez zmeny:** D1/R2, Notion, API, ukladanie, validácia, synchronizácia, oprávnenia, Google Maps, verejná stránka, existujúci modal focus trap.

**Ďalší krok 8/18:** zoznamy, tabuľky, vyhľadávanie, filtrovanie a stránkovanie; vychádzať z reálnych Work nálezov a výsledkov mobilných testov.
