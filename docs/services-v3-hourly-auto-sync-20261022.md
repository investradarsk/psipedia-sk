# SERVICES V3 — opt-in automatic D1 → Notion (hourly, no blind retries)

Context: #917, merged PRs #972 (Admin lifecycle), #980 (manual one-option Notion mirror), #981 and #982 (public/list/map read filtering). This is an ADDITIVE Draft PR, not an activation request.

## What the hourly cron actually does

- Reuses the **existing** hourly branch of Cloudflare Worker `scheduled()`. Does not add another Cron Trigger or interfere with Notion articles or Facebook's per-minute sweep.
- Requires the exact string `true` for **all** of
  `SERVICE_CATALOG_ADMIN_WRITES_ENABLED`,
  `SERVICE_CATALOG_NOTION_MIRROR_READY`,
  `SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED`,
  **and** new `SERVICE_CATALOG_NOTION_AUTO_ENABLED`.
  A valid `NOTION_API_TOKEN`, production D1 0134 and new D1 0139 are required.
- Loads the existing complete-snapshot D1 and Notion catalog inventory, rejecting global identity conflicts or incomplete data.
- Processes **at most one** dynamic DRAFT/PENDING catalog option **per hour**, using the pre-existing owner-checked internal runner. The approved 91 static services and 28 attributes are never created as Notion pages.
- By default only `MAPPED_PENDING` entries (whose Notion page mapping already exists) may be automatically mirrored. Creating new Notion pages requires **both** additional independently approved gates
  `SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED=true` AND
  `SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED=true`.
  The latter is a new flag and stays unset by this PR.
- On a possible creation/write **timeout, worker crash, incomplete readback or identity mismatch**, the operation is **quarantined** and NEVER retried automatically. Manual Admin read-only inventory and human reconciliation are mandatory. Existing D1 durable lease 0124, remote page ownership, exact CAS and verified receipt 0134 remain enforced by the existing executor.
- A permanent primary-key D1 journal `service_catalog_notion_auto_attempts(option_id, option_version, action)` atomically reserves each distinct operation **before** any Notion HTTP call. Re-entry and overlapping cron workers cannot repeat it. `CLAIMED` rows left by crashes stay quarantined.
- A verified `MIRROR_ONE` receipt advances D1 from DRAFT/PENDING to DRAFT/SYNCED, **never ACTIVE**; Admin alone can approve. No automatic publication, profile selection, or Notion → D1 canonical writes.
- The result logs only event, state, ID and a coded reason; no access tokens or Notion HTTP bodies.

## Deployment sequencing — ALL REQUIRES OWNER APPROVAL

1. Merge only after green latest-head CI. This leaves cron functionality inert because both `SERVICE_CATALOG_NOTION_AUTO_*` gates are absent from Wrangler.
2. Verify production schema through read-only query. Do **not** reapply production migrations 0133/0134. Independently verify 0138 status before applying additive **0139** once; migration is not applied by this PR. Validate journal primary key and no-delete/no-rewrite triggers.
3. In authenticated Admin, run **read-only** catalog inventory. Verify actual D1 dynamic option count, Notion target data-source permission, mapping uniqueness and receipt consistency. If blocked or uncertain, DO NOT enable writes.
4. If explicitly authorized, enable the established Admin/Notion flags and verify one **human-initiated** one-option mirror first. This is an operational step, not a GitHub merge permission.
5. Only after independent owner approval enable **`SERVICE_CATALOG_NOTION_AUTO_ENABLED=true`** in Cloudflare. It then considers one mapped pending option hourly. Keep auto page creation **OFF** initially.
6. Optionally approve Notion page auto-creation as a **separate** later decision only after safely validating Notion collection semantics and 0139 quarantine behaviour. Do not automatically retry a failed page creation.
7. For a REVIEW/RETRY/CLAIMED journal record, inspect remote Notion and D1 before manual resolution. Manual sync remains separately gated and human-confirmed. Never delete journal history to force another automatic attempt.

## Offline test

`node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/service-catalog-notion-auto-sweep.test.mjs`

Plus mandatory normal PR CI and clean migration suite. No Cloudflare flags, production D1 mutations or Notion write are performed by this PR.
