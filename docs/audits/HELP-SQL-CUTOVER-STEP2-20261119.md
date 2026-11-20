# Pomoc psom – SQL gap-fill, krok 2/6

Stav: **implementované na vetve PR #1463; produkčné D1 nasadenie nie je predmetom tohto kroku.**

## Zistená konkrétna medzera

Migračný súbor `drizzle/0122_entity_image_display_config.sql` už pridáva `thumbnail_display_json` a `detail_display_json` pre:

- `help_cases`
- `help_organizations`
- `adoption_dogs`
- `lost_found_dog_reports`

Admin a verejné store moduly tieto SQL stĺpce používajú. V ich **Drizzle deklaráciách** však osem polí chýbalo. Ide o nesúlad deklarovaného dátového modelu a existujúcej migrácie, nie o dôkaz chýbajúcich produkčných D1 stĺpcov.

**Oprava:** do `db/schema.ts`, `db/help-organization-schema.ts`, `db/adoption-schema.ts`, `db/lost-found-dogs-schema.ts` boli doplnené príslušné nullable text polia. Názvy a nullability presne kopírujú existujúcu migráciu 0122. Nezapisujú sa žiadne údaje.

**Nepridáva sa nový SQL súbor ani žiadne nové číslo migrácie.** Ak sa na niektorom prostredí 0122 fyzicky nespustila, treba to preukázať kontrolou schémy a riešiť výhradne existujúcim bezpečným rollout postupom. Nesmie sa naslepo znova spúšťať alebo vytvárať duplicitné `ALTER TABLE`.

## Nový kontrolný mechanizmus

`lib/help-sql-schema-preflight.mjs` je read-only, fail-closed minimálna kontrola existencie tabuliek a najdôležitejších stĺpcov. Overuje:

1. `help_cases`
2. `help_organizations`
3. `adoption_dogs`
4. `lost_found_dog_reports`
5. `lost_found_dog_private_details`
6. `organization_locations`
7. `notion_agenda_sync`

Volá iba `SELECT name FROM pragma_table_info('...')` nad pevne definovanými názvami. Vráti `ready` alebo `blocked` a mená chýbajúcich stĺpcov, nie údaje používateľov. **Samotný výsledok `ready` nepotvrdzuje paritu hodnôt ani súhlas na vymazanie JSON.**

Testy: `tests/help-sql-schema-preflight.test.mjs`, bežia cez `npm run test:help-sql-schema` a sú zapojené do `npm run test:foundation`.

Testujú ORM parity s 0122, aplikovanie migračnej DDL na prázdne SQLite fixture bez zásahu do existujúcich fotografií, pozitívnu aj negatívnu schémovú kontrolu vrátane chýbajúcej PII tabuľky.

## Hranice kroku 2

- **Kanonické tabuľky sa neduplikujú.**
- **Žiadne `DROP`, `DELETE`, backfill, Notion PATCH, produkčná SQL zmena ani vypnutie legacy fallbacku.**
- `gallery_json`, `source_data_json`, `seo_json` a polia pre orez fotiek zostávajú zachované; o prípadnom odstránení zdvojených *konkrétnych hodnôt* sa rozhodne až podľa field-level parity a aktívnych read/write ciest.
- Historické Help prípady kategórií adopcií/útulkov a Notion mapovania sa nemenia.
- Otvorený PR #1437 a migrácie 0171/0172 partnerského systému sa nekopírujú.
- Produkčná D1 dostupnosť/úplnosť schémy **nebola týmto committom overená**. `inspectHelpSqlSchema` je pripravený na zapojenie do chráneného produkčného workflow v kroku 6; nezamieňať lokálny test s výsledkom na reálnej D1.

## Ďalej 3/6

Preskúmať produkčný inventár, zdroj každého chýbajúceho verejného poľa a identity legacy záznamov, aby sa navrhol **idempotentný prenos len pre preukázateľne chýbajúce hodnoty**, nie plošné prepísanie existujúcej SQL.

Prechod 3/6 nesmie prepisovať novšie Admin/Notion/partner zmeny ani obnoviť historicky vymazané hodnoty.
