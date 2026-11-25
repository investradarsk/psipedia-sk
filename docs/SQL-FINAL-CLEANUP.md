# SQL Final Cleanup — PR #1600

Base inspected: `f95b2c26495f9d0a8fe39bee6e97411484fee635`. Scope: remove obsolete physical JSON dependencies, not legitimate canonical JSON documents or JSON API transport. No production mutation, deployment or merge in this PR without separate owner approval.

## Owner decision (2026-11-25)

Current canonical D1 SQL values win, including intentional empty values. Do not compare, recover, copy, or backfill retired JSON. Do not mark historical migration receipts verified merely to make them appear complete. The previous parity requirements for preserving retired data are superseded; functional and schema integrity gates remain mandatory.

## Physical storage inventory

| Table and retired column(s) | Authoritative owner |
| --- | --- |
| directory_profiles.source_data_json (already absent in production) | SQL contacts, public facts, categories, review state, media and dedicated relations |
| directory_profiles.services_json | directory_profile_service_texts; catalog Services V3 remains separate |
| directory_profiles.qualifications_json | directory_profile_qualifications |
| directory_profiles.seo_json | directory_profile_seo |
| directory_profiles.thumbnail_display_json / detail_display_json | directory_profile_image_display_settings |
| managed_breeds.fci_standard_json / editorial_json / seo_json / related_breeds_json (already absent in production) | breed_fci_standard, breed_editorial_text, scalar SEO columns, breed_related_breeds |
| managed_articles.sections_json | blocks_json, the canonical article document; historical sections accepted only as explicit import payloads |

Projection aliases such as AS services_json are SQL-generated transport shapes, not physical reads. Independently canonical JSON documents (including breed list arrays, article blocks and sources, image settings and SEO documents in other entity tables where there is no replacement, organization metadata, moderation and synchronization payloads) are not drop candidates merely because of their names.

## Implemented runtime changes

- Directory public location and breeding-station landings, Admin filtering, Notion bulk readers, sitemap, related profiles, portal search and canonical list reads use relational owners.
- Directory shared create/update, Notion field-sync, partner creation/editing/approval/drafts, automation draft creation and reviewed changes write relational lists and presentation data. Partner and automation list writes use same-batch revision/actor guards.
- Directory image repair writes the image and relational settings in one batch. Search uses current relational service/qualification text rather than stale persisted text.
- Removed unreachable legacy bulk directory import writer; production import remains disabled as before.
- Breed store, identity resolution, selectors, audit and Notion direct/controlled writes use SQL primary unconditionally. FCI import uses canonical relational FCI/editorial values; production remains preview-only and local fixture import is still restricted.
- Article detail/editor, QA remediation and SEO audit read canonical blocks; writes and imports no longer write sections_json. Import can convert explicit legacy-format input to blocks, never read retired stored sections as a fallback.

## Validation gate (step 3; not yet passed)

- Reconcile with current main, including overlapping PR #1597.
- Update old test fixtures and assertions to canonical schema. Run formatting, typecheck, required CI, regression and isolated D1 tests with each retired physical column absent. Verify create/edit/publish, explicit clear, search, sitemap, partner authorization/revision guards and bidirectional Notion synchronization.
- Verify no active SQL statement references retired columns. Indexed GitHub code search is bounded and not a substitute for a complete checkout and runtime test. Historical migration and diagnostic scripts must not run automatically or restore old JSON.
- Existing SQL data is authoritative. No additional production JSON parity queries are required.
- No full build, CI or browser regression suite was executed during the connector-only implementation. Existing fixtures may still assume the historical schema.

## Rollout / physical removal

1. After step 3 passes, owner approves merge and deployment. Verify production application with the compatible revision before dropping any columns.
2. Confirm current schema using a D1-compatible read-only sqlite_schema query, and record recovery point. No legacy value comparison or restoration.
3. Owner separately approves the targeted physical drop. Do not drop independently canonical documents. Do not edit historical migrations or regenerate snapshots/journal.
4. Verify post-drop runtime, foreign keys, integrity, permissions and sync. Rollback must be a schema-compatible revision; an old binary that requires retired fields is not a safe rollback. If schema recovery is necessary, preserve intervening canonical writes.

Status: implementation expanded; regression gate pending. Keep the PR in draft until the gate passes.

## Follow-up after #1600 and #1599 (2026-11-25)

The owner supplied production D1 table and sqlite_schema outputs: all six targeted columns remain, and no returned index, view or trigger depends on them. Cloudflare Deployments showed both PRs Ready and #1599 active at 100% traffic. Available completed PR checks succeeded; skipped checks and prior CI do not prove the six-column post-drop schema. The follow-up aligns live ORM declarations, removes retired columns from the internal discovery fixture, exercises all six physical drops together in isolated SQLite with real Directory SQL projections and Admin filtering, and runs article CAS regression with sections_json physically absent. Full runtime coverage and CI remain pending until verified. No production D1 mutations or migration receipts are made by this follow-up. Owner approval, recovery bookmark and post-deploy checks remain prerequisites for the targeted production DROP.
