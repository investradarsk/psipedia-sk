# Psipedia — jednotný jednorazový prenos Notion ↔ Admin (3/3)

## Schválený rozsah

Jeden spoločný PR, tri samostatné nadväzujúce časti. V tejto vetve sa
nemerguje bez zelených kontrol. Produkčné zápisy sa nespúšťajú pri merge.

| Oblasť | Skutočné synchronizačné scope |
| --- | --- |
| Plemená | `breeds` |
| Služby pre psov | všetky aktívne `directory:<kategoria>` |
| Podujatia | `events` |
| Pomoc psom | `organizations`, `adoptions`, `help-cases`, `lost-found` |
| E-shopy | `eshops` |

**Mimo rozsahu:** články, Facebook obrázky a kanonický Services V3
(`service-catalog`, jednostranne Admin/D1 → Notion).

## Časť 1 — vykonané

- Zavedený jeden zoznam oblastí aj ich skutočných rozsahov. Zdroj pravdy pre
  jednotlivé polia je existujúci `NOTION_AUTHORITY_GROUPS`; nie požiadavka
  používateľa alebo ručne vytvorený zoznam z HTTP.
- Striktný kontrakt pre smer `NOTION_TO_ADMIN` / `ADMIN_TO_NOTION`,
  rozsah `ONE` / `ALL` a voliteľnú kategóriu (Služby/Pomoc psom).
- Čistá funkcia na porovnanie všetkých polí jedného záznamu, ktorá rozlišuje
  zhodu, zmenu a preskočenie s dôvodom; rešpektuje explicitné prázdne hodnoty,
  neexistujúce stĺpce, chránené polia a overenú väzbu na Psipedia ID.
- Výslovná výnimka pre hlavnú fotografiu/galériu/vzťahy plemien,
  kým nebude napojený bezpečný adaptér. Systém ich nemá predstierať ako
  úspešne prenesené ani ich nahradiť jednoduchým textovým PATCH.
- Pripravené tri samostatné D1 tabuľky v chránenej migrácii `0156`: beh,
  spracovávaný profil a výsledok konkrétneho poľa. Nepersistujú obsahové
  hodnoty profilov, iba ID, stavy a kódy chýb.
- Nový autorizovaný, len čítací endpoint
  `GET /api/admin/notion-manual-transfer/capabilities`.
  V časti 1 hlásil `executable: false`; finálne rozhranie sa sprístupní až po samostatnej aktivácii.
- Offline testy kontraktu a SQLite schémy + vlastný PR CI workflow.

**Poznámka:** toto ešte nemení správanie existujúcich automatických
synchronizácií. Tie sa môžu medzi agendami líšiť. Reálne zosúladenie
starých/nesprávne potvrdených hodnôt nie je implementované v časti 1.
Časť 1 je základ pre jednotné správanie a bezpečnú implementáciu.

## Časť 2 — implementovaná, ešte bez produkčnej aktivácie

- Zavedený `manualDirection` pre **všetkých päť podporovaných oblastí**
  cez existujúce synchronizačné adaptéry: Plemená, Služby,
  Podujatia, Pomoc psom (4 agendy) a E-shopy.
- Režim vychádza z **aktuálnych hodnôt**, nie iba z historického
  hash/receiptu. Majiteľ môže zvoliť Notion → Admin alebo Admin → Notion.
  Bežné cron/webhook behy `manualDirection` nepoužívajú.
- Pre jeden už prepojený profil sa overuje kanonické Psipedia ID,
  Notion page ID a parent/data source; existujúce adaptéry zachovávajú
  ochranu publikovania, príslušnosti, potvrdených Google adries
  a kanonického Services V3.
- Postupný D1 job runner pracuje po **najviac dvoch profiloch**
  v existujúcom minútovom crone. Má atomický claim, opakovanie
  do 8 pokusov, oneskorenie medzi pokusmi, trvalé ID úlohy
  a výsledný stav na úrovni profilu.
- `POST /api/admin/notion-manual-transfer` najprv vytvára len čítací
  náhľad. Samotné zápisy vyžadujú druhú požiadavku
  `CONFIRM_NOTION_MANUAL_TRANSFER` pre úplne preskúmaný beh. Existuje aj read-only
  `GET` na zistenie stavu behu.
- Feature flag `NOTION_MANUAL_TRANSFER_ENABLED` je **OFF**,
  kým vlastník nenasadí schválenú migráciu `0156`, neoverí výsledok a výslovne ho nezapne.
  Žiadna produkčná migrácia ani jednorazový prenos nie sú vykonané.
- Pri starom historicky potvrdenom rozdiele v Plemenách môže
  vynútený smer opraviť obsah bez novej zmeny v Notione.
  Pri neplatnom poli prenos hlási čiastočné zlyhanie; netvári
  sa ako plný úspech.
- Kód má samostatné offline testy smeru, výslovných prázdnych
  hodnôt, ochrany systémových polí a izolácie od bežného cronu.

## Časť 3 — implementovaná; aktivácia len po manuálnom schválení

- V Admin → Nastavenia → Notion je jeden formulár pre všetkých päť oblastí.
  Umožňuje smer, rozsah jeden profil / všetky profily, kategóriu a Psipedia ID.
- Vytvorenie behu je **len návrh náhľadu** (stav `PREVIEW`).
  Cron po dvoch profiloch číta skutočné hodnoty Notion a D1, eviduje každý
  rozdiel (`CHANGE`), zhodu (`SAME`) a preskočené polia (`SKIPPED`).
  Načítané hodnoty sa neukladajú do reportu; do D1 ide len ich fingerprint.
- Keď sú všetky profily preskúmané (`PREVIEW_READY`), Admin vyžaduje
  samostatné potvrdenie. Až potom sa beh zmení na `QUEUED`.
- Pri vykonávaní sa pred prvým zápisom porovnajú aktuálne údaje s uloženým
  fingerprintom náhľadu. Ak medzitým prišla zmena, prenos je označený
  `TRANSFER_PREVIEW_STALE` a bez prepísania končí chybou.
- Po zápise sa znovu načítajú Notion aj Admin. Každé pole samostatne
  dostane `SAME`, `UPDATED`, `SKIPPED` alebo `FAILED` a kód dôvodu.
  Report nezamieňa `DONE` webhooku za potvrdenú dátovú zhodu.
- UI obsahuje progres, posledných 15 behov, filtrovanie chybných profilov,
  stránkovaný detail polí a opakovaný **nový náhľad iba neúspešných profilov**.
- Migrácia `drizzle/0156_notion_manual_transfer_jobs.sql` je dostupná iba
  v existujúcom chránenom produkčnom workflow po potvrdení majiteľom.
  Žiadna migrácia sa nespustí pri merge.
- Funkcia je predvolene vypnutá cez `NOTION_MANUAL_TRANSFER_ENABLED`.
  Zapnutie tohto prepínača je samostatné vedomé rozhodnutie po schválení
  migrácie. Pred aktiváciou Admin jasne ukazuje, že prenos nie je dostupný.

### Známe obmedzenia (neprezentovať ako úspech)

- Vynútený hromadný prenos neprepisuje kanonický Services V3,
  publikovanie, identitu ani potvrdené Google údaje.
- Fotografie, galérie a vzťahy plemien, logo e-shopu a obrazové súbory
  ďalších oblastí potrebujú vlastné adaptéry. V reporte sú zreteľne
  `SKIPPED – SPECIAL_ADAPTER_REQUIRED` (alebo pevne chránené), nie `UPDATED`.
- Čiastočná chyba poskytovateľa môže spôsobiť úspešný zápis niekoľkých polí
  a chybné iné polia. Prvý beh sa preto nereprezentuje ako atomický prepis profilu.
- Pripravený testovací balík je offline; reálne Notion API a D1 sa musia
  overiť na jednom kontrolnom profile **po** manuálnej produkčnej aktivácii.
  Samotné zelené CI nepreukazuje kvalitu všetkých historických údajov.

## Invarianty

1. Správny profil a prepojené Notion page ID musia byť overené pred zápisom.
2. Prázdny existujúci údaj (výslovné vymazanie) a chýbajúci stĺpec nie sú to isté.
3. Čiastočné zlyhanie jedného poľa nesmie byť nahlásené ako úspech celého profilu.
4. Trvalé priority polí sa jednorazovým prenosom **nemenia**.
5. Ani `DONE` v webhook inboxe nie je dôkaz zhody dát.
