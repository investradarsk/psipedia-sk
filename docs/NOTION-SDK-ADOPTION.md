# Oficiálne Notion SDK – adopcia (31. 10. 2026)

## Zdroj a licencia
- Upstream: https://github.com/makenotion/notion-sdk-js
- Balík: `@notionhq/client@5.30.0`, MIT licencia
- Spôsob prevzatia: npm dependency, **nie manuálna kópia** knižnice
- Runtime: Node.js >= 22 / server-side Cloudflare Workers (bez `dangerouslyAllowBrowser`)
- Notion API verzia: `2025-09-03` (bez zmeny kontraktu)

## Implementované v tejto fáze
1. `lib/notion-webhook-contract.ts` deleguje overovanie podpisu surového tela na oficiálny `verifyWebhookSignature`.
2. `lib/notion-sync-shared.ts` používa oficiálne `Client.request` pre Notion JSON API. Zachováva pôvodné rozhranie `notionRequest`, adresy, parametre, limit počtu pokusov a zverejňované chyby.
3. Knižnica má vlastné možnosti retry; pri tejto adopcii sú **vypnuté**, aby sa neznásobovali s existujúcimi opakovaniami. Ich zjednotenie bude samostatná overená úprava.
4. Regresné testy kontrolujú podpis, GET, POST, PATCH, query, limity, chybové odpovede a neprítomnosť neautorizovaných volaní.
5. Nezmenili sa Notion ID, D1 schéma, žiadny sync receipt, publikačné rozhodnutie ani vlastníctvo polí.

## Pokrytie a hranice
Spoločný klient automaticky využívajú adaptéry používajúce `notionRequest`:
- `notion-directory-sync`, `notion-eshop-sync`, `notion-events-help-sync`, `notion-facebook-images-sync` a ďalšie moduly používajúce zdieľaný helper.

**Nie všetky adaptéry sú v tejto fáze prevedené:** `notion-article-sync`, `service-catalog-simple-sync` a ďalšie moduly majú vlastný transport. Nesmú sa mechanicky prepisovať v rovnakom kroku bez kontraktných testov (najmä import obrázkov, publikovanie a duplicitný POST).

Dôležité hranice:
- **Services V3**: Admin/D1 → Notion, nie voľný import nových možností z Notionu.
- **Google Maps / Place ID**: potvrdená geografická identita nesmie byť nahradená názvom alebo adresou z Notionu.
- **Facebook obrázky**: súhlasy s publikovaním a hotové publikácie zostávajú pod vlastníctvom Adminu.
- **Notion → Admin** webhooky: overený podpis, existujúci D1 inbox, idempotencia, cielená reconciliácia a hodinový safety sweep.
- **Gmail → Notion**: bežiaci Apps Script poller je mimo repozitára; tento PR ho nemení.

## Akceptácia
- `npm ci` s aktuálnym lockfile.
- `npm run test:notion-events-help-sync`, ostatné Notion/fb suites, `npm run build` v CI.
- Test signed webhook (vrátane zmenených bajtov), ownership, insert do D1 až pred HTTP 200, opakované doručenie.
- Test jednoho poľa (napr. Beauceron Deti 2 → 4) **sa nevyhlasuje za opravený touto výmenou SDK**. Vyžaduje samostatné testovanie reconciliation/legacy receipt a produkčného D1 inboxu.
- Pred merge kontrolovať SDK bundle vo Worker produkčnom smoke a nediskutovať o nasadení ako o úspešnom, kým nie je.

## Ďalšie fázy
1. Spoločná diagnostika doručenia a pracovných receipts pre všetky agendy.
2. Overené východiskové hodnoty jednotlivých polí; neverifikované konflikty nechávať na kontrolu.
3. Kontraktné testy jednotlivých zvyšných transportov, ich postupné prepnutie na SDK.
4. Konfigurovateľné pravidlá autority polí až po bezpečnom nasadení (zvláštne pre Admin, Notion, Google Maps a vydavateľské súhlasy).
