# Psipedia.sk – Partneri V2, krok 2/8: registrovaní partneri

Dátum: 19. 11. 2026
PR: #1467, stále Draft, NEMERGOVAŤ po tomto kroku.

## Zrealizované

- Hlavnou obrazovkou **/admin/partners** je odteraz tabuľka registrovaných partnerov, nie osem rôznych súhrnných dlaždíc.
- Presne šesť stĺpcov: **Partner** (dešifrované meno z `partner_account_profiles`, stav a dátum), **E-mail** (dešifrovaný), **Žiadosti** (počet aktuálnych nevybavených), **Profily** (pridelené aktívne membershipy + schválená správa Help), **Správy** (zatiaľ jasné „— / Pripravujeme“, NIE vymyslená nula), **Otvoriť** (existujúci účet).
- Vyhľadávanie zahŕňa meno, e-mail a ID. Pôvodné serverové stránkovanie, stav účtu, overenie e-mailu a filter prístupov zostávajú, pokročilé filtre sú zbalené.
- `listPartnerAccountsAdmin` počíta žiadosti **len pre účty aktuálnej stránky**, bez globálneho skenovania kompletnej D1. Výpočty pokrývajú:
  - `partner_claims` PENDING;
  - `partner_help_claims` PENDING;
  - `moderation_submissions` aktívne SUBMITTED/PENDING_REVIEW/QUARANTINED cez profilové, udalostné a zmenové metadáta;
  - partnerské CREATE podania Help ADOPTION_DOG/LOST_FOUND_DOG/HELP_CASE;
  - `partner_resource_verifications` PENDING_VERIFICATION;
  - `partner_commercial_interests` NEW.
- Nezamieňajú sa schválené alebo zamietnuté návrhy s aktívnymi žiadosťami.
- Filter „S prístupom“ vidí aj partnera spravujúceho výlučne Pomoc psom (`partner_help_claims` APPROVED), nie iba partner_memberships.
- Zachovaná administrátorská autentifikácia, server-only dešifrovanie PII, pôvodné účty, session, všetky schvaľovacie API a história. Žiadna zmena schémy či dát.
- Staré samostatné prehľady žiadostí sú v zbalenej prechodnej sekcii pod tabuľkou. Sú dostupné, kým ich krok 3 nenahradí jednotným detailom partnera.
- Responzívne rozloženie do mobilných kariet v existujúcom `partners.css`. Žiadne globálne štýlové zásahy.

## Overenie a testy

- Rozšírený `tests/partner-admin-search.test.mjs`: vyhľadávanie podľa šifrovaného kontaktného mena, historické stránky, správne počty rôznych typov žiadostí vrátane Help, izolácia partnerov a Help-only ownership filter.
- UI regresia v tom istom teste: šesť stĺpcov, konto pred starými frontami, zachovaná administrátorská brána a mobilné CSS.
- Statická kontrola obsahu aktuálnej vetvy potvrdila všetky zmenené zdroje a zachované odkazy.
- **Testy lint/build/integration nie sú týmto dokumentom označené ako vykonané ani zelené.** Overiť cez CI alebo lokálne pred zlúčením celého PR po kroku 5.

## Vedome odložené

- **3/8:** detail človeka – jeho všetky žiadosti, profily, chat, konto a audit. Tlačidlo Otvoriť zatiaľ smeruje do existujúceho detailu, aby nič nebolo nefunkčné.
- **7/8:** skutočný súkromný chat, počítadlo neprečítaných správ a partnerove notifikačné nastavenia; zatiaľ stĺpec Správy zobrazuje prechodné „Pripravujeme“.
- **5/8 a 7/8:** celkové počítadlo v navigačnom menu Partneri (vrátane upozornení na priame zmeny a správy) doplniť až keď bude existovať jednotný inkrementálny inbox.
- **4/8:** vytvorenie kanonického draftu pred odoslaním, schválenie+publikácia a return-to-draft nie sú zmenené týmto krokom.

## Závislosti a opatrnosť

- **0171/0172 už nasadené:** nespúšťať opäť.
- Neobsadiť čísla migrácií 0173+ bez aktuálneho inventára; paralelný SQL adresár a Help cutover PR #1463.
- Ak produkčná schéma neobsahuje očakávané partner tabuľky, stránka má bezpečne zlyhať a má sa preveriť DB, **nie ukazovať vymyslenú nulu**.
- Nemergať PR #1467 pred krokmi 3–5, kompatibilným read-only produkčným preflightom a schváleným CI.

## Stav

**2/8 implementované na pracovnej vetve; PR #1467 ostáva Draft.**
