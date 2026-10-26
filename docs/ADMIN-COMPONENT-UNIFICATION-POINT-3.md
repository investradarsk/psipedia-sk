# PSIPEDIA.SK — Bod 3: Obrázky a textové editory

**Nadväzujúci PR:** #1056. **Východisko:** už mergnutý #1040, preto nezavádzame žiadny ďalší upload systém, galériový model ani rich-text serializáciu.

## Nahradené duplicity

| Umiestnenie | Starý mechanizmus | Spoločný mechanizmus | Zachovaný kontrakt |
| --- | --- | --- | --- |
| `components/admin-article-block-editor.tsx`, blok obrázka | HTML `<input type="file">` + vlastný `event.target.files` a reset inputu | `AdminSingleImageUpload` a `adminSelectedImage`; rovnaká validácia cez existujúci `uploadAdminImage` | `folder="articles"`, `url`, `imageKey`, `alt`, `caption`, `credit`, `size`; dávkové nahrávanie galérie nezmenené |
| `components/admin-photo-gallery.tsx`, URL galéria | Samostatný `DndContext`, `SortableContext`, `useSortable`, klávesnicové senzory a vlastné stabilné IDs | Existujúci `AdminSortableGallery` (už používaný článkami/plemenami) | `string[]` URL, `onChange`, poradie, tlačidlá posunu, odstránenie **len referencie**, upload limit a R2 priečinok |
| `components/admin-sortable-gallery.tsx` | Zdieľaný sorter vedel iba `div` wrapper | Voliteľný `containerAs="ol"` a `as="li"`, default stále `div` | URL galéria má naďalej sémanticky správny číselný zoznam a pôvodné `styles.items` CSS |

**Prečo nahrádzať iba toto:** dôkaz funkčnej zhody, stabilné identifikátory galérie `gallerySortableIds` ostávajú v jedinom spoločnom sorteri, zachová sa `dnd-kit` prístup cez klávesnicu aj dotyk. Nepridávajú sa nové balíky.

## Už spoločné od #1040 — bez opätovnej implementácie

- `AdminGalleryDropzone` a `AdminPhotoGallery` pre kompatibilné galérie.
- `AdminSingleImageUpload` pre hlavné fotografie editorov článkov, plemien, Adresára, podujatí, Pomoci psom, e-shopov, organizácií a oblastí Šteniatok.
- `AdminSortableGallery` v štruktúrovaných galériách (vrátane alt/caption/credit/imageKey/size).
- `AdminLexicalAppendButton` pre doplnenie bezpečného plain-text návrhu.
- `ImageDisplayEditor` tam, kde editor povoľuje odlišné výrezy/náhľady.

## Dôležité oprávnené odlišnosti — nerobiť z nich nebezpečné zjednotenie

- **Facebook obrázky:** `components/admin-facebook-images.tsx` povoľuje len JPG/PNG/WebP a má osobitný publikačný/approval workflow a `imageKey`. Univerzálny dropzone pripúšťa aj AVIF. Bez zachovania presných MIME a UI kontraktov tento vstup **nenahrádzať**.
- **JSON import Adresára:** `components/admin-address-research-import.tsx` používa súbor `.json`, nie obrázok. Nie je duplicitou photo pickera.
- **Textové dokumenty:** editor blokového rich textu článkov a Markdown editor podujatí nemajú rovnaký ukladací formát. `EditorialRichTextDocument` a Markdown sa neprevádzajú naslepo; bezpečné spoločné textové tlačidlo už funguje.
- **Výrezy a metadáta:** URL `string[]` nie je to isté ako štruktúrovaná galéria alebo nahratý titulný obrázok. Uložené metadáta sa neodstraňujú ani nemigrujú.

## Regresné overenie

- `tests/admin-media-text-unification-point-3.test.mjs` — shared upload, URL galéria na spoločnom sorteri, DOM `ol/li`, zachovanie metadát a hraníc formátov.
- Aktualizovaný `tests/admin-open-source-unification.test.mjs` — kontroluje nový zdroj stabilných ID vo shared sorteri namiesto už odstráneného lokálneho sortera.
- Overiť existujúce E2E/editor testy, upload, zmenu poradia pomocou klávesnice a náhľady na mobilných šírkach pri záverečnom bode 5.

Žiadne nové funkcie, dizajn, zmeny backendu, R2, D1, Notion či Gemini.
