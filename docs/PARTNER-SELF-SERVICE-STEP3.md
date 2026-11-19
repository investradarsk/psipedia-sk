# Psipedia Partner – krok 3/8: prevzatie existujúcich záznamov

## Pokryté kanonické kategórie

- **Služby pre psov**: existujúce `directory_profiles`, všetky kategórie aj viackategóriové profily.
- **Organizácie Pomoci psom**: `help_organizations`.
- **Podujatia**: `managed_events`.
- **Adopcie**: `adoption_dogs`; len verejné aktívne alebo rezervované psy.
- **Stratené/nájdené psy**: `lost_found_dog_reports`; len publikované aktívne a neexpirované hlásenia.
- **Ostatné prípady Pomoci psom**: `help_cases`, kategórie dočasná opatera, zbierky, dobrovoľníctvo a urgentné prípady, len publikované a nevyriešené.

## Spoločný workflow

Prihlásený overený Partner vyhľadáva záznam cez `/partner/prevziat` podľa názvu/mesta a odošle jednu žiadosť cez `/api/partner/claims`. Vyhľadávanie vracia najviac 15 verejných výsledkov na typ, limituje dĺžku textu a escapuje SQL LIKE wildcards. Žiadosti majú globálny limit 10 za hodinu na účet naprieč starými a novými typmi, unikátny aktívny PENDING claim a audit.

Admin používa ten istý zoznam `/admin/partners/claims`, detail a rozhodovanie (APPROVE/REJECT). Vlastnú žiadosť si nemôže schváliť administrátor namapovaný na ten istý partnerský účet. Rozhodnutie je auditované, mailové notifikácie opakovane odosielajú iba jedinečné udalosti. Jediný externý správca nemôže byť prekonaný súbežným schválením.

Partner vidí žiadosti v `/partner/ziadosti` a schválené záznamy v `/partner` aj `/partner/profily`. Pre podujatia/služby/organizácie zostávajú existujúce editory. Nové tri typy **ešte nemajú partnerské editory**: po schválení sa záznam viditeľne zobrazí, ale tlačidlo neotvára nefunkčný editor. Ich vytvorenie a editácia patria do krokov 4/5.

## Fyzická databázová stratégia

Staré `partner_resources` sú cez CHECK a odkazy z množstva existujúcich tabuliek pevne naviazané na tri staré kanonické typy. Nie je bezpečné ich v D1 jednoducho zahodiť a postaviť nanovo. Aby sme nestratili údaje a neporušili FK, `0172_partner_help_claim_ownership.sql` **aditívne** vytvorí len `partner_help_claims` s troma skutočnými typovými FK a XOR CHECK. Ide o rozšírenie evidencie práv pre nové typy, **nie o duplikovanie verejných profilov alebo obsahu**.

- `PENDING`: žiadosť bez oprávnenia.
- `APPROVED`: jediný aktívny externý správca príslušného kanonického záznamu.
- `REJECTED`/`CANCELLED`: história bez prístupu.
- `REVOKED`: po explicitnom odobratí prístupu administrátorom zostáva kompletná história.

Tri čiastkové UNIQUE indexy `WHERE status='APPROVED'` zabezpečujú najviac jedného vlastníka na záznam aj pri súbežnom schválení. Tri ďalšie UNIQUE indexy zabezpečujú najviac jednu PENDING žiadosť od toho istého účtu na záznam. `getPartnerMembership` a `listPartnerResources` čítajú obe existujúce evidencie cez **spoločnú autorizačnú vrstvu**, ktorá pre nové typy zatiaľ povoľuje len RESOURCE_VIEW a MEMBERSHIP_VIEW (žiadne predstierané editovanie/propagácia).

Ide o prechodné fyzické oddelenie práv z dôvodu FK bezpečnosti, ale spoločný login, permissions, schvaľovacia schránka, audit a UI sú jednotné. Budúce konsolidovanie fyzických tabuliek nesmie prebiehať bez plánovanej dátovej migrácie.

## Prevádzkové hranice

- **Migrations 0171 a 0172 sú UNACTIVATED.** Merge PR ich nesmie automaticky aplikovať.
- Najprv dokončiť kódové regresie, uložiť zálohu, overiť D1 schému a preflight duplicít 0171; následne samostatne aktivovať 0171 a 0172 chráneným postupom.
- Pred produkčným zapnutím volania `partner_help_claims` musí byť 0172 skutočne prítomná v D1. Nové zmeny nenasadzovať skôr.
- Údaje kanonických záznamov ani Notion synchronizácia sa krokom 3 nemenia.
- Výmena správcu: najprv explicitne REVOKE existujúci APPROVED claim, až následne APPROVE ďalšiu žiadosť.

## Testy

`tests/partner-existing-record-claim-step3.test.mjs` – pôvodné tri typy, dostupnosť verejného záznamu a spracovanie URL.

`tests/partner-help-claims-step3.test.mjs` – fyzické FK/CHECK/UNIQUE pravidlá, zmena správcu bez straty histórie, account scoping a publikovanie pri všetkých troch ďalších typoch.

`tests/partner-claims-verification.test.mjs` – zachovanie bezpečnostného contractu a schvaľovania.

`tests/e2e/partner-auth.spec.ts` – desktop a mobil pre existujúce prevzatie, vyhľadávanie a roly.

Pred merge overiť zelený partner security CI, TypeScript build aj Playwright. PR #1437 má pokračovať do krokov 4–8 ako Draft.
