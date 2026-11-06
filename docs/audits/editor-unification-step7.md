# Psipedia – jednotné editory, krok 7/18: editor plemien

**Stav:** implementované v PR #1222; produkcia a databáza nezmenené.

## Cieľ

Prvý reálny editor využívajúci open-source inšpirovaný spoločný systém z krokov 2–6. Redaktor vidí **iba jednu z ôsmich obsahových sekcií** a má jednotnú navigáciu na počítači a mobile. Bez migrácie dát, prepisu ukladania či synchronizácie Notion.

## Realizácia

1. `EditorWorkspace` má **opt-in** `sectionMode="switch"` + riadené `activeSectionId` / `onSectionChange`. Pôvodné editory článkov a podujatí stále používajú default `scroll`. Vo switch režime je bočná navigácia vľavo a jedna sekcia vpravo; na mobile horný výber.
2. `AdminEditorSectionVisibility` poskytuje aktívny identifikátor `AdminEditorSection`. Všetkých osem sekcií je *stále namontovaných v React strome*, iba neaktívne majú `hidden`. Pri prepnutí sa nestráca obsah editorov Lexical, galérií ani vyhľadávania.
3. Sekcie: Základ, Prehľad, Charakter, Praktické, Zdravie, Športy, Prepojenia, Fotografie. Jedna stránková rolovacia plocha bez `overflow:auto` jednotlivých sekcií.
4. Pod obsahom je pager **Predchádzajúca / 1–8 / Ďalšia**, ktorý vráti pozíciu k hlavičke editora.
5. Športy a aktivity majú kompaktnejšie riadky (názov, hodnotenie, poznámka, editácia/poradie/odstránenie). Validácia jedinečných športov a `BreedSport` API sa nemenia.
6. Prepojenia majú štyri prepínače: články, podobné plemená, chovateľské stanice, kluby. Viditeľná je vždy jedna skupina; všetky skupiny však zostávajú namontované a zachovávajú výber, vyhľadávanie aj `AbortController`. Výsledky a priradené položky už nevytvárajú vnútorné rolovanie.
7. `AdminBreedNotionExtras` už nie je pod fotografiami; nachádza sa v **Pokročilých nastaveniach → Doplnkové technické údaje Notion**, naďalej s vlastným explicitným uložením po jednotlivom poli.
8. Pre skryté sekcie používame `noValidate` na natívnom formulári, pretože požadovaný HTML input v neviditeľnej sekcii nemožno fokusovať. Ekvivalentná kontrola povinného názvu, úvodu a URL sa robí pred odoslaním na pôvodné API; editor pri chybe odhalí príslušnú sekciu či nastavenia. Serverové pravidlá zostávajú nezmenené.
9. Ponechané: všetkých 344 existujúcich záznamov, FCI polia a štandard, redakčné texty, športy, poradie a metadáta galérie, súvisiace články, stanice a kluby, SEO, status, `expectedUpdatedAt` kontrola konkurentných úprav, PUT/POST, image upload a následné Notion spracovanie.
10. Regresné kontrakty v `tests/admin-editor-breed-single-section-step7.test.mjs`.

## Riziká a overenie pred merge

- React skryté komponenty zostávajú namontované a nie je prerušovaná ich hodnota; otestovať Lexical pri opakovanom prepínaní (obsah + kurzor).
- Mobil 320/390 px: menu sekcií, rolovanie iba dokumentom, spodná ukladacia lišta a modálne okná FCI/športov.
- Chýbajúci názov/úvod: prepnúť na správnu sekciu a ukázať hlásenie. Chýbajúca URL: otvoriť Nastavenia.
- Skontrolovať save koncept, publish, existujúci 344 FCI import, `expectedUpdatedAt` a Notion extras bez regresie.
- Športy: pridať, upraviť, presunúť, odstrániť, kontrolovať duplicitu.
- Prepojenia: vybrať stanicu vyhľadávaním (vrátane záznamov nad starým limitom 500), vymeniť tab, uložiť, znovu načítať.
- Fotografie: titulná, galéria, ALT/popisy/kredity a presúvanie.
- **Nemergať pri červenom CI**; vizuálny browser/E2E dôkaz je stále potrebný. Statické kontraktné testy nenahrádzajú živé ovládanie.

## Čo nasleduje

Krok 8: články. Neprebieha, kým používateľ nenapíše pokračovať.
