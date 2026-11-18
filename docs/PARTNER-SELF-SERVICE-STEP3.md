# Psipedia Partner – 3/8: prevzatie existujúceho záznamu

## Pripravený používateľský tok

1. Prihlásený používateľ otvorí **/partner/prevziat** z dashboardu, profilu, podujatia alebo partnerského menu.
2. Vyberie typ a vyhľadá existujúci publikovaný záznam podľa názvu/mesta. D1 vráti nanajvýš 15 verejných výsledkov. Nikdy sa nevyhľadávajú interné ID partnerov ani nepublikované záznamy.
3. Pri výsledku otvorí pôvodný kanonický záznam na verejnom webe alebo „Požiadať o správu“ cez `/partner/prevziat-profil/{type}/{id}`.
4. Registrácia/session, ochrana same-origin, limit 10 žiadostí za hodinu, ochrana duplicitných PENDING, audit, admin upozornenie a e-mailové potvrdenie sú prebrané z existujúceho `partner_claims` workflow.
5. Administrátor v jednej existujúcej schvaľovacej schránke vidí služby, organizácie a **publikované podujatia**. Schválenie používa `ensurePartnerOwnerMembershipAdmin` a tým ochranu „najviac jeden aktívny správca“, vlastné žiadosti nemôže administrátor schváliť.
6. Pri schválenom podujatí sa pridelí oprávnenie k existujúcemu `managed_events` záznamu; nevytvára sa jeho kópia. Nevytvára sa verejné overenie služby, ktoré pre podujatia nie je relevantné.

## Pokryté typy

- **Služby pre psov** – všetky kategórie v kanonickom `directory_profiles`, vrátane viackategóriových profilov.
- **Organizácie Pomoci psom** – kanonické `help_organizations`.
- **Podujatia** – kanonické `managed_events`; iba publikované záznamy.

## Zostávajúca závislosť: adopcie a stratené/nájdené psy

Existujúce `partner_resources` sú podľa fyzického SQL `0060_partner_memberships_admin.sql` typované iba na `DIRECTORY_PROFILE`, `HELP_ORGANIZATION`, `MANAGED_EVENT` a majú kontrolu presne jedného z ich troch FK stĺpcov. `adoption_dogs` a `lost_found_dog_reports` sú iné kanonické tabuľky.

**Nepovoľovať adopciu cez resource organizácie ani stratený/nájdený záznam cez cudzí typ** – obchádza to účtové oprávnenia a dávalo by to partnerovi širší prístup, než mu schvaľujeme. Tieto dva typy čakajú na typovo bezpečné rozšírenie resource/membership kontraktu a ich samostatné editory v ďalších krokoch. Pre ne zatiaľ nie je tlačidlo, ktoré by predstieralo fungujúcu správu.

Nevytvárali sa paralelné profily, nové membership tabuľky, SQL migrácia ani zmeny Notion synchronizácie.

## Testy

- `tests/partner-existing-record-claim-step3.test.mjs`: sqlite in-memory verejné filtre (publikované / nepublikované / archivované), bezpečné LIKE, URL, 15-result limit a existujúce UI linky.
- `tests/partner-claims-verification.test.mjs`: aktualizovaný rozsah claimu aj na publikované podujatie; vlastnícke kontroly a audit zostávajú.
- `tests/e2e/partner-auth.spec.ts`: desktop/mobil vyhľadajú existujúce podujatie a otvoriteľný URL cieľ claimu.
- `npm run test:partner-claims-step3` beží aj v `test:partner-auth`.

## Nasadenie

PR #1437 zostáva rozpracovaný spolu s krokmi 1–2. Pred merge zosúladiť s main a dokončiť všetky regresné kontroly. Produkčná migrácia 0171 stále nebola automaticky aktivovaná.
