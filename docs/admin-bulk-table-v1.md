# Psipedia Admin – hromadné úpravy v tabuľkách (etapa 2/5)

## Čo pribudlo
- Zdieľaný `AdminRecordTable` teraz vie vykresliť voliteľný výber
  TanStack Table (`rowSelection`): checkbox pri riadku a checkbox na označenie
  všetkých **na aktuálnej strane**. Nastavuje sa iba cez explicitný `selection`
  prop; ostatné tabule zostanú nezmenené.
- Spoločná tabuľka `/admin/pomoc-psom` používa tento výber pri
  **Dočasnej opatere, Zbierkach a Dobrovoľníctve**.
- Ak označíš viac záznamov, zobrazia sa dve akcie:
  `Skontrolovať publikovanie` a `Skontrolovať presun do konceptov`.
  Najprv sa vykoná **serverový preflight**; potom vidíš presný počet zmien
  a musíš ich osobitne potvrdiť.
- Pri úspechu sa tabuľka obnoví. Pri chybe sa výber zachová na kontrolu
  a zmena sa neopakuje automaticky.

## Bezpečnosť
- Výber sa viaže na kategóriu, vyhľadávanie, číslo strany a aktuálne ID.
  Pri navigácii na iný výber nie je možné použiť starý snapshot.
- Recyklujeme existujúce autorizované `POST /api/admin/help/bulk`,
  nie novú obchádzku. Endpoint vyžaduje admin identitu, správny Origin
  a JSON, preflight kontroluje kategóriu i publikačné pravidlá.
- D1 vykoná atomický compare-and-set podľa ID, predchádzajúceho stavu a
  `updated_at`. Ak sa medzi kontrolou a potvrdením zmení záznam,
  neaplikuje sa čiastočná hromadná zmena.
- Adopcie, nájdené/stratené psy a útulky sú samostatné domény s vlastnými
  stavmi, preto sa cez generic Help `published/draft` nemôžu meniť.
- Hromadné **mazanie** nepribudlo. Notion, automatizácie a ich priority
  zostávajú nedotknuté.
- Existujúce bulk funkcie v `/admin/pomoc`, článkoch, adresári a
  organizáciách sa nemusia meniť a naďalej používajú svoje doménové API.

## Manuálna kontrola po dokončení piatich etáp
1. `/admin/pomoc-psom?category=dobrovolnictvo`: označ 2 riadky,
   skontroluj počet, potvrď zmenu a obnov tabuľku.
2. Zmeň kategóriu alebo stránku – starý výber nesmie prejsť ďalej.
3. Pri neoverenej zbierke musí preflight vysvetliť publikačné obmedzenie.
4. Pri adopciách a stratených psoch sa bulk publikovanie nesmie zobraziť.
5. Skontroluj klávesnicu, screen reader názvy checkboxov a výber celej
   strany pri zoradenom zozname.

**Režim tohto PR:** bez merge; najprv etapy 3, 4, 5, potom spoločné CI opravy.
