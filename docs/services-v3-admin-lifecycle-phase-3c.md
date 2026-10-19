# Services V3 — Phase 3C Admin lifecycle (Draft, NOT a rollout)

## Scope
Based on merged #892 contract and #896 owner-approved Variant A editor.
No new catalog, no duplicate lifecycle API, no public search/filter changes,
no redesign, no Notion HTTP writes and **no production migration**.

## Endpoints (Admin-only)
- `PATCH /api/admin/service-catalog/options/{id}` — one resource endpoint for
  `{action:"edit",expectedVersion,name,category,group,meaning}`,
  `{action:"approve",expectedVersion}`, `{action:"retire",expectedVersion}`
  and `{action:"retryMirror",expectedVersion}`.
- `PATCH /api/admin/directory/{id}/service-options` — existing endpoint:
  `choice:"yes"|"no"|"unknown"`. Explicit `unknown` deletes the single
  persisted choice through CAS, without ever creating a `no` row.
- `POST /api/admin/service-catalog/options` — unchanged DRAFT/PENDING create.
- `GET /api/admin/service-catalog/options` — unchanged Admin read.
- Non-binary canonical properties are intentionally still read-only. Tri-state
  static attributes and ACTIVE/SYNCED dynamic attributes use the existing
  `service_profile_option_choices` table and same guarded choice API; never
  infer choices from legacy source data.

All routes require verified Admin identity, same-origin mutation checks,
`SERVICE_CATALOG_ADMIN_WRITES_ENABLED==="true"` and
`SERVICE_CATALOG_NOTION_MIRROR_READY==="true"`, available D1,
**plus 0134 audit-table preflight**. Flags remain OFF in the repository.
Errors: 400 bad payload, 401 unauthenticated, 403 cross-site, 409 stale or invalid
transition, 503 missing schema/gate, 500 unexpected.

## Lifecycle rules
- Only dynamic `svc.admin.*` / `attr.admin.*` options can be modified.
  Built-in IDs and `kind`, `id`, `created_by`, `created_at` are immutable.
- Full-entity edits are limited to non-conflicted DRAFT, preserve normalized
  globally unique identity, and reset a previously SYNCED mirror to PENDING.
  Editing ACTIVE semantics is deliberately blocked pending separate reapproval.
- `DRAFT -> ACTIVE` only after the Notion mirror has been independently
  confirmed `SYNCED`. `DRAFT/ACTIVE -> RETIRED`, terminal retirement.
  Every transition checks version and original status/mirror inside the UPDATE.
- `PENDING -> SYNCED/CONFLICT` and `SYNCED -> CONFLICT` are **internal-only**
  reconciliation outcomes; there is no Admin HTTP endpoint that may claim a
  successful sync. A trusted future reconciliation worker must verify external
  evidence before calling `recordCatalogMirrorOutcome`.
  `CONFLICT -> PENDING` requires explicit Admin `retryMirror`, no direct
  `CONFLICT -> SYNCED`.
- CAS versions increment for modifications, approvals, retirement and mirror
  transitions. A stale writer cannot overwrite newer state; 409 asks Admin to reload.
- A selection reset requires its positive saved version. It is atomic: D1 batch
  writes append-only actor/old-value audit event before CAS DELETE. Missing or
  stale entries never fabricate a `no`.

## Additive migration 0134 — NOT APPLIED
`drizzle/0134_services_admin_change_audit.sql` creates an append-only event table,
plus automatic INSERT/UPDATE audit triggers for canonical options and selections.
Choice DELETE is logged explicitly inside a single transactional D1 batch to
retain the authenticated reset actor. This is required for 3C writers: no audit
table = 503. Existing 0133 migration must not be replayed.

**Operational dependency:** Authorize, apply and verify 0134 in a *separate*
production rollout with read-only preflight and explicit owner approval.
Do not enable either write flag or schedule Notion syncing from this PR.
The ledger is append-only by application convention, not a cryptographic
tamper-proof or immutable external audit service.

## Editor integration
- Existing Services profile select now permits a user explicitly choosing
  Neznáme even after Áno/Nie (enabled only under both existing gates).
  No layout or style changes.
- Existing catalog Edit/Approve/Retire UI stays disabled pending independent
  browser QA, mirror reconciliation and owner permission for editor behavior.
  The guarded API contract is provided for that later wiring; no new visual
  control is created.

## Validation and remaining dependencies
- CI: `node --experimental-strip-types --test tests/service-catalog-contract.test.mjs tests/directory-filter-contract.test.mjs tests/service-catalog-d1-foundation.test.mjs tests/service-catalog-admin-api-contract.test.mjs tests/service-catalog-admin-lifecycle.test.mjs tests/service-catalog-admin-editor.test.mjs`.
- CI checks use in-memory SQLite migrations 0133 and 0134. No production D1 calls.
- Before activation: apply/verify 0134, implement & validate actual D1→Notion
  reconciliation and durable receipt provenance, browser security/keyboard/mobile
  checks under a controlled environment, enable Admin lifecycle UI only after
  review, then independently approve both feature flags.
- Defer enum/multi-select/text_list `service_profile_property_values` editor
  API until its typed value and audit contracts are explicitly approved.
