# Pomoc psom – jednotné SQL zápisy a zámky, krok 4/6

Stav: **kódové zmeny a regresie pripravené v tom istom Draft PR #1463; produkčné D1/Notion správanie a úplná parita zostávajú na kontrolu.** Tento krok nespúšťa migráciu, neprenáša dáta ani nemení záznamy v produkcii.

## Kanonická mapa – žiadne paralelné JSON editory

| Podagenda | Jediný kanonický SQL vlastník | Admin write | Partner write | Notion read/write adapter | Verejné čítanie |
|---|---|---|---|---|---|
| Zbierky, dočasná opatera, dobrovoľníctvo | `help_cases` | `updateManagedHelpCase` | `lib/partner-help-editor.ts` | `lib/notion-events-help-adapters.ts` | `lib/help-store.ts` |
| Organizácie/útulky | `help_organizations` (+ `organization_locations`) | `updateOrganizationFromAdmin` | `lib/partner-profile-changes.ts` | ten istý adapter | `lib/help-organization-store.ts` |
| Adopcie | `adoption_dogs` | `updateAdoptionFromAdmin` | `lib/partner-help-editor.ts` | ten istý adapter | `lib/adoption-store.ts` |
| Stratené a nájdené | `lost_found_dog_reports` (+ samostatné šifrované súkromné údaje) | `updateAdminDogReport` | `lib/partner-help-editor.ts` | ten istý adapter | `lib/lost-found-dog-store.ts` |

Notion identity/mappingy ostávajú v `notion_agenda_sync`, nie v druhom úložisku profilových textov. `gallery_json`, obrázkové a SEO JSON objekty **v SQL** nie sú samostatné JSON databázy. Nesnažiť sa ich v tomto kroku odstrániť. Rozsah partnerských editorov a migračnej schémy patrí existujúcemu PR #1437; neklonovať ich.

## Konkrétne bezpečnostné opravy v kroku 4

### 4A. Historický backfill musí dodržať Admin aj Partner zámok

`lib/help-sql-reviewed-backfill.mjs` dopĺňa kontroly:

- `admin_entity_reviews`: manuálne označenie **Odkontrolované** blokuje obnovenie historického textu aj obrázka.
- `partner_help_claims`: schválený aktuálny partner adopcie blokuje legacy prenos aj pri chýbajúcom checkmarku.
- `partner_resources` + `partner_memberships`: aktívny správca organizácie blokuje ten istý prenos.
- Zámok sa kontroluje **dvakrát**: pri zostavovaní per-field plánu a v korelovanej SQL podmienke finálneho `UPDATE`. Ak vznikne po plánovaní, výsledkom je 0 zmenených riadkov, nie tiché prepísanie.
- Neexistujúca partner/review schéma znamená SQL chybu a zastavenie, nie predpoklad, že nikto nemá prístup.
- `NOTION` synchr. zámok už používa `lib/admin-notion-review-lock.ts` pre všetky štyri Help agendy. Nový backfill nemôže predstavovať výnimku.

### 4B. Chýbajúci Admin BEFORE/AFTER snapshot nesmie spustiť whole-profile Notion replay

V `lib/notion-targeted-admin-save.ts` už pri chýbajúcom `beforeHelpSnapshot` **alebo** neúspešnom načítaní kanonického `afterHelpSnapshot` nezačne potenciálne nebezpečná celoprofilová synchronizácia. Vráti `pending`, Admin/D1 uloženie zostáva úspešné. Neprichádza k ďalšiemu Notion pull ani k automatickému zahladeniu novšieho SQL stavu. Nový profil bez predchádzajúceho snapshotu sa naďalej rieši existujúcim bootstrap postupom.

Pri oboch overených snapshotoch zostáva existujúca per-field delta cez `changedAdminHelpFields`, teda jediný upravený údaj nespôsobí poslanie celého editačného formulára.

### 4C. Zámok vzniknutý počas targeted sync nesmie vyzerať ako „synced“

`lib/notion-targeted-admin-help.ts` kontroluje zámok **aj po vykonaní synchronizačného sweepu**. Predtým mohol sweep započítať locked profil medzi `unchanged` a targeted hook potom vrátiť `synced` bez reálneho editovateľného writebacku. Ak sa zámok objavil počas behu, vracia `disabled`; ak vzdialený stav nebol potvrdený, zostáva `pending`.

Toto je dodatočná ochrana hláseného výsledku, **nie dôkaz transakčnej atomickosti medzi D1 a Notion**. Na úplné vylúčenie všetkých pretekov sa aj naďalej vyžaduje živý E2E test a potvrdenie správania pri paralelných editáciách.

## Automatické testovanie

`tests/help-sql-reviewed-backfill.test.mjs` má nové skutočné SQLite scenáre: reviewed adopcia/organizácia, schválený partner, zrušený partner a partner/review udelený **medzi plánom a vykonaním SQL**.

`tests/help-sql-canonical-sync-step4.test.mjs` testuje:

1. Žiadny Notion whole-profile replay pri chýbajúcom `BEFORE`.
2. Žiadny whole-profile replay pri chýbajúcom `AFTER`.
3. Poslanie iba skutočnej zmeny v D1.
4. Zámok vytvorený počas targeted sync nesmie vrátiť `synced`.
5. Štyri konkrétne kanonické SQL ownership cesty pre Admin, Notion, Partner a verejný web.
6. `PUT` synchronizuje až po D1 save; `GET` nesmie zapisovať.

`npm run test:help-sql-sync-step4` je zapojené do existujúceho `npm run test:foundation`, ktorý už inštaluje dependencies. Existujúci **bez-závislostný** read-only inventory workflow vykonáva schema/backfill SQLite testy; nový TS-kompilujúci integračný test sa v ňom nespúšťa, aby nebolo nutné pre jediný audit inštalovať celý balík `npm ci`.

## Čo sa ešte nemôže tvrdiť

- Žiadny aktuálny reálny Admin ↔ D1 ↔ Notion ↔ Partner ↔ Public E2E dôkaz produkčnej parity nie je v tomto PR doložený.
- Per-field **last-write-wins** pri nezávislých súbežných zmenách toho istého poľa nie je plne dokazateľný len z record-level timestampov; existujúci trojcestný `CONFLICT` má zostať blokujúci, nie tiché hádanie víťaza.
- Reálne čistenie historických JSON fallbackov patrí kroku **5/6**.
- One-action produkčný runbook a záloha/postflight patria kroku **6/6**.
- PR #1437 a ďalšie paralelné zmeny treba revidovať proti aktuálnemu main pred merge. Migrácie 0171/0172 sa nesmú opakovať.

**Stav výsledku:** krok 4 = konkrétne ochrany v kóde + regresné testy pre integráciu cez existujúce kanonické D1. Nie produkčne spustená a potvrdená finálna synchronizácia.
