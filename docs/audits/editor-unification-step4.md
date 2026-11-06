# Jednotné editory – krok 4/18: spoločný systém formulárov

Zmeny sú vo **vonkajšom UI formulárov**, nie vo vlastníctve údajov, validácii, D1 ani synchronizácii Notion.

## Hotové

1. Open-source shadcn-admin adaptér `admin-shadcn-editor-primitives.tsx` rozšírený z Card/Input/Textarea o natívny Select a Checkbox, s rovnakými focus/disabled/invalid stavmi.
2. Dlhé a krátke textové plochy majú jednotné varianty `length="short|standard|long"`, CSS `field-sizing: content` a dostupné natívne `resize: vertical`. Lexical sa nenahrádza, jeho serializácia zostáva pôvodná.
3. `AdminUnifiedEditorField` zlučuje label, povinnosť, vysvetlenie, error a priradenie `aria-describedby`/`aria-invalid` bez zmeny `value` alebo `onChange`.
4. Predvídateľný dvojstĺpcový layout na desktope, jeden stĺpec do 820 px, plná šírka pre názvy a dlhé texty.
5. Spoločná CSS vrstva `app/admin/admin-unified-forms.css`, importovaná iba z admin layoutu, sa aplikuje **výhradne tam, kde je `data-admin-form-system="v4"`**:
   - `EditorWorkspace` v stránkovom režime: články, plemená, podujatia, e-shopy, sekcie/Šteniatka;
   - `admin-directory-editor`: všetky služby;
   - `admin-organization-editor`: organizácie;
   - `admin-help-editor`: pomoc psom;
   - `admin-adoption-editor`: adopcie;
   - `admin-lost-found-editor`: stratené a nájdené.
6. Fyzické inputy, selekty a checkboxy sa nevymieňajú. Spoločné pravidlá cielia vizuál formy; `input[type=file]`, checkboxy, radio, skrytý Lexical textarea a vlastné galerijné/mapové ovládače sú vyňaté z pravidiel pre textové polia.
7. Pilot `/admin/unified-editor-preview` ukazuje rôzne dĺžky textu, výber kategórie, checkbox, dátum, čas a telefón pre štyri typy záznamov.
8. Test `tests/admin-editor-form-controls-step4.test.mjs` stráži rozsah štýlov, typy polí a izoláciu prototypu.

## Zámerné hranice

- Toto je **zjednotenie vizuálnych a vstupných pravidiel**, nie preskladanie konkrétnych polí každého editora. To sa začne v krokoch 7–13.
- Pokročilé komponenty (galéria, fotky, mapy, prepojenia, bohatý text, SEO) budú riešené v kroku 5.
- Jednotné ukladanie, validácia a ochrana neuloženého obsahu budú v kroku 6.
- Nové obsahové polia podujatí (napr. telefón, vstupné a e-mail) ešte nie sú v D1 ani na verejnom webe; patria do krokov 10 a 15.
- Stále ide o spoločný PR #1222; bez zmeny produkčných dát.

## Kontrola pred merge

- Otestovať všetky skupiny editorov (desktop 1440/1280, mobil 390/320): nepretekajú polia, nepodsúva sa checkbox ako textový input, ukryté uploady zostávajú ukryté.
- Dlhé články a popisy: kurzor, písanie, výška, text Lexical bez zmeny serializácie.
- Kombinácie formulárov `admin-field-grid`: 2 stĺpce na desktope, 1 na mobile, full-span pre title a dlhé texty.
- Uložiť/Publikovať/Zahodiť: rovnaké payloady a kontroly, žiadne nové povinné polia.
- CI vrátane regresných testov a E2E musí byť úspešné pred merge.
