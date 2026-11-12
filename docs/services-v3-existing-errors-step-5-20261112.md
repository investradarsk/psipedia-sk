# Služby V3 – odstránenie príčin historických sync chýb (krok 5/6)

12. novembra 2026. Súčasť jediného otvoreného PR #1319, bez novej Notion databázy, migrácie, zápisov do produkčnej D1 ani hromadného prepisovania profilov.

## Rozsah a pozorované typy

Starší read-only audit vykázal približne 180 synchronizačných chýb v Adresári, najčastejšie staré `BASELINE_UNAVAILABLE` a `services:UNVERIFIED_DELETE`. Toto nie je nový produkčný prepočet: počet sa môže zmeniť ďalšími úpravami a automatizáciami.

| Príznak | Nová reakcia | Čo systém nesmie urobiť |
|---|---|---|
| `BASELINE_UNAVAILABLE` na starom prepojenom profile | Automaticky obnoviť potvrdený synchronizačný stav, **iba ak celé aktuálne redakčné snapshoty D1 a Notion sú rovnaké** | Vybrať podľa timestampu víťaza pri rozdielnych údajoch |
| `SERVICES_RELATION_UNVERIFIED_DELETE` alebo `services:UNVERIFIED_DELETE` | Samostatné varovanie v read-only audite; bez bezpečného baseline je vyradenie stále nerozhodnuté | Znova vytvoriť službu len preto, že existuje v staršom D1 stave, alebo ju zmazať podľa chýbajúceho zoznamu |
| Chyba jednej kanonickej služby pri Notion→Admin importe | Spracovať ostatné ID; čiastočné úspechy ponechať, ale celé relation mirror/baseline nepotvrdiť | Zablokovať ostatné ID alebo označiť celý relation import ako úspešne synchronizovaný |
| Chyba služby pri inej existujúcej editorial/GEO chybe | Nechať pôvodnú chybu a samostatný D1 alert, nepripísať službový úspech ako celoprofilové vyriešenie | Zmazať existujúcu `Sync chyba` pri úspechu jednej relácie alebo nahradiť chybu iného poľa |
| Ostatné technické/identity chyby | Zachovať pôvodnú bezpečnú diagnostiku | Automaticky prepísať identitu, súkromnú polohu, obrázok alebo publikovanie |

## Bezpečná obnova zhodného historického profilu

1. Prechod je dostupný iba už namapovaným, identitou potvrdeným profilom v existujúcej Directory Notion databáze, ktoré používajú nový per-field systém.
2. Dôvod musí byť výhradne historická chyba `CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (...:BASELINE_UNAVAILABLE)`, nie akýkoľvek iný typ konfliktu.
3. Pred opravou sa porovná celý aktuálny redakčný snapshot, nielen čas poslednej zmeny, a samostatne sa znovu načíta presná Notion stránka a aktuálny D1 profil.
4. Ak nastane rozdiel, chyba ostáva na kontrolu bez úpravy obsahu.
5. Ak sú hodnoty zhodné, použije sa existujúci echo-verifikovaný `writeProfileToNotion`, ktorý doplní/obnoví spoločný mapping a field baseline z potvrdenej zhody a vie upraviť staré `Sync chyba` metadáta.
6. Bezpečné opakovanie je prístupné z existujúceho hodinového prechodu; nevytvára sa ďalšia automatizácia.

## Odolnosť služieb voči čiastočným chybám

- `importNotionServiceIds` pracuje s nemennými ID; každý insert/reset vykoná vlastný CAS. Výpadok jednej služby sa zapamätá a nezastaví nezávislé zmeny ďalších.
- Ak sa v ktoromkoľvek ID zápis nepodarí, volanie skončí stavom `SERVICES_RELATION_PARTIAL_CAS_FAILURE`. Existujúci relation reconciler **nezapíše** falošný spoločný baseline. Už potvrdené D1 zmeny sa nezahodia.
- `markPageError` nesmie službovou chybou prepísať existujúci problém iného poľa. Zmena `Služby z katalógu` ani potvrdenie dôveryhodnosti nesmú bez dôkazu vyčistiť starú `Sync chyba` iného systému.

## Lepšie triedenie existujúcich chýb

Read-only administrátorský audit rozlišuje `MISSING_VERIFIED_BASELINE`, `SERVICE_RELATION_UNVERIFIED_DELETE`, `SERVICE_RELATION_SYNC_ERROR` a iné konflikty. Kategórie slúžia na prioritizáciu a ďalší postup, nie ako automatické potvrdenie, že všetky staré záznamy už boli opravené.

## Testy a nasadenie

- `tests/directory-sync-recovery-policy.test.mjs`: klasifikácia, izolácia metadata chýb, striktne zhodný baseline a read-only audit.
- `tests/service-catalog-admin-lifecycle.test.mjs`: skutočné D1 SQLite/triggery; úmyselné zlyhanie jedného insertu alebo resetu, úspech ostatného ID, potom samostatný retry.
- Existujúce Notion/Directory kontrakty, ochrana identity, audit, potvrdené Google Place a per-field webhooky ostávajú zachované.

**Dôležité:** Bez prístupu k produkčnému overeniu neoznačujeme historických ~180 Notion chýb za vymazané. Po nasadení je potrebný nový read-only audit; iba potvrdené identické snapshoty sa opravia bez ľudského rozhodnutia. Konfliktné údaje sa neprepisujú.
