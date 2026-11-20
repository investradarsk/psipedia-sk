# Psipedia.sk – Adresár: spoločné SQL-first opravy po produkčnom audite
Dátum: 20. 11. 2026

## Potvrdené údaje
- Audit [44735023558](https://github.com/investradarsk/psipedia-sk/actions/runs/44735023558): 1 847 produkčných D1 profilov, počet a agregáty stabilné, žiadny zápis.
- 1 829 oprávnených Notion profilov spracoval bezpečný jednorazový import [44701314783](https://github.com/investradarsk/psipedia-sk/actions/runs/44701314783).
- Audit stále neoveruje poslednú individuálnu úpravu každého poľa ani aktuálny Notion obsah. Preto neautorizačný starý JSON **nesmie prepísať** novšie SQL.

## Opravy v tomto PR
1. **Sekundárne kategórie** – D1 SQL `directory_profile_additional_categories` sa premieta aj do detailu verejného webu a Adminu. Platí len vtedy, ak existujúci transakčne zapisovaný príznak `_psipedia_additional_categories_sql_confirmed=1` potvrdzuje explicitný výber v Admin alebo z overeného Notion multi-select pri jednorazovom importe. Zahŕňa **potvrdené []**. Nepotvrdené historické profily si uchovajú fallback.
2. **Stav Odkontrolované** – Admin detail aj zoznam zohľadňujú `directory_profile_review_state.reviewed_at`, ale historický platný review zámok zostáva ochrannou poistkou. Notion sync lock už číta SQL spolu s partnerstvom v PR #1484. Čítanie nezmení stav ani neodomkne historicky kontrolovaný profil.
3. **Audit 0170** – 1 821 hlásení `category:confirmed_empty_missing_source_evidence` je falošná neistota po korektnom importnom potvrdení `[]`. Kód, ktorý nastavuje potvrdenie, používa výlučne skutočný Admin submit alebo Notion multi-select; audit preto už nežiada duplicitný historický JSON kľúč. Neisté profily **bez** potvrdenia naďalej hlási.
4. Jeden zjednotený read-only SQL projection bez novej tabuľky alebo migrácie; testy na reálnom SQLite.

## Čo zostáva nevyriešené
- Rozdiely `seo:sql_mismatch_review` (712), `quality:sql_mismatch_review` (176) a `qualification:sql_mismatch_review` (13) **nie sú automaticky chyby**: jednorazový Notion import oprávnene zapísal novšie SQL, ktoré historický JSON nezrkadlí. Výslovné auto-prevzatie JSON je zakázané.
- `fact:legacy_only_unverified` (1 318), `filter:legacy_only_unverified` (133), `hours:legacy_only_unverified` (33), `review:legacy_only_unverified` (8), 5 galérií a ďalšie výnimky stále vyžadujú preukázané SQL pokrytie alebo explicitné operátorské rozhodnutie.
- Posledný audit ukazuje **8 starších review profilov bez SQL stavu**; zostávajú zamknuté starým JSON v bezpečnostnom OR. Nesmie sa automaticky odstrániť.
- Admin/partner/Notion write cesty ešte používajú niektoré technické JSON metadáta. Toto PR ich **nemaže** a nemení zhodu last-write-wins.

## Bezpečný záver
Toto je praktický runtime cutover dvoch dôležitých polí, **nie úplné vymazanie JSON**. Žiadne vypínanie fallbacku pre historické hodnoty, žiadny masový backfill, delete, nové migrácie ani manuálny SQL príkaz. PR #1448 s predčasným cleanupom zostáva zablokovaný, kým nebude úplná preukázaná parita.
