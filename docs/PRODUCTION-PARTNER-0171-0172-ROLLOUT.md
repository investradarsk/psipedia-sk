# Partner 0171/0172: independent protected production rollout

This is a separate PR from #1437. It installs the prepared database schema
BEFORE the new partner app is deployed. Merge alone does not run the workflow.

The repository is public. Do not upload a production database export to GitHub.
Record a Cloudflare Time Travel bookmark, and keep any separately approved full
export in protected private storage. Time Travel is not an independent export.

1. After green CI, merge only this migration-infrastructure PR.
2. In Actions, manually run Production D1 Partner 0171-0172 (manual) on main.
   Mode audit, confirmation AUDIT-PARTNER-0171-0172-psipedia-sk-db.
   Require schema171=absent and schema172=absent, zero FK, duplicates,
   inactive owners and legacy roles. Any partial schema means STOP.
3. Independently confirm backup/recovery and owner authorization to apply.
4. Mode apply0171, confirmation APPLY-0171-psipedia-sk-db,
   recovery_confirmation TIME-TRAVEL-BOOKMARK-RECORDED.
   Require POSTFLIGHT and schema171=installed.
5. Run audit again; only then choose apply0172 with confirmation
   APPLY-0172-psipedia-sk-db and the same recovery confirmation.
   Require POSTFLIGHT and schema172=installed.
6. Run audit again; both schemas must show installed. Do not manually alter
   d1_migrations or replay other migrations.
7. Rebase or merge latest main into #1437, rerun CI and partner desktop/mobile
   E2E. Deploy Partner only after schema and direct write/Notion checks pass.

The infra PR also makes current Admin membership writes OWNER-only, before D1 trigger 0171 is enabled, so the old MANAGER/EDITOR selectors cannot cause broken live inserts. Test this on deployed main before running APPLY.

The workflow applies only its pinned source file; it never calls the generic
migration replay. Cloudflare database data is never placed in public artifacts.
SQL/Notion conflicts on the same field remain guarded, not silently overwritten.
