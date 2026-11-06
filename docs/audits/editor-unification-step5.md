# Psipedia – jednotné editory, krok 5/18: spoločné nástroje

## Účel

Zjednotiť spôsob zobrazenia **existujúcich** nástrojov na fotografie, galérie, mapy, kontakty, prepojenia a SEO. Neprepisovať uploady, D1, Notion, mapový billing ani publikovanie. Zmeny sú vo **vzhľade a zložení nástrojov**, nie v ich funkcii alebo dátových kontraktoch.

## Implementované

- `AdminEditorToolFrame` a jeho CSS predstavujú jediný výzorový obal so šiestimi typmi: `image`, `gallery`, `map`, `contacts`, `relations`, `seo`. Bez vlastného `fetch`, `onChange`, uploadu, uloženia či mapovej operácie.
- **Titulný obrázok**: `AdminSingleImageUpload` si ponecháva `AdminGalleryDropzone` a pôvodný `onFile`; obal sa použije všade, kde sa doteraz používal uploader (články, plemená, podujatia, služby, organizácie, pomoc).
- **Galéria**: `AdminPhotoGallery` ponecháva Uppy, validáciu URL, presúvanie cez dnd-kit, zoraďovanie a pôvodný callback `onChange`; `AdminSortableGallery` má identifikačný atribút spoločného zoznamu aj pri bohatších plemenných galériách.
- **Výrez fotografie**: existujúci `ImageDisplayEditor` s detailným náhľadom a samostatnými thumbnail/detail config zostáva nezmenený; pridal sa iba identifikačný atribút.
- **Google Maps**: `AdminProfileGoogleMaps` používa nový obal, no stále načíta iba stav a platené objavovanie miest nezačne, kým správca explicitne neklikne na vyhľadanie. Potvrdené Place ID, súkromie, Geo overrides a nákladový limit sú mimo tohto kroku.
- **Kontakty**: `AdminEditorToolFrame kind="contacts"` zoskupuje už existujúce údaje v Službách, Organizáciách a Podujatiach bez ich migrácie. Interný email v službách zostáva označený ako neverejný. Telefón organizácie má `type="tel"`.
- **Prepojenia**: `AdminBreedRelationGroup` si zachováva vyhľadávanie, výber už priradených položiek navrchu, debounce a bezpečné zrušenie starých požiadaviek; mení sa iba obal.
- **SEO**: `AdminSeoFields` používa spoločný obal; článkový SEO editor má rovnaký identifikačný atribút, zatiaľ zostáva v pôvodnom canonical formulári. `noindex`, canonical URL a OG údaje sa neprepisujú.
- Lokálne štýly `admin-editor-tool-frame.module.css` a admin-only `admin-unified-forms.css` zjednocujú minimálnu veľkosť ovládacích prvkov (44 px), farby nadpisov, šírku a responzívne rozostupy. Ostatné verejné komponenty nie sú dotknuté.

## Nedotknuté funkcie a hranice

- Nepribudli žiadne endpointy, databázové migrácie ani nové povinné polia.
- Galérie neprepisujú metadáta (ALT, kredit, caption, key), ktoré vlastní každý editor. Nie je zavedené nové zdieľané ukladanie.
- Pri mapách zostávajú ručné vyhľadávanie a limit nákladov, žiadne automatické Google Places volania.
- Telefón, e-mail a vstupné pre **podujatia** zostávajú plánovanou obsahovou zmenou v kroku 10. Aktuálny event editor obsahuje len existujúce URL políčka (web, registrácia).
- Rozdielne databázové modely galérií či kontaktných údajov sa v tomto kroku nezlučujú. Pri migrácii editorov v krokoch 7–13 ich spája zhodné UI.

## Overenie

- `tests/admin-editor-tools-step5.test.mjs` chráni zapojenie všetkých šiestich druhov nástrojov, API hranice, verejné/interné kontakty a pôvodné callbacky.
- Pred merge skontrolovať na mobiloch 320/390 px fotografiu, dropzone, galériu (drag + šípky), mapu po kliknutí, výrez obrázka, kontakty, vyhľadávanie prepojení a uloženie `noindex`.
- Nezlučovať PR so zlyhanými CI/E2E kontrolami.

## Ďalej

Krok 6: zjednotenie ukladacích lišt, publikovania, návratu a upozornenia na neuložené zmeny. Pokračovať až po explicitnom pokyne používateľa.
