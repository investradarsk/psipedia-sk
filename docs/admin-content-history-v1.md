# Psipedia Admin – história úprav a bezpečný návrat (bod 4 z 5)

## Kde sa zobrazuje
- `/admin/sekcie`: pri otvorenej sekcii je panel **História zmien**.
- `/admin/sekcie/vizualy`: história obrázka a výrezu vybranej hlavičky; osobitne história textov a rýchlych odkazov nadradenej sekcie.
- Zobrazí sa posledných 30 zmien daného objektu s dátumom, aktérom a prehľadom zmenených polí **Pôvodne / Potom**. Dlhé hodnoty sú skrátené iba v náhľade, úplné údaje zostávajú uložené v D1 histórii.

## Ako funguje bezpečné vrátenie
1. Otvor sekciu alebo hlavičku, klikni **Zobraziť históriu**.
2. Pri poslednej zmene klikni **Čo sa zmenilo**. Uvidíš rozdiely.
3. **Vrátiť poslednú zmenu** je dostupné len vtedy, keď je posledná revízia stále aktuálna a editor nemá rozpracované úpravy.
4. Po explicitnom potvrdení admin API skontroluje opäť najnovšiu revíziu a presný stav uloženého riadku. Ak niekto medzitým zmenil obsah, databáza zmenu **odmietne bez prepísania**.
5. Úspešné vrátenie vytvorí ďalšiu auditnú revíziu a administrácia sa obnoví. Staršie revízie sa dajú prezerať, nie slepo aplikovať cez novšie zmeny.

### Rozsah
- **Hlavné sekcie** (`portal_section_settings`): názov, popisy, podsekcie, ich poradie, viditeľnosť, hero konfigurácia.
- **Hlavičkové vizuály** (`section_visuals`): obrázok, ALT, desktop/mobile výrez, reset.
- História je zapnutá **od aplikovania migrácie `0151_admin_content_revision_history.sql`**; staršie udalosti sa nevymýšľajú ani spätne nedopočítavajú.
- Ochranné D1 triggery zapisujú nové revízie automaticky pri skutočných zmenách aj mimo tohto rozhrania. Auditný záznam sa nedá zmeniť ani vymazať pomocou štandardného SQL `UPDATE` či `DELETE`.
- Ak po resete už fyzicky neexistuje súbor v R2, história sama nevie obnoviť vymazaný súbor; obnovuje databázové nastavenie, nie bajty odstránenej fotografie.

### Zámerne nepodporujeme
**Automatické rollbacky profilov veterinárov, adopcií, článkov, Notion dát, služieb ani udalostí.** Tieto domény majú samostatné lifecycle, prenosy a field authority; univerzálne prepísanie celého starého objektu by mohlo prepísať novšie údaje. Súčasný modul s nimi nekomunikuje.

Nejde ani o kompletné vrátenie všetkých sekcií na jeden historický stav. Každé vrátenie sa týka jedného objektu a vytvára novú auditnú udalosť. Nie je to backup celého portálu.

## Bezpečnosť
- `GET /api/admin/content-history` vyžaduje prihláseného admina.
- `POST` vyžaduje admin autorizáciu, striktne overený pôvod požiadavky, JSON a explicitný zámer `restore-last`.
- Kľúče a typy sú striktne validované. SQL tabuľky a povolené stĺpce sú pevné v kóde, nie prevzaté z používateľských vstupov.
- D1 návrat je jedna podmienená atomická SQL operácia; ochrana kontroluje **posledné auditné ID** aj presný aktuálny obsah.
- Pri chybe alebo konflikte sa obnova nevykoná; neexistuje automatické opakovanie.
- Prehlásenie o histórii sa nezobrazuje na verejnom webe.

## Manuálna kontrola po etape 5
1. Nasaď migráciu 0151 v štandardnom migračnom postupe.
2. Zmeň názov testovacej sekcie a ulož. V histórii skontroluj rozdiel a dátum.
3. Vráť poslednú zmenu; editor sa obnoví a vznikne nový auditný záznam.
4. Dvakrát medzičasom uprav sekciu a skús aplikovať starú revíziu: musí byť odmietnutá.
5. V editore s neuloženými zmenami musí byť obnova zablokovaná.
6. Otestuj vytvorenie, úpravu a reset hlavičkového obrázka; návrat nesmie zapnúť synchronizáciu Notion ani meniť iné sekcie.

**Pracovná dohoda:** CI a opravy X až po doplnení bodu 5; tento PR zostáva Draft.
