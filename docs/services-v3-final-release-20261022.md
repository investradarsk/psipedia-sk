# SERVICES V3 — final owner-approved release on production Worker

The owner requested on 2026-10-22 that the remaining Services V3 functions be turned ON (existing Admin/manual catalog actions and D1 schema were already enabled and verified). This PR sets the last three **non-secret** Wrangler feature flags only; it does not deploy, merge, dispatch a workflow, write D1, publish any catalog option, or create a Notion page.

## Exact flags after release

- `SERVICE_CATALOG_ADMIN_WRITES_ENABLED=true` — Admin D1 edits
- `SERVICE_CATALOG_NOTION_MIRROR_READY=true` — catalog mirror lifecycle gate
- `SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED=true` — manually verified write
- `SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED=true` — manual page provision
- `SERVICE_CATALOG_NOTION_AUTO_ENABLED=true` — **newly activated** hourly Notion sweep
- `SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED=true` — **newly activated** guarded auto page creation
- `SERVICE_CATALOG_PUBLIC_FILTERS_ENABLED=true` — **newly activated** canonical `svc` filters in public list and map

The Notion token remains a Cloudflare secret and is **never** committed. The Notion integration is connected to `Katalóg služieb V3` (source `8785fd64-36c3-4acf-aade-ad99c30ad45d`); live permission to create/update is **not yet proven through a real Notion write**. A successful zero-row inventory proves read access only.

## Operational safety/behavior

- The 119 preapproved built-in catalog items are **never mirrored** and do not create Notion pages. The actual dynamic catalog inventory was zero before this release. The hourly sweep therefore should report `IDLE` until a real dynamic Admin-created option exists.
- One eligible dynamic DRAFT/PENDING option per hour at most. `PROVISION_ONE` creates a Notion page, and a subsequent later run can `MIRROR_ONE` and record the verified D1 receipt. Approval to ACTIVE remains **human-only**.
- D1 0139 journal must exist. Each distinct (option_id, version, action) is claimed before calling Notion. Uncertain/failed outcomes remain `CLAIMED` or are quarantined; never blindly retried. Admin must investigate D1/Notion first.
- The public directory and map honor `svc` only when an explicitly eligible service choice was saved with `yes` for a published profile. Missing `yes` is unknown, not `no`. Ordinary browsing without a selected `svc` filter is unchanged. Dropdown entries are sourced from real published profile choices only.
- For the first real dynamic option, create it in Psipedia Admin only. Verify the read-only Notion inventory after hourly sweep and check that an accurate page appeared. If the write fails, never spam manual retry, create a duplicate Notion row or remove a 0139 journal entry. Report the failure code and reconcile.
- Do not fabricate a production test option; the new page create path is verified by CI fixtures but awaits the first genuine missing catalog item.

## After owner merges and deploys updated main

1. Confirm Cloudflare's **active production deployment** reflects this PR and lists all seven flags above, all set to `true`. GitHub merge is NOT proof of Cloudflare deployment.
2. Admin `/admin/sluzby-pre-psov/katalog` → **Overiť D1 ↔ Notion (iba čítanie)** must report no conflicts. The live count of dynamic options might remain zero (expected).
3. Open public service category page desktop/mobile, search list and map; verify existing pages still load, with canonical service options shown only for actual positive choices. Before making claims about public filters, verify at least one matching published profile exists in D1; absence of an option for categories with zero YES is expected.
4. Check the next **existing** hourly Cloudflare Worker scheduled log `services_v3_notion_auto` for state `IDLE`, or `BLOCKED`/error that must be fixed. Do not create a new trigger.
5. When a real new dynamic option is needed, let the hourly sync process it; inspect result and Notion receipt, then manually approve the option. If the Notion writer fails despite read access, immediately revert only the two AUTO flags to `false` in a small PR/deployment; preserve manual gates and public YES filters.
6. Keep D1 canonical; never create options in Notion expecting them to materialize as IDs in Psipedia.

## Tests

`node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/service-catalog-notion-auto-sweep.test.mjs`
`node --experimental-strip-types --test tests/service-catalog-public-filter.test.mjs`
`node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/service-catalog-map-canonical-filter.test.mjs`
`node --experimental-strip-types --test tests/config-contract.test.mjs`
`npm run config:check`

This is a production feature-toggle PR: **Draft until latest head has green CI; never merge or deploy without the owner action.**
