# Directory 0170 — SQL-first čítanie jedného profilu

Po zlúčených #1428, #1432 a #1435 existujú štandardné SQL kontakty,
transakčné zápisy vedľajších kategórií pri úprave existujúceho profilu
a transakčné zápisy vybraných redakčných faktov a 21 filtrov.

## Rozsah tohto PR
- Verejný **detail jedného publikovaného profilu** zobrazuje schválené SQL
  redakčné fakty z `directory_profile_public_facts` pri existujúcom riadku.
- Administrátorský **GET detailu profilu** vracia rovnaké fakty a aj konkrétne
  SQL filtre z `directory_profile_filter_values`.
- Prázdna SQL hodnota faktu je vedomé vymazanie a má prednosť pred starým JSON
  aliasom. Riadok, ktorý v SQL **neexistuje**, nespôsobí prázdnu hodnotu:
  zobrazí sa doterajší JSON.
- SQL riadok je prijatý iba pre aktuálnu primárnu kategóriu a existujúci
  schválený register. Kolízne textové fakty (Services V3, select filtre,
  breed/club relácie) neprepíšu príslušné zdroje pravdy.
- Dotaz je jeden indexovaný `SELECT` nad dvoma reláciami pre konkrétne ID;
  bez skenu celej D1 databázy a bez akéhokoľvek INSERT/UPDATE/DELETE.
- Pri chybnom doplnkovom SQL čítaní zostáva verejný profil dostupný
  s historickým zobrazením; Admin neponúkne zdanlivo aktuálny editor,
  ale odpovie 503. Žiadne kontakty ani surové metadáta sa nelogujú.

## Zámerne ešte nie je SQL read-cutover
- **Vedľajšie kategórie**: chýbajúca relačná SQL hodnota môže znamenať
  nemigrovaný profil alebo explicitné `[]`. Notion inbound a vytváranie
  profilu zatiaľ tiež neprechádzajú cez jeden úplný SQL category writer.
  Verejné listingy ďalej používajú doterajšie JSON členstvo.
- **Verejné facet filtre**: samostatný SQL read-cutover až po zjednotení s
  Services V3 a PR #1431. SQL hodnoty filtrovania sa teraz načítavajú
  len v Admin detaili; nedostávajú sa do verejného importData.
- **Notion**: tento PR nemení synchronizačné cesty ani autoritu
  `Odkontrolované` (Admin uzamyká, Notion je iba mirror).
- Žiadny hromadný backfill, schema migration, zmena URL, kopírovanie
  historických hodnôt, mazanie JSON ani automatické potvrdenie profilov.

## Ručná kontrola po deploy
Pre jeden nemigrovaný profil overiť zachované historické redakčné polia.
Na inom profile v Adminovi upraviť `Ordinačné hodiny`, uložiť, otvoriť detail
a overiť SQL + verejné zobrazenie. Potom pole vedome vymazať, uložiť,
overiť prázdny text bez obnovenia aliasu.
Pre kategóriový select napr. `veterinari.emergency` overiť
uložené `yes`, `no`, `unknown` a následné admin GET.
Verejný profil aj po prípadnom SQL read error musí zostať dostupný.

Základom sú regresné testy `tests/directory-0170-editorial-read.test.mjs`.
