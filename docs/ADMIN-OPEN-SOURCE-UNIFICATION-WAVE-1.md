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


## Vlna 3 — jednotné nahrávanie jednej fotografie

- Nahrávanie primárnej fotografie cez **jeden spoločný React Dropzone**: podujatia, pomoc psom, adresár, organizácie, adopcie, stratené/nájdené psy, plemená, články a článkové Open Graph obrázky.
- Klávesnica Enter/medzerník, drag/drop a pomenovaný file input. Všetky kanonické upload routy, R2 priečinky, odstránenie obrázka, nastavenia výrezu a persistované údaje zostávajú vlastníctvom pôvodného editora.
- `adminSelectedImage` mení file-picker alebo Dropzone File na ten istý vstup; pri starom HTML inpute vymaže výber pred asynchrónnym nahrávaním.
- `AdminSingleImageUpload` nikdy nezapisuje údaje do profilu a nikdy nespúšťa publikovanie. Rovnaký komponent možno vizuálne vylepšiť pre všetky editory centrálne.
- Nový `tests/admin-single-image-unification.test.mjs` pokrýva parity a používateľské rozhranie; produkčné testy doplnené do CI.

## Vylepšenie radenia (dnd-kit)
- Rovnaký generátor identít pre URL galérie (adopcie / lost-found) a štruktúrované galérie (plemená / články). Stabilita identít po presune obrázka znižuje stratu focusu pri klávesnicovom ovládaní. Duplicitné historické URL sú rozlíšené poradím výskytu; metadáta ostávajú v originálnych entitách.

## Vlna 4 — modálne potvrdenia a ďalšie editory

- Stiahnutie **článku** už používa spoločný prístupný `AdminDestructiveConfirmDialog`, nie systémové `window.confirm`. Pri Escape/zrušení sa žiadny zápis nevykoná; potvrdenie zavolá existujúci `save("draft")`.
- Stiahnutie **podujatia** používa rovnaký komponent, ale zachováva pôvodné názvy tlačidiel, akcie a PUT správanie. Staré E2E zostávajú relevantné.
- Spoločné potvrdzovacie okno má voliteľné `cancelLabel` na zachovanie kontextovo správneho textu bez vytvárania ďalšieho modálu.
- **E-shopy**: Lexical/Radix doplnený k plain-text popisu a spoločný picker loga (`eshops` R2 priečinok). Ani `focusTags`, ani dátový kontrakt sa nemení.
- **Šteniatka / oblasti**: spoločný picker fotografie (`articles` priečinok) a opt-in Lexical textový návrh pre plain-text `intro`; pôvodné poradie, kanonické `PUT /api/admin/sections` a obsah iných sekcií zostávajú nezmenené.
- E2E scenár pri publikovanom článku skúša **zrušenie** aj **potvrdenie** stiahnutia; kontraktový test potvrdzuje používanie shared komponentov.

## Vlna 4b — jednotné potvrdenia aj v nastavení webu

- Administrácia navigácie: pred odstránením položky alebo jej podmenu sa otvorí spoločný `AdminDestructiveConfirmDialog`. Po potvrdení sa mení iba lokálna pracovná kópia menu; používateľ musí samostatne kliknúť na `Uložiť navigáciu`.
- Administrácia sekcií: podobne sa cez ten istý dialóg potvrdzuje odstránenie podsekcie. Existujúca `PUT /api/admin/sections` logika sa nemení.
- Zrušenie/Escape nesmie upraviť ani uložiť nič. `AdminDestructiveConfirmDialog` zabezpečuje rolu, titulok, focus a návrat na tlačidlo.
- Kontraktové testy aktualizované z historickej povinnosti používať `window.confirm` na povinnosť použiť shared dialóg so zachovaným staging/save workflow.


## Vlna 5 — neuložené zmeny
- Gemini prompty a e-shop späť: odstránené pôvodné prehliadačové `window.confirm`, nahradené spoločným dostupným potvrdením `AdminUnsavedNavigationDialog`. Bez D1 migrácií, automatického publikovania a bez spustenia platených Gemini operácií.
- Zostať je predvolená bezpečná akcia, potvrdzovanie nevykonáva zápis ani neprepisuje text.

## Vlna 6 — partnerské rozhodnutia a bezpečné potvrdenia (25.10.2026)
- **Prevzatie profilu (claim)** aj **overenie správcu** namiesto natívneho `window.confirm` používajú existujúci `AdminDestructiveConfirmDialog`. Schválenie / overenie má primárnu akciu, zamietnutie deštruktívnu.
- Spoločné potvrdenie vždy zaostrí **Zrušiť**; pri prebiehajúcej operácii blokuje tlačidlá aj zavretie Escape. Žiadny PATCH nie je spustený samotným otvorením dialógu.
- Existujúce PATCH endpointy, parametre `decisionNote` / `reviewNote`, OWNER a verification pravidlá, `router.refresh` a chybové hlásenia zostávajú nezmenené.
- `tests/admin-unified-partner-confirmations.test.mjs` kontroluje bezpečnú modalitu a zachovanie pôvodných kontraktov; produkčný workflow spúšťa test aj lint všetkých troch dotknutých komponentov.

## Vlna 7 — návrhy úprav a nové partnerské profily (25.10.2026)
- Zdieľaný `AdminDestructiveConfirmDialog` pri **schválení/zamietnutí partnerskej zmeny**, **vytvorení konceptu alebo prepojení nového profilu**, **rýchlom prepojení kandidáta** a **schválení/zamietnutí verejného návrhu úpravy Adresára**.
- Rozhodnutia sa najskôr pripravia v lokálnom stave; zrušenie/Escape nevykoná mutáciu. Pri novom profile sa pred potvrdením zachytí `canonicalId`, `applyImage` a `reasonCode`, aby request zodpovedal videnej voľbe. Neplatné canonical ID sa nepustí do potvrdenia.
- Existujúce `PATCH /api/admin/partners/changes/[id]`, `PATCH /api/admin/partners/submissions/[id]` a `PUT /api/admin/profile-change-requests/[id]` ostávajú nezmenené; Adresár automaticky neprepisuje profil po schválení návrhu.
- Nové kontraktové regresné testy `tests/admin-unified-review-confirmations.test.mjs` a lint v produkčnom open-source workflow.

## Vlna 8 — lifecycle organizácií a kompatibilita partnerského E2E (25.10.2026)
- Každá individuálna akcia publikovať / stiahnuť do konceptu / archivovať / obnoviť v prehľade organizácií otvára **jeden zdieľaný** `AdminDestructiveConfirmDialog`, nie `window.confirm`. Potvrdenie vykoná presne pôvodný `PUT /api/admin/organizations/[id]/publication` vrátane optimistickej kontroly `expectedUpdatedAt`; zrušenie a Escape nič neodosielajú.
- Hromadné operácie si ponechávajú zdieľaný `AdminModalDialog`, detailnú informáciu o eligible/blocked položkách, pôvodný `POST /api/admin/organizations/bulk`, stránkový výber aj ochranu verzie. Bezpečný fokus je na Zrušiť.
- Opravená regresia **Partner platform security and UX**: Playwright test ešte akceptoval natívny prehliadačový dialog, ale po vlnách 6–7 sa potvrdenie zmenilo na vlastný modal. Aktualizované E2E teraz skutočne otvárajú a potvrdzujú zdieľané modály (vrátane zrušenia pri CREATE). Native potvrdenia zostávajú iba pri nedotknutom editore partnerských podujatí.
- Nový regresný `tests/admin-unified-organization-confirmations.test.mjs` a existujúci `tests/organization-dashboard-hydration.test.mjs` v CI. Žiadne R2/D1 migrácie, zmena publikovania, Notion alebo deployment.

## Vlna 9A — jednotný stav uloženia a chyby (25.10.2026)
- Založený kanonický prezentačný komponent `AdminFormFeedback`: tri navzájom výlučné stavy `saving` / `success` / `error`, s prístupným `role="status"` alebo `role="alert"`. Chyba má prednosť pred loadingom, úspech sa ukáže len po dokončení.
- Prvá adopcia: editory **Adopcie** a **Stratené/Nájdené**. Zostávajú pôvodné `fetch` endpointy, stavové prechody, bezpečnostné pravidlá, chyby aj presmerovanie.
- Centrálny CSS modul umožní neskoršie jednotné vizuálne vylepšenie. Nasledujúce diely v rovnakom PR: Pomoc psom/Plemená, chyby konkrétnych polí, potom konzistentná navigácia pri neuložených zmenách.

## Vlna 10 — spoločné ukladanie ďalších troch editorov (25.10.2026)
- Spoločný prezentačný komponent `AdminFormFeedback` teraz využíva aj **E-shop**, **Organizácie** a **Adresár**. V Adresári sa používa aj vo vetve archivovaného profilu, ktorá poskytuje samostatný stav „Obnovujem…“.
- Jednotný prístupný `role="alert"` pri chybe, `role="status"` pri úspechu/čakaní a spoločné centrálne farby. Tlačidlá, canonical/Notion režimy, serverové validácie, optimistické verzie, ukladanie bez zmeny publikovania a správanie pri návrate zostávajú nedotknuté.
- Regresie rozšírené v `tests/admin-shared-form-feedback.test.mjs`; lint a produkčný build v existujúcom CI. Ďalší krok: ostatné editorové plochy a jednotná ochrana neuložených zmien bez prepisu API.

## Vlna 11 — Podujatia a Články (25.10.2026)
- **Podujatia**: `EditorActionBar` má spätnokompatibilný voliteľný slot `feedback` pre existujúci `AdminFormFeedback`. Chybový `role="alert"` nie je vnorený do ďalšieho `role="status"`, zatiaľ čo samostatné „Neuložené zmeny“ zostáva dostupné.
- **Články**: úspech, ukladanie aj chyba používajú ten istý komponent; pôvodný `resultRef` a `tabIndex=-1` zostávajú na vonkajšom wrapperi. QA blocker stále automaticky zameria relevantnú sekciu a neprepisuje sa formát blokového obsahu.
- Pôvodné API endpointy, stavy draft/published/scheduled, formulárové akcie aj `expectedUpdatedAt` sa nemenia. Regresie pokryté existujúcim `tests/admin-shared-form-feedback.test.mjs`, produkčným lintom a buildom.

## Vlna 12 — návrat bez straty údajov + regresné opravy
- **Adresár:** hlavný návrat do zoznamu pri rozpracovanom profile zobrazuje skutočný shared `EditorUnsavedChangesGuard` (Zostať/Zahodiť), nie natívne `window.confirm`. Modifikované kliknutia na otvorenie v ďalšej karte nemenia stav. Potvrdenie vykoná klientsku navigáciu; neodosiela POST/PUT a nezapisuje do Notion.
- **Spoločný dialóg:** bezpečný predvolený focus na tlačidlo **Pokračovať v úpravách**, existujúca ochrana `beforeunload` ostáva. Zmeny polí a API zostali nedotknuté; oddelené potvrdenie pri zahadzovaní neuložených kategóriových filtrov má vlastnú semantiku a v tejto vlne sa nemení.
- **ARTICLE-ADMIN unit contract:** historický test očakával lokálne `role={error ? "alert" : "status"}`; po unifikácii už kontroluje centrálny `AdminFormFeedback` a jeho skutočné role.
- **Admin Operations E2E:** očakávanie úspechu ukladania organizácie je zacielené na kanonické `data-admin-form-feedback="success"` namiesto neurčitého vyhľadania dvoch `role=status` (označenie dirty a samotné hlásenie).
- Regresné zdrojové testy pokrývajú focus, zachovanie dátových kontraktov, zrušenie a explicitné zahodenie rozpracovaných zmien; bez novej knižnice, migrácie či nasadenia.

### E2E overenie ochrany Adresára
- Playwright scenár v `admin-directory-filters.spec.ts` upraví neuložený telefón bez požiadavky na server, otvorí dialóg, overí bezpečný fokus na Zostať, Escape bez straty textu a následné explicitné Zahodiť s návratom do zoznamu.
- Scenár nemení údaje na lokálnej fixture; zostáva súčasťou existujúcej sady Adresára.

### Stabilizácia Gemini/Notion samostatného editora
- Modul Adresára je súčasne používaný v izolovanom Gemini/Notion modáli bez `NextRouter` kontextu. Preto ochrana návratu v kanonickom Adresári nevolá `useRouter()` v spoločnej komponentovej funkcii. Po výslovnom potvrdení použije existujúci Next Link cez bezpečne označený `ref`, čím zachová SPA navigáciu a nevyvolá nové sieťové zápisy. Modál Gemini/Notion sa vie znova zobraziť aj v izolovaných browser testoch.
