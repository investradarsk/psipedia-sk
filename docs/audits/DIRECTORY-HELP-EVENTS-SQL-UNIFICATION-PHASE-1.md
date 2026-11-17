# Psipedia — SQL unification, phase 1 (Services / Help / Events)

This phase covers ONLY the Services directory (all 10 current categories plus
legacy category aliases), e-shops, the five Help agendas and Events.
Breeds, Articles, account/security data, Facebook and Reviews are untouched.
This phase is non-destructive: NO production D1 writes, migrations, field
resets, Notion changes or public/Admin behavior changes.

## Verified code model

| Agenda | Canonical D1 table | Notion mapping |
| --- | --- | --- |
| All Directory categories, including vets, trainers, clubs, breeders, salons and physiotherapy | directory_profiles | directory_notion_sync |
| E-shops | managed_eshops | eshop_notion_sync |
| Events | managed_events | event_notion_sync |
| Help cases | help_cases | notion_agenda_sync, agenda help-cases |
| Shelters and organizations | help_organizations | notion_agenda_sync, agenda organizations |
| Adoptions | adoption_dogs | notion_agenda_sync, agenda adoptions |
| Lost/found | lost_found_dog_reports | notion_agenda_sync, agenda lost-found |

Important: Services V3 uses relation tables for catalog options and selected
profile services. These are NOT duplicate directory databases. Directory
additional categories, filters and image/relationship data may still live in
technical keys of directory_profiles.source_data_json. Deleting this JSON
column now would break active functions. The help_organizations.directory_profile_id
relationship is intentional. Help cases may also contain older category rows
that should be measured before any cleanup.

JSON columns used for galleries or editor structure are not necessarily
legacy sources. A Notion mapping receipt proves only that a linkage exists,
not that current Notion property values equal D1.

## Production evidence — manual, SELECT only

New workflow: "Psipedia – D1 canonical inventory (Services, Help, Events)".
On PR, it runs read-only SQLite fixture tests without any secrets.

After the PR is reviewed and merged, go to GitHub > Actions > that workflow,
select current main, and enter the exact confirmation:

    AUDIT-EDITORIAL-STORAGE-psipedia-sk-db

The protected production job uses the existing Cloudflare token, canonical
D1 ID, a shared migration concurrency lock and a current-main check.
It executes strictly SELECT commands and uploads report.json as an artifact.
There are no names, contact details, profile IDs, raw JSON payloads, provider
tokens or private locations in the report.

The report contains: category/status row counts; counts with Notion mappings;
nonempty/invalid source JSON where present; technical Directory JSON dependency
counts; orphan link counts; Services V3/support table counts; missing table
indicators. If a mapping table is missing, the mapped count is NULL (unknown),
not zero. Missing schema is not treated as a successful empty dataset.

## Follow-up cutover stages

1. Inspect actual production counts, including the existing Directory legacy
   audit, then compare Admin/public/Notion values on real sample records.
2. Classify each displayed field as canonical SQL, technical JSON,
   intentionally structured JSON or legacy duplicate. Identify its exact
   Admin and public read/write path and mapped Notion property.
3. Prepare a separate, reversible, idempotent per-field migration with dry-run,
   backup, explicit-empty semantics and category-specific regression tests.
4. Remove a legacy read fallback only after verifying that no valid published
   record depends on it and Admin/public presentation matches D1.
5. Remove obsolete rows/columns in a separately approved production step
   following backups and successful smoke tests. NEVER on PR merge.

Target invariant: one authoritative D1 value per editable field; Admin and
public read that same value. Sync direction and timing remain a separate
matter and cannot silently revive removed legacy values.
