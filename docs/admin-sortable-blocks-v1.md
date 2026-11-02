# Psipedia Admin – presúvanie blokov myšou (etapa 3/5)

Tento krok rozširuje už existujúce editory, nevytvára druhý systém ukladania. Všetky presuny prebiehajú **len v rozpracovanej verzii**.

## Kde to nájdeš

**Administrácia → Sekcie a podsekcie** (`/admin/sekcie`)
- Nový kompaktný náhľad „Hlavné sekcie – pracovné poradie“.
- Sekcie môžeš chytiť za rukoväť a potiahnuť; rovnako fungujú šípky a klávesnica.
- Pri otvorení hlavnej sekcie sa zobrazí samostatné poradie jej **kariet podsekcií** (ak sú aspoň dve).
- Po presune sa okamžite aktualizuje poradie v pracovnom náhľade aj v existujúcom editore.
- Verejný web sa aktualizuje až po kliknutí na **Uložiť sekcie**; pôvodné validačné pravidlá, URL, položky obsahu a viditeľnosť zostávajú.

**Administrácia → Sekcie → Vizuály** (`/admin/sekcie/vizualy`)
- V bloku Rýchle odkazy je náhľad poradia malých odkazových kariet.
- Presun nemení názov, URL ani stav zobrazenia odkazu.
- Uloženie sa vykonáva pôvodným tlačidlom **Uložiť hlavičku**, cez existujúce API sekcií.

## Čo je bezpečné

- Recyklujeme `@dnd-kit/core`, `@dnd-kit/sortable` a `@dnd-kit/utilities`, už inštalované pre galérie.
- Spoločný komponent `AdminSortableOrderPreview` je čisto klientsky a nemá vlastné HTTP požiadavky.
- Drag-and-drop je ovládateľný pointerom aj klávesnicou; pre každú položku fungujú aj šípky, so zakázaním na krajoch.
- Sekcie zachovávajú všetky objekty, iba sa zmení poradie/pozícia; podsekcie a rýchle odkazy zachovávajú všetky polia.
- Existujúca ochrana neuložených zmien a explicitné uloženie ostávajú v pôvodných editoroch.
- Žiadne migrácie, žiadne zmeny priorít Notion, žiadne priame zásahy do produkcie.

## Obmedzenie – statické bannery

**HomeMagazineBanner** a ďalšie natvrdo rozložené bannery na homepage nemajú databázový kontrakt pre zmenu poradia. Tento krok ich preto **neprepája na falošné úložisko ani nepresúva**, aby pri uložení nevznikol nečakaný zásah do homepage. Premiestňovať je teraz možné reálne riadené sekcie, karty podsekcií a odkazové karty v hlavičkách. Všeobecný vizuálny editor ľubovoľných HTML/CSS blokov by potreboval osobitný redakčný dátový model a migráciu; do tohto PR ho nepridávame.

## Manuálna kontrola až po dokončení všetkých piatich bodov

1. Otvor `/admin/sekcie`, potiahni dve sekcie, ale neukladaj: verejná stránka musí ostať nezmenená.
2. Ulož a over po obnovení editora, že poradie zostalo a neboli zmenené texty/URL.
3. Rozklikni sekciu s viacerými podsekciami, zmeň poradie kariet a over šípky, myš aj klávesnicu.
4. V `/admin/sekcie/vizualy` potiahni rýchle odkazy, skontroluj názvy a URL a ulož hlavičku.
5. Na 390/320 px over, že nič nevyčnieva z obrazovky a všetky rukoväte sú prístupné.

Podľa pracovnej dohody **nečakať na CI a neopravovať X pred etapou 5**.
