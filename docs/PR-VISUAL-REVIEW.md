# Psipedia — screenshoty z PR pred merge

## Povinný postup pri vizuálnych zmenách

Každá zmena viditeľná používateľovi (verejný web alebo Admin, farby, typografia, karty, formuláre, rozloženie, mobil) má obsahovať dôkaz, ako vyzerá **konkrétna pracovná verzia kódu pred merge**.

1. Agent vytvorí tematický PR a do jeho opisu uvedie samostatný riadok:
   `VISUAL_REVIEW_ROUTES: /,/admin/nastavenia`
   Uveď iba 1 až 4 skutočne dotknuté cesty. Používaj lokálne URL cesty bez query parametrov.
2. Workflow `PR Visual Evidence` sa spustí pre PR z nášho repozitára s týmto riadkom. Ak nie je prítomný, zostane preskočený, aby sa neplytvalo GitHub Actions minútami.
3. Checkoutne presný `head.sha` PR, pripraví lokálny build, oddelenú lokálnu D1/R2, Chromium a otvorí lokálny Vite server. Nikam sa nenasadzuje.
4. Vytvorí PNG pre desktop 1440×900 a mobil 390×844, vo variante viditeľná obrazovka aj celá stránka. Súbory, manifest a sumár uloží do `Artifacts` na stránke GitHub Actions behu.
5. Agent pripojí odkaz na tento beh do PR a uvedie jeho SHA, zobrazené cesty a prípadné obmedzenia. Vizuálnu zmenu schvaľuje vlastník až po pozretí obrázkov a relevantnom CI.

**Pozor:** Pôvodný `PSIPEDIA — Public Visual Screenshots` číta ostrú `https://psipedia.sk`. Nie je to screenshot novej zmeny. Je vhodný len ako porovnávací produkčný obraz *pred* zmenou.

## Bezpečnosť a náklady
- Nepoužívajú sa produkčné tajomstvá ani vzdialené D1/R2; Chrome blokuje externé požiadavky aj zápisy. Lokálna aplikácia má iba dispozičné testovacie údaje.
- Z tohto dôvodu nemusia byť viditeľné niektoré reálne profily, obrázky či údaje závislé od produkcie. **Chýbajúci obsah nezakrývaj predstieraným screenshotom**; pre také stránky najskôr pridaj lokálne testovacie fixtures.
- Workflow beží len na explicitne označených vizuálnych PR, maximálne štyri stránky × dva viewporty. Staršie behy rovnakého PR sa rušia.
- Ide o GitHub Actions spotrebu, nie o samostatný Cloudflare deployment. Bezplatnosť závisí od GitHub plánu a kvót.
- Screenshot v artefakte neznamená, že PR je hotový, alebo že sa má automaticky mergnúť.

## Pre autora PR
Ak workflow zlyhá, najprv skontroluj, či cieľová stránka beží s lokálnou D1. Neodstraňuj testy a nepovoľuj produkčné prístupy len kvôli obrázkom. Ak zmeníš screenshotovaný vizuál, obnov screenshot pre nové SHA.
