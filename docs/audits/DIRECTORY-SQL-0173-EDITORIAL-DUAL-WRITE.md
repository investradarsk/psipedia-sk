# Directory SQL 0173 — first Admin/Notion relational writes

The new six-table schema is physically installed (GitHub Action #44604743812,
POSTFLIGHT installed=true).

This PR activates a **transitional, atomic dual-write** for two explicitly edited
fields on the common `updateManagedDirectoryProfile` path:
- `qualifications` → `directory_profile_qualifications` ordered rows.
- `seo` → `directory_profile_seo` typed columns, including explicit empty text
  and `noindex=false`.

New profiles created by `createManagedDirectoryProfile` also store these two
types in the same D1 batch as their canonical row. Both Admin and inbound Notion
call the common update function; the explicit field guard avoids accidental
deletion for omitted values. The profile mutation and companion statements
share one D1 transaction. Stale updates cannot write 0173 rows without the
matching new canonical timestamp and actor.

**No JSON is deleted here. No SQL read cutover is asserted.**
Until the coordinated reader switch, existing `qualifications_json` and
`seo_json` remain active for public/Admin/Notion reads. The new SQL is a
verified shadow of writes through the central editor path, not a complete
migration of historical data. Other writer paths (partner self-service,
imports, category-specific writers, automation) must be inventoried before
removing JSON. These two new tables are not yet the only write authority.

The other four 0173 tables remain schema-only pending their own
source/field mapping and safety checks: opening hours, gallery, review lock,
and quality resolutions. In particular, **the old reviewed lock continues to
gate Notion**; it is not safe to switch it to an initially empty SQL table.

Tests cover ordered/duplicate qualifications, explicit clears, empty SEO,
noindex toggling, concurrency guards, unchanged legacy JSON, creation
identity and same-batch editorial writes.
