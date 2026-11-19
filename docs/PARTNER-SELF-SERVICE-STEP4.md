# Psipedia Partner – krok 4/8: vytváranie nových záznamov

## Rozsah

Existujúce moderované vytváranie profilov Služieb pre psov, organizácií a podujatí sa znovu používa bez duplicít. Nová trasa `/partner/pomoc/nova` dopĺňa:

- **ADOPTION_DOG** – adopcia psa;
- **LOST_FOUND_DOG** – stratený alebo nájdený pes;
- **HELP_CASE** – dočasná opatera, zbierky, dobrovoľníctvo a urgentné prípady.

Nové návrhy používajú `moderation_submissions` s `operation=CREATE` a `submitter_type=PARTNER_ACCOUNT`. Dopredu vzniká **iba moderovaná žiadosť**, nie kanonický riadok. Žiadna nová migračná tabuľka, paralelný stav ani zmeny Notion synchronizácie.

## Bezpečnosť a priebeh

- Aktívny overený partner, dokončené onboarding údaje, CSRF/origin guard s JSON POST a account-scoped čítanie.
- Server striktne povoľuje iba verejné obsahové polia príslušného typu, validuje povinné polia, dĺžky, enumy a dátum. Partner nesmie poslať status, publikáciu, SEO, ID, vlastníctvo ani privátne údaje.
- Limit podaní a identitný fingerprint zdieľajú existujúcu infraštruktúru ochrany `enforcePartnerNewProfileRateLimit`; identická čakajúca žiadosť je zamietnutá 409.
- Jednoduché porovnanie s kanonickými riadkami označí možnú duplicitu na manuálne preverenie; samo nič nekopíruje ani neprepisuje.
- Zápis návrhu, moderátorskej udalosti a auditu prebehne v jednej D1 batch transakcii.
- Admin dostane notifikačnú udalosť a v `/admin/partners/help-submissions` vidí čakajúce návrhy; návrhy sú dostupné v Partner dashboarde a `Žiadosti a zmeny`.
- Partner môže vlastnú aktívnu žiadosť stiahnuť. Cross-account stiahnutie je blokované.

## Zámerná hranica kroku 4

Administrátorský zoznam je zatiaľ **iba na čítanie**. Krok 5 doplní spoločné editory schválených záznamov a krok 7 moderáciu podkladov vrátane schválenia či zamietnutia, úpravy údajov pred schválením, bezpečného vytvorenia kanonického konceptu a následného pridelenia jediného správcu. Kým tento workflow neexistuje, žiadne Help CREATE návrhy sa nesmú automaticky označovať za schválené. Verejné záznamy nevznikajú **bez automatickej publikácie**.

## Nasadenie

PR #1437 ostáva Draft. Migračné súbory 0171 a 0172 zostávajú UNACTIVATED; krok 4 nevyžaduje nový D1 migration rollout. Pred nasadením celej vetvy overiť green testy, samostatný produkčný preflight a manuálnu aplikáciu 0171/0172 podľa dokumentácie kroku 3.
