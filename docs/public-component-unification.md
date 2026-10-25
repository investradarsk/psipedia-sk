# Verejné komponenty: zjednotenie pred zmenou vizuálu

Nadväzuje na mergnutý PR #1015 a checklist #1006. Táto etapa zachováva existujúce CSS, rozmery, texty, URL a správanie. Spoločné funkcie majú spoločný komponent; odlišné druhy obsahu ostávajú variantmi.

| Oblasť                   | Centrálna implementácia                                                                                      | Dokončenie v tomto PR                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formuláre a filtre       | `components/public-visual-system/public-form-controls.tsx`                                                   | Verejné kontakty, podnety, hodnotenia, hlásenia, adresa, lokalita a kalkulačka používajú spoločné vstupy. Kontextový textarea a select zachovávajú ref aj pôvodné CSS. |
| Karty a zoznamy          | DS-5 v `app/design-system.css`, existujúce typové karty, `public-result-states.tsx`                          | Spoločný prázdny stav pre homepage, obsahové sekcie, meniny, recenzie, novinky, organizácie, kluby, adopcie a hlásenia.                                                |
| Bannery                  | `PublicContextBanner`, `PublicMagazineBanner`, `PublicHelp*Banner`, `ContentHubCta`, `ArticlePromo`          | Obsahové CTA článkov vyčlenené do `PublicArticleCallout`; zachované sponsored odkazy a informácia o novom okne.                                                        |
| Galérie a obrázky        | `PublicPhotoGallery`, `PublicMediaFallback`, `ImageDisplay`, `BreedPhoto`, `EventImage`                      | Zvyšné opakované labkové fallbacky v prehľadoch pomoci, hlásení a organizácií používajú spoločný komponent s pôvodnou veľkosťou.                                       |
| Vyhľadávanie a navigácia | `HomePortalSearch`, `PublicSubcategoryNavigator`, `PortalSectionTabs`, `PublicFilterTag`, `PublicPagination` | Zachované spoločné implementácie z #1015 a existujúce URL/reset správanie.                                                                                             |

## Rozsah centralizácie

Variant `context` zachováva pôvodné CSS konkrétneho povrchu. Spoločný komponent riadi HTML a správanie; toto nie je tvrdenie, že všetky varianty už majú jediný CSS predpis. Budúca zmena grafiky musí upraviť príslušný centrálny variant a jeho existujúce štýly. Špeciálne súborové a skryté vstupy ostávajú natívne. Rozdielne bannery, ilustrácie podujatí a fotografie plemien sa nenahrádzajú rovnakým obrázkom.

## Overenie a otvorené body

- 675 relevantných Node/source/render testov prešlo pred aktualizáciou základu vetvy.
- Build prešiel; lint upravených zdrojov bez chýb, so siedmimi existujúcimi upozorneniami na obrázky.
- Tri staré kontroly `category-visual.test.mjs` zlyhávali aj na pôvodnom main základe; nie sú zahrnuté do uvedených 675.
- Existujúca browser matica detailov je zapojená do PR workflow vrátane screenshot artefaktov. Zahŕňa desktop a šírky 320/375/390/430/768; nie je úplnou vizuálnou akceptáciou všetkých stránok.
- Lokálna vizuálna a klávesnicová akceptácia všetkých dotknutých povrchov zostáva otvorená. CI ani nasadenie nie sú vyhlásené za úspešné.
- Bez merge a deploymentu; na CI sa podľa zadania nečaká. Body 4D, 5C, 6C a finálne prijatie 6D nemožno uzavrieť iba source testami.

## Dokončenie stavov a stránkovania po #1034

- Vyhľadávanie, kynologické kluby a recenzie profilov teraz používajú `PublicPagination`. Query parametre, kotvy, disabled prvky, texty a prázdne sloty vyhľadávania zostávajú pôvodné.
- Vyhľadávanie a mapa používajú `PublicEmptyState`; formulárové výsledky `PublicNotice`; mapové načítavanie `PublicLoadingState`.
- Kontextové hlášky zachovávajú pôvodné `role`, `aria-live`, `ref`, `tabIndex` a vnorené retry/reset tlačidlá. Kontextová hláška môže mať `role={null}` pre pôvodne neoznamovaný informačný obsah.
- `public-result-variants.module.css` vlastní pôvodné varianty stránkovania vyhľadávania/recenzií, mapových stavov a výsledkov hodnotení/hlásení. Lokálne CSS triedy ich len importujú cez `composes`.
- `public-result-global.css` vlastní existujúce globálne varianty stránkovania adresára, prázdneho vyhľadávania a formulárových výsledkov (kontakt, zmena profilu, tip redakcii, spätná väzba, overenie autora). Importuje ho `app/globals.css`.
- Nové varianty sa majú dopĺňať do týchto centrálnych súborov. Odlišné vzhľady zostávajú explicitnými variantmi; toto nie je nový grafický návrh ani tvrdenie, že každý špecifický prvok webu už používa rovnaké CSS.

Pred merge ostáva vizuálne prijatie presného PR commitu. Lokálne stiahnutie Chromium zlyhalo; PR označuje skutočne dotknuté cesty pre workflow `PR Visual Evidence`. Na CI sa podľa zadania nečaká.

### Ďalšie doplnenie po merge #1037

Pôvodne pripravované do #1037; po jeho merge pokračuje v jednom nadväzujúcom PR.

- Centrálne varianty prázdnych stavov: Pomoc psom, meniny, prehľad kategórií, podujatia, stratené/nájdené, redakčné sekcie, recenzie, novinky, populárne články a adopcie. Zhodný základ adopcií a hlásení je definovaný iba raz; špecifické vnorené prvky zostávajú variantmi.
- Mapové fallbacky pri čakaní na súhlas alebo nedostupnom podklade a stav mapového rendereru používajú PublicNotice. Životný cyklus mapy, súhlas, retry a odosielanie požiadaviek sa nemenia.
- Mapový indikátor načítavania vrátane animácie a prefers-reduced-motion má štýly v centrálnom súbore. Lokálne pravidlá okolitého layoutu (napríklad rozostup medzi štítkom menín a prázdnym stavom) zostávajú pri príslušnej stránke.
