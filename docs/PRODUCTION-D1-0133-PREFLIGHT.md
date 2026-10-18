# SERVICES V3 — D1 0133 production gate (owner-controlled)

Status: **Draft PR / NO production APPLY**. This PR makes the **unchanged**, additive
`drizzle/0133_services_canonical_admin_foundation.sql` selectable in the existing
**manual-only** `Production D1 Migrate` GitHub Actions workflow. It does not execute
the migration, deploy an application, update Notion or enable any Services API writes.

## Exact contract and safety
- Migration source is already merged in #877. The SQL creates three **empty**
  tables (`service_catalog_admin_options`, `service_profile_option_choices`,
  `service_profile_property_values`) and three supporting indexes.
- SHA256 of the exact SQL bytes is **`656fcd963394076bfd5a7829e71b52a3bb83427e38a16f275e63af21b0f6eaef`**.
  Other SQL bytes, wrong production D1 identity or missing history **fail closed**.
- Existing 0132 Facebook owner-consent migration must already be recorded and
  is never rerun. Preflight demands `0132_facebook_image_direct_consent.sql`
  as the latest applied migration; duplicate 0133 is rejected.
- Preflight checks the existing D1 schema and rejects even **one** manually
  added 0133 table/index. The workflow verifies new index signatures and
  critical CHECK, PK, FK and default constraints after applying 0133.
- Existing preflight creates the D1 **Time Travel recovery bookmark**, takes
  preservation snapshots and rechecks ledger/schema immediately before APPLY.
  Postflight verifies exact migration history, schema, unchanged canonical
  profile/member data, and all three new tables empty on first application.
- Main-only exact checkout with SHA verification, GitHub protected
  `production` environment, scoped canonical Cloudflare D1 credential,
  one-at-a-time concurrency and `APPLY-0133-psipedia-sk-db` owner confirmation.
  After APPLY, existing public-route and desktop/mobile production smoke
  checks run; logs and reports are preserved as workflow artifacts.

## Owner-controlled sequence
1. Wait for #877 post-merge workflow to conclude **SUCCESS** and review this
   Draft PR's full green CI (migration safety, full clean D1 chain, build,
   GitGuardian and map E2E). No manual SQL execution.
2. Owner separately approves merge of **this rollout gate PR**; the merge
   only enables selection of 0133 in the manual Actions dropdown.
3. Confirm production is still on 0132 and that no other migration has been
   applied. The protected workflow repeats this check and refuses surprises.
4. **Separate explicit owner approval for production mutation required.**
   In GitHub Actions → `Production D1 Migrate` → `Run workflow`:
   choose branch `main`, target
   `0133_services_canonical_admin_foundation.sql`, and confirmation
   `APPLY-0133-psipedia-sk-db`. Start exactly one run.
5. Wait for **completed SUCCESS** and confirm postflight `0133` verification
   plus empty tables and public smoke. Do not use an initial `queued` or
   `in_progress` status as proof of success.
6. Only after acceptance, continue Services V3 phase 3 (approved Admin
   editor visuals) and phase 4 (Notion mirror).
   `SERVICE_CATALOG_ADMIN_WRITES_ENABLED` and
   `SERVICE_CATALOG_NOTION_MIRROR_READY` remain **OFF** until separate
   owner approval after real two-way mirror safeguards exist.

## Explicitly out of scope
- No changes to the SQL, existing 0132 approval, Notion records, Facebook
  posts, public hero, filters, map, Gemini automations, or runtime editors.
- No direct production D1 access or writes in this PR; no extra schema
  migration file, paid Gemini calls or automatic Cloudflare flag changes.
- If preflight, postflight or smoke fails, **STOP**. Review logs and
  Time Travel bookmark; do not bypass guards or rerun the APPLY blindly.
