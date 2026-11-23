# Admin V5 — realizácia auditov 1–7 v desiatich nezávislých pracoviskách

Stav: **DRAFT / realizačný plán**, nie dokončená implementácia. Všetkých 10 chatov zapisuje **výhradne do tejto spoločnej vetvy a jedného PR**. Jednotlivé chaty nesmú vytvárať vlastný PR, nesmú mergovať ani force-pushovať.

## Základ a integrované opravy

Základ je `main` na commite `4ba8daa948c064cfae9a04ab0082b21e580949fc`.
Mergnuté: #1568 — podujatia CAS a D1/Notion výsledok; #1569 — V5 compact CSS, ovládanie a tabuľky; #1570 — zastarané nálezy, CAS a stránkovanie; #1571 — kalendár podujatí; #1573 — verejné vyhľadávanie; #1574 — obľúbené články.
V okamihu vytvorenia: #1566 Partner podania 8/8 a #1572 návrat na Admin Prehľad sú **OPEN** a ich súbory sa nesmú upravovať, kým sa nezlúčia. #1575 a #1576 sú samostatné otvorené PR pre verejné vizuály; tých sa netýka táto úloha.

## Pravidlá pre súbežné zápisy

- **Každý chat** pred zmenou načíta aktuálne HEAD spoločnej vetvy a `main`; pracuje iba v súboroch svojej sekcie. Pred zapisovaním každého commitu znova načíta spoločný HEAD a obnoví svoju prácu na tomto HEAD. Ak sa HEAD pohol alebo existuje konflikt, obnoviť / rebase / cherry-pick vlastný lokálny commit a skúsiť bezpečný push bez prepisovania. Nikdy `--force` ani `--force-with-lease`.
- **Žiadny chat** nemá právo upraviť súbor, ktorý v rovnakom okamihu upravuje iný chat; pri nutnom dotyku cudzej sekcie ponechať nahlásený blokér a nič nasilu neprepísať.
- Každý commit používa prefix `V5-01:` až `V5-10:`, každý chat v PR pridá krátky komentár o súboroch, testoch a zostatkových rizikách. Bez ďalších PR, bez automatického merge.
- Zachovať Cloudflare Access, D1 modely, field-level Notion a review locks, Partner workflow, kontakt ako plain-text, URL a SEO verejného webu, Google Maps nákladový limit a ručné spúšťanie, ochranu neuložených zmien, article Tiptap a mobilné 44 px ciele.
- Každý chat doplní relevantné unit/regresné testy. Nehovoriť, že CI je zelené, bez overenia. Merge až po doriešení #1566 a #1572, synchronizácii aktuálneho `main`, integračných testoch a súhlase vlastníka.
- Žiadne plošné prepisy existujúcich editovacích komponentov, nová CSS override vrstva ani zbytočné D1 migrácie.

## Desať pracovísk (bez prekrývania vlastníctva)

| ID | Pracovisko | Primárne súbory / vlastníctvo | Akceptačné kritériá |
|---|---|---|---|
| V5-01 | Šteniatka v Admine | `app/admin/steniatka/**`, `components/admin-puppy-*`, `components/admin-section-editor.tsx`, súvisiace testy | Jeden editor článkov a jeden editor sekcií; zachovať upload a redakčné pokrytie; pôvodné URL bezpečne presmerovať alebo nechať kompatibilné; zatiaľ **nemení bočné menu** |
| V5-02 | Jeden zoznam Adresára | `app/admin/adresar/page.tsx`, `app/admin/sluzby-pre-psov/page.tsx`, `components/admin-directory-module-nav.tsx`, `components/admin-directory-dashboard.tsx`, testy | Jeden kanonický zoznam, zachovať kategórie, GET filtre, return-to, Editor a cestu `/admin/sluzby-pre-psov/katalog` |
| V5-03 | Recenzie a testy | `app/admin/recenzie/page.tsx`, `components/admin-reviews-hub*`, testy | Zrušiť iba nadbytočný veľkokartový rozcestník, nahradiť kompaktnými akciami/záložkami; zachovať e-shopy, moderáciu a rozdiel články vs hodnotenia |
| V5-04 | Pomoc psom – kompaktný prehľad | `app/admin/pomoc-psom/page.tsx`, `components/admin-help-unified-table*`, testy | Jeden prehľad so všetkými kategóriami, výberom a správnymi detail odkazmi; zachovať editor Adopcie/Stratené/Organizácie/Pomoc a privátne kontakty |
| V5-05 | Kvalita, SEO a mapové nástroje – navigácia nástrojov | `app/admin/kvalita/**`, `app/admin/kontrola-odkazov/page.tsx`, `app/admin/mapy/page.tsx`, `app/admin/nastroje/page.tsx`, prezentačné komponenty, testy | Prehľadné podzáložky bez duplicít; zachovať oddelené dátové modely SEO, nálezov, odkazy a Mapy; žiadne implicitné platené vyhľadávanie alebo zmeny v #1570 |
| V5-06 | Notion status a diagnostika | `app/admin/nastavenia/notion/page.tsx`, `app/admin/nastroje/notion-audit/page.tsx`, `components/admin-notion-field-settings.tsx`, `components/admin-notion-sync-overview.tsx`, `lib/notion-sync-overview.ts`, testy | Jasné D1/Notion stavy; odlišovať čaká/konflikt/zlyhané; existujúce priority polí overiť a neodstraňovať ich slepo; bez zmien core sync |
| V5-07 | Články – výsledok viacstupňového uloženia | `components/admin-article-editor.tsx`, `app/api/admin/articles/[id]/route.ts`, `lib/notion-article-sync.ts`, súvisiace testy | Čitateľný úspech D1 a nezávislé Notion/FB stavy bez falošného failure alebo dvojitého POST; uchovať Tiptap, média a schedule |
| V5-08 | Services V3 – multi-category | `lib/service-catalog-admin-store.ts`, `lib/service-catalog-public-profile-services.ts`, `lib/service-catalog-notion-relations.ts`, `app/admin/adresar/[id]/page.tsx`, súvisiace API/testy | Služby platné aj pre sekundárnu kategóriu profilu; server-side validácia podľa všetkých membership kategórií; bezpečné zmeny a synchronizácia, bez `app/admin/adresar/page.tsx` |
| V5-09 | Admin mutačné API – provenance / CSRF | `lib/admin-mutation-origin.ts`, vybrané `app/api/admin/**` mimo vlastníctva iných chatov, samostatné testy | Zjednotiť strict same-origin kontrolu tam, kde reálni klienti posielajú podporované hlavičky; zachovať Access, PWA a kompatibilitu; nezaviesť plošné zákazy a nezasiahnuť Partner/Podujatia/Article/Service Catalog endpointy |
| V5-10 | Navigácia, Ctrl+K, upozornenia a definitívne vyčistenie menu | `lib/admin-navigation.ts`, `components/admin-navigation.tsx`, `components/admin-quick-navigation*`, `app/admin/operations/page.tsx`, `components/admin-attention-queue*`, `lib/admin-attention-queue-store.ts`, testy | **ZAČAŤ AŽ PO MERGE #1566 a #1572 a synchronizácii main**; bezpečný návrat Prehľad, ponechanie Podania, odstránenie redundantného Šteniatka a menu aliasov, rozlíšiť unread/pending/history bez zmeny skutočného moderation stavu |

## Spoločný release gate

Pred READY vyhodnotiť CI, diff proti poslednému main, zmenené verejné URL, Tiptap save, Partner SUBMIT→OWNER, Notion review locks, autorizáciu mutácií, mobilné 44px ciele a scénare návratu na `/admin`. Jeden PR ostáva Draft až do integračného overenia.
