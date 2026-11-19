# Directory – SQL/Notion scalars: remove historical JSON duplicates

Date: 19 November 2026. Scope: public Directory profiles, all primary categories.

## Owner-approved goal

Once the same field has a direct D1 SQL column and Notion sync mapping,
remove its old top-level property from directory_profiles.source_data_json.
D1 SQL stays canonical; Notion is an editor. Do NOT drop the JSON column
while live public facts, filters, review locks, media, multi-category
membership and relationship metadata still use it.

## Confirmed mappings (12 fields)

| Notion / historic JSON key | SQL column |
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

The mapping is grounded in the existing Directory Notion encoder/decoder,
the scalar patch writer and the canonical SQL schema. The existence of a
mapping does not itself prove live Notion field parity; the cleanup does
not modify SQL or Notion values.

## Removal rules

A JSON property is removed only if:
- Its exact, allowlisted top-level key is present.
- Its corresponding SQL value is non-NULL and nonblank after trimming.
- The profile is draft or published, not archived or owner-reviewed;
  no pending review unlock and no D1 tombstone exists.

This is conservative for pre-0170 SQL fields: SQL empty string could
mean old missing data rather than an explicit clear. Such cases remain
in source_data_json and are reported as unconfirmed.

The public Directory still has a historical JSON fallback for Okres
when district is empty. Delete Okres only when district is nonempty,
so public display and geographic filters remain stable. Do not delete
breed/club relationship labels, category-specific facts, Services V3
choices or select filters.

One UPDATE per column, each with the full guarded predicate. Only
source_data_json changes, never name, excerpt, description, region,
address or other SQL values, timestamps, Notion mapping, Services V3,
SEO or image metadata. No schema migration or generic replay.

## Owner-approved rollout

1. Merge only after green offline tests, Playwright and Admin regression.
2. GitHub Actions: production-directory-sql-notion-scalar-cleanup.yml,
   branch main, mode=audit and exact confirmation:
   AUDIT-DIRECTORY-SQL-SCALARS-psipedia-sk-db
3. Review the private report.json counts grouped by category:
   before.candidates.totals.removable, unconfirmed, protected.
4. After approval run mode=apply and exact confirmation:
   APPLY-DIRECTORY-SQL-SCALARS-psipedia-sk-db
5. Prior to any write, create a D1 time-travel recovery bookmark (not a
   separately exported backup). Required postflight:
   invariantsPassed=true, all 12 after.candidates.totals.removable=0,
   stable record counts, identifiers, latest updated_at and SQL aggregates;
   unchanged unconfirmed and protected groups; JSON size not increased.
   Apply is idempotent.

PR CI never connects to production D1. Merge alone does not write data.

## Not in this change

- Fixing unresolved empty SQL scalar fields.
- Public fact, secondary category, faceted filter, Services V3 or
  qualification read/write cutover.
- Moving review locks, image or SEO technical metadata.
- Dropping JSON columns in a destructive schema operation.
