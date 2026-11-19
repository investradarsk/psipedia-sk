# Adresár – krok 2/8: otváracie a ordinačné hodiny do SQL 0173

## Rozsah
- Používa už nasadenú tabuľku `directory_profile_opening_hours` (migrácia 0173). **Žiadna ďalšia D1 migrácia.**
- Explicitná zmena `Ordinačné hodiny` z Adminu a podpísaného Notion webhooku ide cez existujúci `savePilotDirectoryMetadataField`.
- Schválené partnerské zmeny po moderácii používajú tú istú 0173 tabuľku a atomický approval batch.
- Stále aktívny 0170 SQL public-fact a starý `source_data_json` sú **iba prechodné kompatibilné projekcie**. Tento PR neprepína čítanie, nemení vzhľad webu ani neodstraňuje JSON.

## Presný kontrakt zápisu
- **Chýbajúce pole:** nijaký SQL zápis a nijaké vymazanie hodín.
- **Explicitne upravený text:** vymaže sa len existujúca 0173 projekcia hodín daného profilu a vloží sa `day_of_week=0` s kompletným voľným textom (bez zmeny významu, riadkov, prestávok či sviatkov).
- **Explicitne prázdny text:** odstránia sa len riadky hodín daného profilu; pôvodná JSON projekcia ostáva s kanonickým prázdnym kľúčom a 0170 fact ostáva s explicitnou prázdnou hodnotou.
- **Stará revízia alebo aktér:** profilový CAS alebo guard nedovolí prepísať aktuálnu SQL hodnotu.
- **Schválenie partnera:** 0170 fact a 0173 sidecar sa zapisujú v tej istej moderovanej D1 transakcii ako zmena profilu; samostatné neschválené návrhy do kanonických hodín nezapisujú.
- **Nemenený text:** ak sa Admin/Notion výslovne pokúsi uložiť tú istú hodnotu a 0173 projekcia chýba, môže sa zrkadlo doplniť. Bežný no-op so zhodnou SQL projekciou nemení revíziu.
- **Žiadny hromadný historický import** – len vedomé úpravy. Staré údaje sa nesmú vymazať.

## Prečo deň 0?
`0173` má `day_of_week=0` určený pre výnimočnú alebo všeobecnú poznámku. Dnešné editory pracujú s jedným voľným textom vrátane rozsahov typu „Po–Pi“, delených zmien a sviatkov. Rozsekanie na sedem dní bez garantovaného spätného zloženia by stratilo údaje. V tejto prechodnej etape sa preto celé znenie uchová bezpečne v riadku deň 0. Konverziu na samostatné dni možno urobiť neskôr až po navrhnutí verného obojsmerného formátu.

## Povinné funkčné overenie po merge
1. Veterinárny profil v Admine: zmena hodín → `directory_profile_opening_hours` jeden riadok s `day_of_week=0` a novým textom; verejný detail sa nezmení vizuálne a ukazuje nový text.
2. Upraviť iba iné pole → SQL hodiny zostanú nedotknuté.
3. V Notione upraviť výslovne pole `Ordinačné hodiny` → rovnaký 0173 riadok; žiadne spätné prepísanie novšej hodnoty.
4. Výslovne vymazať hodiny → nula riadkov v 0173, prázdna 0170 public fact, žiadne oživenie starého aliasu vo verejnom detaile.
5. Schválený partnerský návrh mení iba hodiny → 0170 fakt a 0173 obsah sú zhodné, schválenie je atomické.
6. Overiť ochranu `Odkontrolované` a Notion zámku (tento PR ich nemení).

Na neskorší SQL read cutover treba explicitne rozlíšiť profily s už migrovanými, ale prázdnymi hodinami od profilu, ktorého historické hodiny ešte v SQL nie sú. Tento PR žiadny SQL-first read ani JSON cleanup **nezapína**.
