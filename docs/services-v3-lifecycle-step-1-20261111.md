# Služby V3 — zjednotený životný cyklus (krok 1/6)

Dátum: 2026-11-11. Zmena kódu bez zásahu do produkčnej D1 alebo Notion.

## Bežná verejná administrátorská cesta

1. **Vytvoriť:** autorizovaný Admin vytvorí nový kanonický `svc.admin.*` alebo `attr.admin.*` záznam priamo ako `ACTIVE / PENDING`. ID je trvalé a vzniká v D1, nie v Notion.
2. **Upraviť:** aktívny záznam možno upraviť cez rovnaké verziované API (CAS); zostáva `ACTIVE`, zrkadlo sa označí `PENDING` a neskôr ho spracuje existujúci automatický synchronizátor. To platí aj pre záznam s predchádzajúcim konfliktom zrkadla — úprava vytvorí novú verziu.
3. **Archivovať:** akcia `retire` mení stav na `RETIRED`. Identita ani auditná história sa nemažú; archivovaný záznam sa nedá ďalej upravovať ani vyberať na profile.
4. **Priradiť ku profilu:** na kanonické výbery Áno/Nie nepotrebujeme potvrdenie Notion `SYNCED`. Rovnako ako nový výber sa môže zmeniť aj už uložený výber počas `PENDING`. Služba však musí byť `ACTIVE` a povolená pre kategóriu; verziované zápisy zachovávajú CAS.

## Starý DRAFT workflow

- Admin API pre katalóg povoľuje len akcie `edit` a `retire`; `approve` a `retryMirror` sa cez HTTP nepoužívajú.
- Historická logika DRAFT/Notion receipt ostáva iba ako interný kompatibilitný mechanizmus. Schéma a pôvodná auditná ochrana sa nemenia.
- Historické DRAFT záznamy sa v administrácii nedajú predstierať ako aktívne alebo inline upravovať; stále ich možno archivovať. Nové položky vznikajú iba ako ACTIVE.

## Bezpečnostné invariancie

- Nezmenené ID, kind, autentifikácia, vyžadovanie úplnej schémy auditu 0134, validácia kategórií, kontrola duplicitného názvu a CAS.
- Úprava profilových výberov pri `PENDING` nie je potvrdenie úspešného Notion prenosu. Stále platí nezávislá synchronizácia a diagnostika.
- Nevykonáva sa SQL migrácia, nasadenie, prepísanie Notion položiek ani hromadný zásah do záznamov.

## Regresné testy

- `tests/service-catalog-admin-lifecycle.test.mjs`: ACTIVE/PENDING vytvorenie, opakované YES/NO bez Notion ACK, zmena definície a CAS, archivácia, odmietnutie ďalších zápisov, CONFLICT → edit → PENDING.
- `tests/service-catalog-admin-editor.test.mjs`: aktívne položky možno inline upravovať, historický DRAFT ostáva oddelený.

## Nasledujúce kroky v tom istom PR

2. Pravdivé hlásenia synchronizácie v editore.
3. Jeden zdroj aktuálnych definícií/override pre Notion a verejný web.
4. Jednotná sémantika odškrtnutia a opätovného priradenia.
5. Diagnostika a riešenie existujúcich konfliktov bez masového prepísania.
6. End-to-end parity kontrola verejného adresára, filtrovania a mapy.
