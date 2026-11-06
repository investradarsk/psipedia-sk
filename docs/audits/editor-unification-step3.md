# Jednotné editory Psipedia.sk – krok 3/18: navigácia

**Stav:** zapracované do PR #1222, zatiaľ nezlúčené. Zásah sa týka iba spoločných editorových navigácií, hlavičky a rolovania, bez zmien modelov alebo ukladania.

## Implementácia

- `AdminSharedEditorNavigation` a izolované CSS predstavujú jediný spoločný zdroj pre zobrazenie navigácie: rovnaké položky, aktívny stav, mobilný select, klávesnica, focus, minimálne 44 px klikacie prvky.
- Režim `scroll`: existujúce reálne editory zostávajú ako dlhé formuláre, navigácia skočí na príslušnú sekciu. Zostáva URL/hash odkaz v editore služieb/organizácií a bez-JS fallback cez anchor.
- Režim `switch`: izolovaný prototyp kroku 2 zobrazuje jednu sekciu, ostatné zostávajú namontované kvôli zachovaniu hodnôt.
- `EditorWorkspace` (články, plemená, podujatia, e-shopy, obsahové sekcie) používa tento istý komponent. Stránkové editory v desktop/mobil režime posúvajú jediný dokument, nie vnútorné panelové overflow. Len modálne okná si zachovávajú samostatný bezpečný scroll.
- `AdminStickyEditorNavigation` (Služby, organizácie) používa spoločnú vizuálnu navigáciu, ale zachováva svoju synchronizáciu s URL hash a IntersectionObserver.
- Z page-mode EditorWorkspace zmizol duplicitný nadpis – názov stránky zostáva v AdminShell, v samotnom editore sa necháva stav a tlačidlo späť. Dialogové editory zobrazujú vlastný nadpis naďalej.
- Z podujatí bola odstránená zastaraná výšková hranica `76/78dvh`, ktorá spôsobovala vnorený posuvník.
- Regresný kontrakt: `tests/admin-editor-unified-navigation-step3.test.mjs`.

## Čo sa nemení

- Polia, ich poradí a odborný obsah žiadneho canonical editora.
- Validácia, tlačidlá uloženia/publikovania, D1/Notion, API a fotky.
- Modal focus trap, modálne rolovanie a existujúce neuložené zmeny.
- Nie všetky špecializované editory (Pomoc psom, niektoré grafické nástroje) používajú už nový spoločný shell; postupne budú zapojené v krokoch 7–13.

## Dôležitá hranica etapy

V skutočných kanonických editoroch je ešte zachovaný **dlhý formulár so skokom na sekciu**, aby sa v kroku 3 nemohli poškodiť povinné hidden inputy, Lexical formuláre alebo publikovanie. **Jedna aktívna sekcia** už funguje v izolovanom pilotnom editore; produkčné editory sa na toto správanie prepnú až pri migrácii každého z nich.

## Kontrolný zoznam pred merge

1. Desktop 1440/1280: prejsť Článok, Plemeno, Podujatie, Službu, Organizáciu a overiť jediný zvislý posuvník celej stránky.
2. Mobil 390/320: mobilný výber sekcie funguje, navigácia sa netlačí cez akcie.
3. Scroll / klávesnica: zvoliť sekciu, overiť viditeľný nadpis pod sticky topbarom.
4. Uložiť, publikovať, odísť s neuloženými zmenami v každom z typov; bez zmeny API.
5. Overiť, že modal sa správa ako predtým, vrátane Escape/focus.
6. Skontrolovať CI a Playwright, nenasadzovať pri zlyhaní kontrol.
