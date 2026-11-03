# Psipedia — spoločný jednorazový prenos Notion ↔ Admin (1/3)

## Schválený rozsah

Jeden spoločný PR, tri samostatné nadväzujúce časti. V tejto vetve sa
nemerguje ani nespúšťajú produkčné zápisy, kým nebude hotová časť 3.

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
- Pripravené tri samostatné D1 tabuľky v návrhu databázovej migrácie (zatiaľ bez čísla): beh,
  spracovávaný profil a výsledok konkrétneho poľa. Nepersistujú obsahové
  hodnoty profilov, iba ID, stavy a kódy chýb.
- Nový autorizovaný, len čítací endpoint
  `GET /api/admin/notion-manual-transfer/capabilities`.
  Výslovne hlási `executable: false`: žiadne nefunkčné tlačidlá.
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
- `POST /api/admin/notion-manual-transfer` vytvorí prenos až
  po striktnej serverovej validácii a potvrdení
  `CONFIRM_NOTION_MANUAL_TRANSFER`. Existuje aj read-only
  `GET` na zistenie stavu behu.
- Feature flag `NOTION_MANUAL_TRANSFER_ENABLED` je **OFF**,
  kým vlastník nenasadí budúcu očíslovanú a schválenú databázovú migráciu, nedokončí
  časť 3, neoverí E2E výsledok a výslovne ho nezapne.
  Žiadna produkčná migrácia ani jednorazový prenos nie sú vykonané.
- Pri starom historicky potvrdenom rozdiele v Plemenách môže
  vynútený smer opraviť obsah bez novej zmeny v Notione.
  Pri neplatnom poli prenos hlási čiastočné zlyhanie; netvári
  sa ako plný úspech.
- Kód má samostatné offline testy smeru, výslovných prázdnych
  hodnôt, ochrany systémových polí a izolácie od bežného cronu.

**Neuzavreté v časti 2:** doteraz žiadny systém nepreukazuje
zhodu každého individuálneho poľa **po** ručnom prenose pre všetky
agendy. Pripravené `notion_manual_transfer_field_results` zatiaľ
neobsahujú overené položky. Samostatne treba implementovať
bezpečné adaptéry pre špeciálne médiá, galérie a vzťahy plemien
(teraz sú zámerne mimo vynúteného všeobecného prepisu).
Týmto neoznačovať plnú funkčnosť „všetky stĺpce“ za hotovú.

## Časť 3 — po pokyne „Pokračuj 3“

- Rozhranie v Admin → Nastavenia → Notion: oblasť, podkategória/profil,
  smer, náhľad rozdielov, potvrdenie, stav priebehu.
- Skutočná nezávislá verifikácia všetkých podporovaných polí po prenose,
  záznam jednotlivých `notion_manual_transfer_field_results` a hlásenie
  vynechaných mediálnych/reláciových adaptérov bez falošného úspechu.
- Úspešné/preskočené/neúspešné polia s konkrétnym profilom a dôvodom;
  história a opakovať len neúspešné. Report ukazuje aj rozdiel
  medzi transportne úspešnou udalosťou a overenou rovnosťou po zápise.
- Testy naprieč skutočnými adaptérmi všetkých 5 oblastí a produkčný
  preflight pred merge. Žiadny automatický hromadný prepis pri merge.

## Invarianty

1. Správny profily a prepojené Notion page ID musia byť overené pred zápisom.
2. Prázdny existujúci údaj (výslovné vymazanie) a chýbajúci stĺpec nie sú to isté.
3. Čiastočné zlyhanie jedného poľa nesmie byť nahlásené ako úspech celého profilu.
4. Trvalé priority polí sa jednorazovým prenosom **nemenia**.
5. Ani `DONE` v webhook inboxe nie je dôkaz zhody dát.
