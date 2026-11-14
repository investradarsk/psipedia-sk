# Psipedia — protected D1 analytics 0167 / 0168

The analytics code from merged PR #1367 is present in main, but **the two production
migrations do not run on merge**. Collection is also disabled until
SITE_ANALYTICS_ENABLED is explicitly set to true in the deployed Worker.

## What each migration creates

- **0167_content_analytics_profile_views.sql**: qualified directory profile view
  rollups, a public content-views SQL view and two indexes. The existing article
  read counters and their history remain untouched. The separate qualified
  profile/article system still has its preexisting consent and cooldown rules.
- **0168_sitewide_first_party_analytics.sql**: exactly two aggregate tables for
  counts per hour and public pathname; no session or visitor records.

Both files remain UNACTIVATED in the normal sequential migration registry.
The protected one-off runner does **not** modify d1_migrations or apply unrelated
migrations (0158–0166). An audit or one-off application must not be interpreted as
a reconciled normal migration ledger entry.

## Owner procedure — no writes until an explicit Apply dispatch

Use GitHub Actions → **Production D1 Analytics 0167 / 0168 (manual)**, on **main**.

1. Select **target = 0167**, **mode = audit**, enter
   AUDIT-0167-psipedia-sk-db. Read the receipt. Confirm prerequisite tables,
   ledger, and 0167 schema state. Audit never creates tables.
2. Select **target = 0168**, **mode = audit**, enter
   AUDIT-0168-psipedia-sk-db. Check the separate sitewide schema state.
3. Confirm Cloudflare D1 backup / Time Travel and that the 0167 dependencies
   are present. If either audit reports a missing dependency, unexpected DDL,
   partial install, or ledger mismatch, **stop**. Do not use the generic
   migration command or attempt to fix the schema by blind retries.
4. If 0167 is uninstalled and its preflight is clean, explicitly run
   **target = 0167**, **mode = apply**, confirmation
   APPLY-0167-psipedia-sk-db. Review a POSTFLIGHT receipt, or stop on failure.
5. Independently, if 0168 is uninstalled and its preflight is clean, explicitly
   run **target = 0168**, **mode = apply**, confirmation
   APPLY-0168-psipedia-sk-db. Review its POSTFLIGHT receipt.
6. Save the protected workflow artifacts containing schema-only status and
   D1 recovery bookmarks. Both targets can report ALREADY_INSTALLED and safely
   avoid repeating DDL if the exact pinned schemas are present. The workflow
   cannot and must not attempt to repair a partially applied schema.

Each invocation runs only one **SHA-pinned** SQL file using an isolated config
without migrations_dir. The protected workflow checks the canonical database,
same current main SHA, operator confirmation, original D1 migration ledger,
schema dependencies, and pre-apply Time Travel bookmark. It verifies exact DDL
and unchanged source/ledger after the operation.

## Separately activate the counter — only after the migrations

The root layout, endpoint, and admin report all require
SITE_ANALYTICS_ENABLED=true in the **deployed** Cloudflare Worker. The current
absence of the flag means **off**. Change this setting through a separately
reviewed Cloudflare configuration deployment after schema verification.
Do not set the flag true in the migration PR.

When enabled, verify /admin/nastavenia/statistiky:
- Open a public page once, reload it, and navigate to another public page.
  Aggregated pageviews should increase; the top-page listing should update.
- Verify 24 hours, 7 days, 30 days and all-time aggregation without claiming
  visitor counts, unique devices or sessions.
- Verify both accepted and declined analytics-cookie choices; this new
  sitewide tally uses only the pathname and does not require cookies.
- Check Cloudflare D1 usage and write budget. A valid pageview updates two
  aggregate rows. Historic sitewide counts **cannot** be backfilled.

The 0167 qualified counters remain separate. Do not erase article history or
silently reinterpret their qualified counts as ordinary pageviews.

## If a protected job fails

Review its FAILED receipt and recovery bookmark. Never blindly re-run Apply on a
partially installed schema. Do not run arbitrary SQL against production. The
canonical ledger remains unchanged by this isolated workflow, so future
sequential reconciliation needs its own verified, owner-approved procedure.
