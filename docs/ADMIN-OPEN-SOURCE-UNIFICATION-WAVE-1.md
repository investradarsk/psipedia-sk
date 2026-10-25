# ADMIN — Zjednotenie existujúcich open-source komponentov (vlna 1)

Nadväzuje na zlúčené PR #1035 a schválených desať open-source knižníc. Toto PR nespúšťa nové SaaS nástroje, nové účty ani D1 migrácie.

## Implementované bez zmeny dátových kontraktov

- **Lexical + Radix Dialog**: jednotné voliteľné tlačidlo na prípravu *nového* textu naprieč editormi podujatí, stratených/nájdených psov, organizácií, adresára, pomoci psom a histórie plemien. Text sa iba pridá do existujúceho políčka, nikdy sa neprevedie alebo neprepíše pôvodný HTML/Markdown/JSON formát.
- **React Dropzone**: jeden komponent pre dávkové nahratie obrázkov do galérií adopcií, stratených/nájdených psov, plemien a článkov. Zachováva existujúce URL/API/R2 backendy a ich kategórie.
- **dnd-kit**: spoločné drag-and-drop + klávesnicové radenie vo *štruktúrovaných* galériách plemien a článkov, ktoré navyše používajú vlastné meta polia `imageKey`, `alt`, `caption`, `credit`, `size`. Nezahadzuje tieto polia ani nemení schému. URL galérie adopcií a stratených/nájdených už mali radenie od #1035.
- Galérie majú zachované pôvodné tlačidlá posunu a odstránenia. Nahrávanie limitujú pôvodné limity profilu/článku.

## Ešte sa nezjednocuje bez dátovej migrácie

- Článkový redakčný rich-text (štruktúrované AST) sa nesmie plošne nahradiť Lexicalom, kým nebude obojstranný bezstratový prevod.
- Jednoobrázkové políčka (titulná fotka, OG, logá) nie sú galéria a používajú odlišný kontrakt.
- Komplexné zoznamy / tabuľky sa migrujú na TanStack len tam, kde to prinesie merateľný benefit a bezpečne zachová výber a akcie.
- Existujúce AdminModalDialog stále zostávajú kanonickou shared implementáciou; plošná výmena native `dialog` nie je bezpečná bez regresnej kontroly jeho focus/dismiss kontraktu.

## Overenie

`node --experimental-strip-types --test tests/admin-open-source-unification.test.mjs`

`node --experimental-strip-types --test tests/open-source-production-ui.test.mjs tests/open-source-final-adoption.test.mjs`

`node tests/breed-gallery-upload.test.mjs` (zachovanie partial-success, order, limitu a pôvodných metadát)

`node tests/admin-photo-gallery.browser.mjs` (320px, partial upload, keyboard buttons)

Scope je vlna 1: funkčné zjednotenie kompatibilných editorov, nie tvrdenie, že všetkých desať knižníc sa musí objaviť v každej obrazovke.

## Pokračovanie: ďalší editor a prístupnosť (25.10.2026)

- **Adopcie**: spoločný bezpečný Lexical/Radix nástroj aj pri hlavnom príbehu psa. Textarea zostáva súčasťou pôvodného HTML FormData odoslania pod `name=description`; zmena je len lokálny kontrolovaný UI stav bez migrácie údajov.
- **Jednotná akcia**: tlačidlo na spustenie Lexicalu využíva kanonický `AdminActionButton` a ikonu Lucide namiesto vlastného stylingu v každom editore.
- **Prístupnosť**: oddelený, pomenovaný skrytý file input od klikateľnej dropzóny; drag/drop sa nemení. Enter/medzerník programovo otvára výber, ktorý ostáva funkčný pre existujúce Playwright `input[type=file]` testy.
- **CI**: rozšírená cesta workflow na všetky dotknuté komponenty, opravený historický zlepený path filter; pokryté kontrakty a partial-success galérie.
