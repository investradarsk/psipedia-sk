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
- Pripravené tri samostatné D1 tabuľky v migrácii `0156`: beh,
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

## Časť 2 — po pokyne „Pokračuj 2“

- Reálne, iba na vyžiadanie vykonávané porovnanie Notion a Admin pre
  podporované polia každého scope, s možnosťou výberu jedného profilu,
  podkategórie alebo všetkých profilov.
- Obojstranný jednorazový prenos podľa potvrdeného smeru **aj pri starých
  rozdieloch**, nezávislý od toho, či má pole nový webhook alebo staré
  synchronizačné potvrdenie.
- Chránené systémové údaje, ID, publikovanie, Services V3 a overené
  Google Place ID sa neprepisujú; špeciálne mediálne a vzťahové
  adaptére musia reportovať nepodporovaný field, kým nie sú hotové.
- Nevyužiť jeden HTTP request na synchronizáciu celej databázy.
  Trvalá fronta po malých dávkach, idempotencia a kontrola súbehu.

## Časť 3 — po pokyne „Pokračuj 3“

- Rozhranie v Admin → Nastavenia → Notion: oblasť, podkategória/profil,
  smer, náhľad rozdielov, potvrdenie, stav priebehu.
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
