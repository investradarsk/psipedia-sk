# CI administrácie: rýchle kontroly a plná akceptácia

## Rozpracovaný pull request (Draft)

- Povinný **Playwright E2E and production smoke / Build, lint and unit/integration tests** beží na každej zmene. Pri úprave administrácie spúšťa aj rýchle kontrakty editorov; pri zmenách článkov a plemien aj príslušné jednotkové kontrakty.
- Povinná kontrola **Breed CI bootstrap, all-breed regression and Playwright** si zachováva svoj pôvodný názov a spúšťanie.
- Náročné izolované build + lokálna D1 + Playwright zostavy vo vybraných editorových workflowoch sa pri Draft PR nespúšťajú. Ostatné relevantné zamerané workflowy (napr. galéria) zostávajú nezmenené.

## Pripravený na merge (Ready for review)

- Akciu **Ready for review** treba vykonať až po dokončení editorských krokov; spustí odložené workflowy pre články, plemená, podujatia, navigáciu, spoločný workspace, PWA, operácie a zodpovedajúce verejné vizuálne porovnania.
- Každý ďalší commit do pripraveného PR znovu spustí príslušné plné workflowy; **workflow_dispatch** v existujúcich workflowoch zostáva zachovaný.
- Pred merge skontrolovať aj nepovinné červené E2E kontroly a ich zistené regresie, nie iba GitHub required status. Toto nastavenie nemení ruleset ani potrebné schválenia.

## Optimalizácia rozsahu

- Verejné baseline screenshoty sa už nespúšťajú pri zmenách iba v `app/admin/**` a `components/admin-**` (na to sú samostatné administrátorské E2E).
- Gemini foundation sa nespúšťa pri všeobecnej úprave editorov podujatí a Pomoci psom bez zmeny Gemini logiky.
- Nezasahujeme do produkčných migrácií, dát, automatizácií, limitov platených API ani synchronizácie Notion.
