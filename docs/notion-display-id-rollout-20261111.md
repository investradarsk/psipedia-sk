# Notion – Zobrazované ID (read-only formula), 11. 11. 2026

## Čo je zmenené v produkčnom Notione

Vo všetkých nasledujúcich **9 aktívnych** Notion data sources bolo cez Notion schémové API úspešne vytvorené nové pole **`Zobrazované ID` typu FORMULA**:

| Doména | Data source ID | Výpočet |
|---|---|---|
| Plemená | `2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2` | `Psipedia ID/1` |
| Služby | `84e0664c-ca47-405f-9d54-31b20287bc8c` | `Psipedia ID/kód kategórie 2–13, fallback 27` |
| Podujatia | `76d9ccde-5816-422c-bcfe-863ab69db080` | `Psipedia ID/14` |
| Články | `ae042534-c878-427e-bc76-ef587a8c61cf` | `Psipedia ID/15` |
| Adopcie | `ca3c57e7-1342-42cd-939e-967b63d3027c` | `Psipedia ID/16` |
| Stratené/nájdené | `3ed793fc-1d18-8122-95b9-000b05c3c6bd` | `Psipedia ID/17` |
| Organizácie | `6fbf8eb2-2f72-4d0c-b825-c46f6f72f92e` | `Psipedia ID/18` |
| Pomoc psom | `3ed793fc-1d18-819c-bb39-000b753d0002` | `Psipedia ID/kód kategórie 19–25, fallback 28` |
| E-shopy | `24837932-2867-4809-9adb-f3f33ba47339` | `Psipedia ID/26` |

**Dôležité:** V databázach Pomoc psom a Stratené/nájdené existujú pomocné zdroje s iba jedným stĺpcom `Name`. Tie sú prázdne alebo nie sú aktívnou redakčnou databázou. Nepridávať formuly do týchto zdrojov! Skutočné stránky boli cez `fetch(page)` overené vo vyššie uvedených aktívnych kolekciách.

## Mechanizmus a bezpečnostné invarianty

- Všetky aktívne zdroje majú pôvodné `Psipedia ID` ako textový údaj (surové D1 integer).
- Nové `Zobrazované ID` je read-only formula, ktorá sa automaticky prepočíta pri prenose raw ID a pri zmene `Kategória` – **bez ďalšej API mutácie alebo Notion webhooku**.
- D1 ID, NOTION page ID, source ID, FCI čísla a iné technické kľúče zostali nezmenené; nevykonal sa žiadny plošný import alebo prepis redakčného obsahu.
- Notion rozhranie zobrazuje výsledky formulí, no Notion connector `fetch(page)` môže vrátiť `formulaResult://...` odkaz a `query_data_sources` uvádza property v `notAvailableInQuerySql`. Preto cez tento konektor nemožno spoľahlivo čítať samotný vypočítaný text; výsledok je vhodné vizuálne potvrdiť v Notione na jednom zázname každej domény.
- Formula sama neukladá duplicitný ľubovoľný text. Nezmenili sa žiadne synchronizačné mapovania a „Psipedia ID“ zostáva hodnota na párovanie.

## Rollout po PR

1. Mergnúť jeden PR so spoločným `admin-display-id.ts` kódom, zobrazením a parserom.
2. V Notione otvoriť napr. plemeno s vyplneným `Psipedia ID` a potvrdiť `Zobrazované ID = pôvodné ID/1`.
3. V Admine vyhľadať ten istý záznam cez `ID/kód` a potvrdiť správny editor.
4. Vyskúšať dve rôzne domény s rovnakým raw ID – musia viesť na rôzne editory.
5. Otestovať aj zmenu kategórie a historické kategórie. Zobrazený suffix sa zmení, raw ID nie.
6. Overiť, že Notion↔Admin synchronizácia prenáša raw ID ako predtým a nemá zápisový konflikt s formula property.

## Rollback

Notion schema mutácia je **samostatná od GitHub PR**: ak by formula v jednej databáze robila problém, cez Notion schémové API sa môže odstrániť iba nové pole:
`DROP COLUMN "Zobrazované ID"`.
To nemení ani `Psipedia ID`, ani záznamy. Po merge kódu vypnutie zobrazovania sa dá zabezpečiť samostatným UI rollbackom; D1 rollback/migrácia nie je potrebná.
