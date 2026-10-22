# SERVICES V3 — Admin-controlled D1 → Notion, one option at a time

Related: issue #917, merged PR #928 (manual Notion API + verified receipt), merged PR #972 (Admin lifecycle + inventory).

## What this change does

Adds an Admin V3 UI for the **existing** gated mirror executor. It does not implement a new writer or turn on production features.

1. Authorized Admin opens `/admin/sluzby-pre-psov/katalog`, chooses one dynamic `DRAFT/PENDING` option, and clicks **Overiť D1 ↔ Notion (iba čítanie)**.
2. The authenticated `GET /api/admin/service-catalog/notion-mirror` independently queries canonical D1 options, Notion catalog pages and append-only receipts. The UI refuses a write unless the snapshot is complete, globally unblocked and the selected option ID/version occurs exactly once.
3. When the verified snapshot says `NEEDS_PAGE`, the UI offers `PROVISION_ONE` **only** when all existing Admin/write/mirror/executor flags plus the separate page-create flag and server Notion token are present. When the snapshot says `MAPPED_PENDING`, only `MIRROR_ONE` is offered. The UI is not a source of authority; the backend checks again.
4. A new modal requires typing the entire per-option confirmation string. A single POST is sent to the pre-existing Admin API. Strict same-origin mutation guard, bounded payload, server-selected target, pinned Notion catalog, durable cross-worker D1 lease and exact-version receipt checks stay server-side.
5. Success is reported only for a verified server response: provisioned/existing page is **not yet synced**, and `VERIFIED` refers to Notion readback + D1 receipt. The UI discards the inventory after **every attempted write**, does not automatically run step 2 and never automatically approves/publishes anything.
6. A `REVIEW`, uncertain `RETRY`, timeout, 409 or other unexpected response is shown as an error. The operator must inspect D1 and Notion before a further action; the client never retries.

Static definitions are never provisioned. A Notion profile's free-text `Služby` field is never touched; there is no Notion → D1 canonical write.

## Release prerequisites — NOT satisfied or changed by this PR

- D1 migrations 0133 and 0134 are already production-applied; do **not** repeat.
- Server-side `NOTION_API_TOKEN` and D1 binding must be present for read-only inventory.
- Verify real production read-only inventory using owner-authenticated Admin GET. The dedicated Notion catalog had 0 rows when independently checked, but production dynamic D1 count is still unknown.
- Verify lock table 0124, Notion data-source permissions, page ownership and staged end-to-end POST/PATCH/GET/receipt proof. In uncertain remote outcomes, keep the lock and escalate operator review; do not blindly retry.
- Only after explicit owner approval, independently configure the existing Cloudflare flags:
  `SERVICE_CATALOG_ADMIN_WRITES_ENABLED`,
  `SERVICE_CATALOG_NOTION_MIRROR_READY`,
  `SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED`,
  and, separately for page provisioning, `SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED`.
  All must be the exact string `true` on the server to enable that operation.
- This PR does **not** add cron, queue, automatic option provisioning, public-facet migration, active/retired Notion lifecycle syncing, or any production writes.
- Frontend functionality is disabled when flags are absent; merging this PR must **not** be described as final Services V3 activation.

## Offline acceptance

`node --experimental-strip-types --test tests/service-catalog-admin-mirror-controls.test.mjs tests/service-catalog-notion-receipt-proof.test.mjs tests/service-catalog-notion-mirror-executor.test.mjs`

Plus scoped mobile Admin visual regression, TypeScript build/lint and normal pull-request CI. Do not merge automatically.
