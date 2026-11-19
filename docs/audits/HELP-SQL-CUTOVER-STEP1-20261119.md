# Pomoc psom — jednotný SQL cutover, krok 1/6: audit kódu

Dátum: 2026-11-19  
Stav: **read-only audit zdrojového kódu hotový; produkčná dátová parita NEOVERENÁ**.  
Rozsah: iba Pomoc psom (všeobecné prípady, organizácie/útulky, adopcie, stratené a nájdené psy).  
Toto je prvý commit **jedného spoločného PR pre kroky 1–6**. Samotný audit nič nemení v produkcii, Notione, správaní aplikácie ani dátach.

## Zistenie: štyri existujúce kanonické tabuľky, päť podagend

| Podagenda/UI | D1 kanonický vlastník | Zistené kódové cesty |
|---|---|---|
| Zbierky, dočasná opatera, dobrovoľníctvo a ostatné všeobecné prípady | `help_cases` | `lib/help-store.ts`, `lib/help-admin-query.ts`, `app/api/admin/help/route.ts` |
| Útulky a organizácie | `help_organizations` + `organization_locations` | `lib/help-organization-store.ts`, `lib/help-organization-admin-write.ts` |
| Adopcie | `adoption_dogs` | `lib/adoption-store.ts`, `lib/adoption-admin-write.ts`, `db/adoption-schema.ts` |
| Stratené psy | `lost_found_dog_reports` (`type=LOST`) | `lib/lost-found-dog-store.ts`, `lib/lost-found-public-store.ts` |
| Nájdené psy | `lost_found_dog_reports` (`type=FOUND`) | rovnaký kanonický model ako stratené psy |
| Súkromné údaje hlásení | `lost_found_dog_private_details` | `db/lost-found-dogs-schema.ts`, `lib/lost-found-public-store.ts` |

**Nekopírovať tieto tabuľky** a nevytvárať univerzálnu pomoc-JSON tabuľku. Verejné čítanie už používa SQL (`lib/help-landing-store.ts`, dedikované store moduly); Admin zapisuje do SQL.

## Kde JSON ešte existuje — nerozhodovať o zmazaní podľa prípony

1. **Štruktúrované technické hodnoty v D1 SQL stĺpcoch:** `gallery_json` adopcií a hlásení; `thumbnail_display_json`, `detail_display_json`; `seo_json` všeobecnej Pomoci a organizácií. Sú to hodnoty uložené *v SQL*, nie automaticky druhá kanonická databáza. Zachovať, pokiaľ sa nepreukáže duplikát verejných editovateľných polí.
2. **Kandidát na rozbor po poliach:** `help_organizations.source_data_json` sa nachádza v modeli aj verejnom detaile. Overiť všetky kľúče, aktívnych writerov a readerov, ochranu výslovne prázdnej hodnoty. Nevymazať naslepo.
3. **Historické duplicitné entity:** `help_cases` obsahuje staršie kategórie `adopcia`, `utulky`, `stratene-a-najdene`. Existuje hranica `lib/help-admin-query.ts` a `lib/notion-help-domain-boundary.ts`; staré odkazy, redirecty, fallbacky, migrácie a Notion mappingy treba spočítať a rozlíšiť pred odpojením. Stará adopčná migračná dokumentácia opisuje konkrétne prenosy a zachovanie legacy detail fallbackov — historické čísla nie sú dnešná produkčná parita.
4. **Historizované snapshoty v SQL:** `adoption_dogs.organization_name/organization_slug` ostávajú kvôli kompatibilite pri súčasnom `organization_id`; nepovažovať ich automaticky za nepotrebný JSON ani ich nezahodiť bez vyriešených referencií.
5. **Importné JSON súbory v repozitári** sú jednorazové zdroje/importné manifesty; samy osebe nie sú živým runtime úložiskom. Audit musí samostatne rozlíšiť obsah importov od aktívnych fallbackov.

## Admin ↔ D1 ↔ Notion ↔ verejný web ↔ partner

- **Admin:** `lib/help-store.ts`, `lib/help-organization-admin-write.ts`, `lib/adoption-admin-write.ts`, `lib/lost-found-dog-store.ts` sú súčasné SQL zápisové adaptéry. Overiť všetky formuláre vrátane mazania, médií, publikovania, stavov a plne prázdnych hodnôt.
- **Verejný web:** `lib/help-landing-store.ts` číta 4 SQL vlastníkov; dedikované listingy, detaily, sitemap, karty a vyhľadávanie sa musia testovať nezávisle. Legacy fallbacky nesmú po cutoveri znovu vytvárať duplicitné záznamy.
- **Notion:** `lib/notion-events-help-adapters.ts` deklaruje 4 pomocné synchronizačné agendy `organizations`, `adoptions`, `help-cases`, `lost-found`; stratené a nájdené sú dve UI kategórie jednej agendy. Mappingy žijú v `notion_agenda_sync`. `lib/notion-events-help-sync.ts` obsahuje priorizačné, konfliktové a ochranné vetvy; politika last-write-wins podľa najnovšej skutočnej zmeny a zámok `Odkontrolované` sa preto **musí otestovať**, nie predpokladať. Notion schema `url/email/phone_number` môže limitovať čistý text; overiť presný typ každého kontaktu bez neúmyselného vynucovania formátu.
- **Partneri:** otvorený PR **#1437** mení práva a editory pre Help. Nesmie sa duplicitne vytvoriť partner editor ani ignorovať jeho schému `0171/0172`; pred aktiváciou tohto PR rebase/integračný audit voči aktuálnemu `main` a skutočne nasadeným migráciám. Po prevzatí prípadu musí partner meniť ten istý SQL záznam, nie JSON kópiu. Partnerské oprávnenia a ochrana súkromných polí zostávajú nedotknuteľné.
- **Súkromie:** verejné stratené/nájdené hlásenia používajú oddelenú tabuľku so šifrovanými PII; neprenášať ich do verejného JSON ani nezaťažovať audity ich obsahom.

## Čo chýba na produkčné potvrdenie

Bez najnovšieho **read-only reportu z produkčnej Cloudflare D1** nemožno tvrdiť plnú paritu alebo bezpečne vymazať legacy hodnoty. Existuje ochranný workflow **Psipedia – D1 canonical inventory (Services, Help, Events)** a `scripts/production-editorial-cleanup-readiness.mjs`; opätovne ich využiť. Pred krokom 2 treba zhromaždiť:

- Počet podľa kanonickej tabuľky, kategórie, `type`, stavu, publikovania a Notion mapovania; vyhodnotiť chýbajúce/osirelé/duplicitné väzby.
- Zoznam aktívnych čítačov/zapisovačov legacy polí (vrátane explicitných importov a cron/automatizácií), rozdeliť na **zdroj údajov**, **technický JSON**, **snapshot** a **nepoužívaný import**.
- Pri každom verejnom/editačnom poli určiť SQL vlastníka, Notion názov, Admin pole, partner allowlist, prázdny/NULL význam a pravidlá zamknutia.
- Porovnať reálne Admin/D1/verejné hodnoty aj Notion v oboch smeroch na reprezentatívnych existujúcich záznamoch; najmä publikované/archivované, odkontrolované, s partnerom, s médiami a starými kategóriami.
- Stav nasadených D1 migrácií, záloha/recovery bookmark, read-only preflight a pripravený rollback. Súbežné PR #1437, #1461, #1462 a #1448 nesmú zaviesť kolíziu migrácií ani prepis pravidiel Help.

## Plán zostávajúcich krokov v TOM ISTOM PR

- **2/6 – SQL gap-fill:** iba chýbajúce polia/vzťahy, podľa overenej parity a schémy; žiadne kópie kanonických tabuliek.
- **3/6 – idempotentný backfill:** presný deterministický import len chýbajúcich hodnôt, validácia ID/slug, NULL vs zámerne prázdne, zachovať PII.
- **4/6 – jednotné read/write cesty:** Admin, Notion, partner aj verejný web používajú ten istý SQL zdroj; regresné testy lifecycle, oprávnení a LWW/zámkov.
- **5/6 – odstránenie overených legacy runtime fallbackov:** bez odstránenia technických JSON stĺpcov a bez automatického DROP/DELETE.
- **6/6 – jeden chránený production workflow:** backup, dry-run, fail-closed assertions, kontrolovaný cutover, postflight a jasný rollback. Nevykonať produktívny prechod len na základe merge bez splnených brán.

## Bezpečnostné invarianty

- Jeden aktuálny zdroj každého editovateľného poľa v D1; žiadne oživovanie historického JSON.
- `missing` / `NULL` / `''` / `[]` majú explicitnú a testovanú sémantiku.
- Žiadne automatické prepisovanie novších zmien starším Notion snapshotom; stav Odkontrolované sa musí rešpektovať.
- Existujúce ID, slug, publikovanie, obrázky, kontakty, ochrana PII a väzby sa zachovajú.
- Žiadne automatické mazanie JSON/legacy obsahu, kým kompletná field-level parita a rollback nie sú potvrdené.
- Auditné reporty nesmú exportovať PII ani obsah zdrojových profilov.
- Tento krok nepridáva SQL migráciu, nezapína feature flag a neaktivuje produkčný write/cutover.

## Stav výsledku

**1/6: vykonaný audit existujúcej kódovej architektúry a založený kontrakt rozsahu.**  
**Stále chýba:** živé produkčné potvrdenie a terénna kontrola všetkých editovateľných polí; tie sú explicitné blokátory krokov 2–6, nie niečo, čo možno nahradiť tvrdením „všetko je v SQL“.

Podklady: `docs/audits/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-1.md`, `docs/audits/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-3.md`, `docs/audits/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-4.md`, `docs/adoption-migration-safety.md`, `docs/adoption-public-cutover-runbook.md`, aktuálny zdrojový kód uvedený vyššie.
