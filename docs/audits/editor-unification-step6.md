# Psipedia – jednotné editory, krok 6/18: ukladanie, publikovanie a opustenie editora

## Zmena

Zjednotenie **prezentačnej vrstvy** uloženia a publikovania bez zmeny API, stavového automatu, serverovej validácie či synchronizácie.

- `AdminEditorFooter` + izolované CSS: jedna spodná lišta pre návrat, uloženie, publikovanie, stiahnutie, stav neuložených zmien, správy o uložení a stav prebiehajúcej operácie. Rešpektuje 44px ovládacie prvky a mobilné safe-area.
- Existujúci `EditorActionBar` používa spoločnú lištu. Z toho automaticky profitujú články, plemená, podujatia, e-shopy a ďalšie moduly, ktoré už používajú `EditorWorkspace`.
- `AdminUnifiedEditorWorkspace` v izolovanom prototype používa rovnaký footer. Náhľadové tlačidlá používajú `AdminActionButton`; publikovanie zostáva výlučne lokálnou simuláciou.
- Služby, organizácie, Pomoc psom, adopcie a stratené/nájdené psy používajú spoločný footer **okolo ich pôvodných tlačidiel a udalostných handlerov**. Nezmenili sa payloady, cieľové stránky ani podmienky dostupnosti akcií.
- Editor ostáva jediným vlastníkom stavu `dirty` a `saving`. Spoločná lišta stav len zobrazuje.
- Doterajší `EditorUnsavedChangesGuard`, potvrdenia pri rušení publikácie, `beforeunload`, hlásenia `AdminFormFeedback` a jednotlivé redakčné validačné pravidlá zostávajú funkčne nezmenené.

## Úmyselne nemeníme

- Žiadna nová serverová akcia, end-point, D1 migrácia, Notion operácia či zmena publikačného stavu.
- Žiadne jednotné „automatické publikovanie“: niektoré typy majú schvaľovanie, plánovanie, koncepty alebo súkromné údaje. Každé vlastné API a oprávnenia zostávajú pôvodné.
- V tomto kroku sa nemenia špecifické postupy po uložení (napr. presmerovanie po vytvorení profilu, Gemini koncept, adopčné stavy). Zjednotený je výzor a spoločné stavové prvky, nie doménové pravidlá.
- Nie je zavedené globálne autosave; neuložené zmeny sa nesmú potichu prepísať.

## Kontrola pred zlúčením

- Overiť uloženie konceptu, publikovanie, stiahnutie a návrat samostatne v článku, plemene, službe, podujatí, adopcii, stratenom psovi a organizácii.
- V každom vyskúšať odchod s neuloženými zmenami: Ponechať úpravy / Zahodiť a odísť, refresh so štandardným browser promptom.
- Pri paralelnom ukladaní zostanú tlačidlá deaktivované podľa existujúcich pravidiel; stav sa zobrazuje cez `pending`.
- Dôležité: screenshot/test na mobiloch 320/390 px pre rozloženie akcií a kontrast.
- `tests/admin-editor-footer-step6.test.mjs` drží regresné kontrakty.
- PR #1222 nezlúčiť pri zlyhaní CI. Krok 7 sa začína až na výslovný pokyn.

## Stav

Implementácia kroku 6 je v otvorenom PR #1222, bez nasadenia do produkcie.
