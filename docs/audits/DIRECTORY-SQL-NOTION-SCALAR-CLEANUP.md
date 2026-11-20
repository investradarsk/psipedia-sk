# Directory – remove the 12 obsolete Notion/SQL scalar JSON copies

Date: 19 November 2026. Owner explicitly requested that historical JSON
backups of the selected 12 public scalar values be removed even if data is
lost because SQL is currently blank. Do not preserve an old public value
merely because SQL is missing. This is a targeted removal of 12 scalar and 5 contact field groups, not a transfer.

## Exactly which historical JSON keys are deleted

| Top-level JSON / Notion label | Canonical SQL column |
| --- | --- |
| Názov | directory_profiles.name |
| Perex | directory_profiles.excerpt |
| Popis | directory_profiles.description |
| Kraj | directory_profiles.region |
| Okres | directory_profiles.district |
| Mesto | directory_profiles.city |
| Adresa | directory_profiles.address |
| PSČ | directory_profiles.postal_code |
| Ulica | directory_profiles.street |
| Číslo domu | directory_profiles.house_number |
| Formát adresy | directory_profiles.address_format |
| Cena / poznámka | directory_profiles.price_note |

## Previously migrated contacts (also remove all remaining backups)

The previous contact cleanup intentionally left legacy-only contacts when
their SQL owner was empty or the profile was reviewed/archived. The owner
has now explicitly rejected retaining these legacy JSON-only backups too.

| SQL column | Delete all matching top-level JSON aliases |
| --- | --- |
| website_url | Web, Webstránka |
| public_phone | Telefón, Telefon, phone |
| public_email | E-mail, Email, email |
| facebook_url | Facebook |
| instagram_url | Instagram |

Remove these contact aliases for every valid JSON object, even when
SQL is NULL or ''. No profile-state exclusion. This can make old
JSON-only contacts disappear from public pages and Notion outbound
snapshots; it is intentional. No contact SQL values are changed.

For every valid JSON object in every directory profile, including
archived, reviewed, pending-unlock and tombstoned rows, delete each of
these 12 top-level keys when present. This is intentional even when SQL
is NULL or empty, or the historical value is different. SQL is the
only canonical value from now on. The removal **does not** modify SQL.

This is a deliberate behavior change for old district JSON fallbacks:
when SQL district is blank, deleting a historical Okres may make the
district disappear on the public site and in historical filtering.
This matches the owner's instruction not to preserve JSON-only copies.

Malformed JSON and JSON arrays are not rewritten: their bytes remain
unchanged, so an unrelated technical payload is never accidentally
replaced by an empty object. The audit explicitly counts invalid JSON.

## What is not deleted by this operation

- The entire source_data_json column. It still stores *active*, non-backup
  metadata used by review locks, public facts, service filters, media and
  multi-category relations. Removing it now would break those features.
- Technical keys, photos, categories, service choices, qualifications,
  Notion mapping rows, SEO, image settings or any unrelated JSON keys.
- SQL columns, SQL values, updated_at/updated_by or other table rows.

Any later plan to eliminate source_data_json completely needs to move
these active dependencies to canonical SQL first. This PR is the
requested removal of all 12 selected historical field copies, not
an unverified DROP COLUMN operation.

## Workflow

1. Merge after tests and CI finish green.
2. Manually run production-directory-sql-notion-scalar-cleanup.yml on
   main with mode=audit and confirmation:
   AUDIT-DIRECTORY-SQL-SCALARS-psipedia-sk-db
3. Read private report.json with aggregate counts by category:
   removable, withoutSqlValue (removal still occurs), invalidJson.
   There is no row-level data or PII in logs.
4. Manually run mode=apply with confirmation:
   APPLY-DIRECTORY-SQL-SCALARS-psipedia-sk-db
5. Before writing, D1 time-travel bookmark is created. After
   running, invariantsPassed must be true and all 17 removable
   counts must be zero, even if the SQL column is blank.
   SQL length/count aggregates and profile count/IDs stay unchanged;
   invalid JSON count must remain stable.

A PR merge cannot trigger any production write; only a separately
approved GitHub Actions workflow_dispatch can run the cleanup.
