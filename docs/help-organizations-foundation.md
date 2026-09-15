# Help organizations foundation

`help_organizations` is the canonical identity and public-profile foundation for shelters, civic associations, rescue organizations, municipal organizations and other dog-help organizations.

## Compatibility boundary

- `help_cases` remains unchanged and continues to serve the existing Help flows.
- `adoption_dogs.organization_id` remains nullable and does not yet have a physical foreign key.
- `adoption_dogs.organization_name` and `adoption_dogs.organization_slug` remain historical/display snapshots.
- `directory_profiles` remains unchanged. A canonical organization can optionally link to one directory profile through `directory_profile_id`; deleting that directory profile sets the link to `NULL`.
- The migration creates no rows and performs no backfill, update or deletion.

Adding the adoption foreign key now would require rebuilding the existing SQLite table. It could also reject current non-null IDs before they are reconciled with canonical organization IDs. The application must therefore treat `organization_id` as a transitional soft reference until Phase 1B completes.

## Phase 1B gate

Before enforcing `adoption_dogs.organization_id -> help_organizations.id`:

1. Stage the reviewed organization dataset outside production and classify every row as new, exact match, possible duplicate or conflict against both `help_cases` organization profiles and relevant `directory_profiles`.
2. Insert only approved canonical organizations idempotently by `import_key` and stable `slug`; preserve source provenance and do not publish by default.
3. Produce a reviewed mapping from legacy `help_cases.id`, `directory_profiles.id` and adoption snapshot identity to `help_organizations.id`.
4. Backfill only unambiguous `adoption_dogs.organization_id` values. Keep snapshot name and slug fields unchanged.
5. Verify that every non-null adoption organization ID resolves and that all public/admin adoption and Help routes pass.
6. In a separate migration, rebuild `adoption_dogs` with the physical foreign key using `ON DELETE SET NULL`, preserving all columns, indexes and rows; abort on count or integrity mismatch.

Links from collections, foster-care requests, volunteering/material-help records and lost/found records should be added only when their dedicated canonical models exist. Claim and public-submission workflows are separate phases and should reference the canonical organization ID rather than duplicating organization identity.
