# Adresár krok 3/4 – historické „null“ nastavenia obrázkov

Produkčný read-only audit `44833017573`:
- `STAGED=1843`, `missingActive=0`, `protectedUnstaged=4`.
- `comparableCurrentD1=1838`, `exactFieldMatches=1108`, `needsReview=735`.
- 730 porovnateľných profilov má obidve `invalid_legacy_*_display` upozornenia.
- Päť profilov (#118, #187, #231, #895, #1793) zmenilo D1 aj Notion revíziu.
- Nezistili sa voľnotextové SQL service/list mismatches.

## Zámer zmeny

Zachovať kontrakt existujúceho verejného čítania `readImageDisplayConfig()`: JSON `null` v textovom stĺpci a skutočné SQL NULL označujú **neprítomnosť vlastného výrezu obrázka**, nie problém, ktorý treba prepisovať. Predchádzajúci importný plán aj parity audit považovali JSON text `"null"` za neplatný obrazový objekt.

Doplnené:
1. `step2Plan` označí explicitný JSON null image display ako predvolené nastavenie.
2. `sqlFieldParity` rozlišuje SQL NULL, JSON null, platný display objekt a skutočne neplatný formát. Vypíše iba agregované **počty**, žiadny uložený JSON ani súkromné údaje.
3. Testy nad D1-fixture overujú null/default, explicitne pokazené JSON, bezpečné porovnanie bez aktualizácie D1.

## Čo tento PR úmyselne nerobí

Bez produkčných dátových zápisov, žiadneho presunu/mazania JSON, zmeny profilu, zmeny obrázka, `VERIFIED` alebo `SQL_ONLY`. Z reportu zatiaľ nevieme, **ktoré** historické hodnoty tvoria 730 prípadov. Po merge opakovať iba čítací `step3-audit` a z klasifikačných počtov určiť, koľko je legitímny default a koľko reálneho poškodenia. Revízne rozdiely piatich profilov zostávajú samostatným blokátorom.
