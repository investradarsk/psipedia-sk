# CI administrácie: rýchle kontroly a plná akceptácia

## Rozpracovaný pull request (Draft)

- Povinný **Playwright E2E and production smoke / Build, lint and unit/integration tests** beží na každej zmene. Pri úprave administrácie spúšťa aj rýchle kontrakty editorov; pri zmenách článkov a plemien aj príslušné jednotkové kontrakty.
- Povinná kontrola **Breed CI bootstrap, all-breed regression and Playwright** si zachováva svoj pôvodný názov a spúšťanie.
- Náročné izolované build + lokálna D1 + Playwright zostavy vybraných editorových, mapových, SEO, recenzných, partnerských a profilových workflowov sa pri Draft PR nespúšťajú. Ostatné relevantné zamerané workflowy (napr. galéria) zostávajú nezmenené.

## Pripravený na merge (Ready for review)

- Akciu **Ready for review** treba vykonať až po dokončení krokov; spustí všetky odložené workflowy vrátane editorov, máp, partnerov, recenzií, obsahových väzieb, Gemini kontraktov, verejného SEO a Playwright snímok.
- Každý ďalší commit do pripraveného PR znovu spustí príslušné plné workflowy; **workflow_dispatch** v existujúcich workflowoch zostáva zachovaný.
- Pred merge skontrolovať aj nepovinné červené E2E kontroly a ich zistené regresie, nie iba GitHub required status. Toto nastavenie nemení ruleset ani potrebné schválenia.

## Zachované kontroly počas Draft

- Povinné joby na `playwright-e2e.yml` ostávajú aktívne; plná unit/integration regresia sa naďalej spustí pri zmenách schémy a migrácií.
- `clean-d1-migration-validation.yml` zostáva aktívne počas Draft PR, aby sa zmeny SQL a migrácií preverili v prázdnej lokálnej D1.
- `workflow_dispatch` zostáva dostupný všade, kde bol definovaný; odložené E2E možno spustiť manuálne.
- Po prepnutí na Ready for review treba skontrolovať všetky výsledky pred merge, nielen povinné kontroly.

## Optimalizácia rozsahu

- Verejné baseline screenshoty sa už nespúšťajú pri zmenách iba v `app/admin/**` a `components/admin-**` (na to sú samostatné administrátorské E2E).
- Gemini foundation sa nespúšťa pri všeobecnej úprave editorov podujatí a Pomoci psom bez zmeny Gemini logiky.
- Nezasahujeme do produkčných migrácií, dát, automatizácií, limitov platených API ani synchronizácie Notion.
