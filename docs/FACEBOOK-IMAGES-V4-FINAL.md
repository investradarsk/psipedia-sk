# FACEBOOK IMAGES V4 — publication authority, main STOP, permanent admin deletion

Status: **Draft implementation — NOT deployed**. Scope: existing Facebook image pipeline and Notion source `2d945afe-0c79-467e-b9e6-6b0f62a27a49`. No test Facebook posts or live D1/Notion writes.

## Authorization matrix

| Global D1 publisher | Scheduled item APPROVED | Owner direct consent | Scheduled Cron Meta POST |
| --- | --- | --- | --- |
| OFF | any | any | **NO** |
| ON | NO | any | **NO** |
| ON | YES | NO | YES, once, if due, complete, and no prior attempt |
| ON | YES | YES | YES under ordinary scheduled rule; consent adds no bypass |
| ON | NO | YES | **NO** |

Both authorizations are independent. The main STOP is required for **every** automated publication path; `FACEBOOK_IMAGE_PUBLISH_ENABLED` is a separate technical deployment gate. A draft imported from Notion always starts with neither authorization, even if Notion checkboxes read true. The admin approval route retains its existing authenticated, same-origin mutation requirements. For `mode:"direct"`, it additionally checks authenticated email against the explicit `FACEBOOK_IMAGES_OWNER_EMAIL` setting; absent configuration fails closed. Saving an edit revokes both authorizations. Old existing item grants are never silently converted.

### Direct publication from ChatGPT: NOT YET IMPLEMENTED

V4 persists a **consent record only** (D1 and read-back projection to Notion). It **does not expose** a public direct-publish endpoint or claim that a ChatGPT token is capable of posting. Before implementing a direct-publish entrypoint, authorize a **single specific canonical post ID and content version** using the configured owner's authenticated identity; bind consent to immutable content and an unexpired, single-use nonce (D1 uniqueness) with an audience and action scope. Require authenticated application origin and origin/CSRF controls where applicable, the main STOP, valid content, and an atomic no-retry attempt claim. Reuse the existing `publishPhotoToMeta` transport. Unauthorized Notion properties or textual instructions are not a signature. Route implementations must not accept caller-controlled approval fields. Security review/owner approval is required before this second phase.

## STOP concurrency limitation

The due query AND attempt INSERT each require D1 `settings.enabled=1` **and** `approval_status='APPROVED'`. After a claim the caller reads STOP once more before entering the external Meta request. If stopped before that read, the *unsubmitted* claim is removed, leaving the scheduled post unchanged. A request already entered into Meta's network transport cannot be retracted, even if STOP is switched off while that external request is executing. The attempt remains in the durable one-shot ledger (`SENDING` / `PUBLISHED` / `UNCERTAIN`). Never retry ambiguous Meta outcomes automatically.

## Permanent deletion semantics

The authenticated operator confirms **Natrvalo odstrániť**, which performs a version-checked D1 tombstone mutation (`deleted_at`, `deleted_by`) and removes both permissions. All active list, calendar, and due-queue queries exclude tombstones. There is **no user restore action or restore API method**. The row, canonical Notion page identity, Facebook post ID, R2 media, and attempt ledger intentionally survive to prevent reimport and duplicates and to preserve audit. `SENDING` deletion is rejected; `UNCERTAIN` may be hidden but keeps its attempted external-send state. Deleting in Psipedia does NOT delete an already published item from Facebook.

On the next enabled admin-to-Notion export, the associated page is moved into Notion's trash using `PATCH /pages/{id}` with `in_trash:true`. Notion API trash is **not** physical irreversible erasure, and neither the Notion page nor R2 blob is hard-deleted. Failed Notion archives retain a pending D1 synchronization state for retry; GitHub PR does not write to live Notion.

## Notion mirror and single identity

D1 is canonical. Admin edits export by stable `notion_page_id` or marker `PSIPEDIA_ADMIN_ID:<id>`. Admin export uses a lease and CAS acknowledgment. The Notion import stays idempotent and may update content of importer-owned drafts only; it cannot schedule or approve. Both Notion permission checkboxes are projected from D1; changed Notion checkboxes are overwritten with the canonical values. Import fingerprint ignores unauthoritative checkbox changes, preventing a sync loop. Tombstoned Notion pages are never re-imported and retained canonical IDs prevent new duplicates.

## Rollout gate (separate owner decision required)

1. Run branch CI and review real Playwright PNG screenshots at **1440, 390, and 320 px**. The approved V3 layout must remain unchanged.
2. Inspect migration safety, test failures, and compatibility of all D1 structures. The new additive migration **0132_facebook_image_direct_consent.sql** is **prepared, not applied**. Existing 0128, 0130, and 0131 remain unchanged. Verify separately which migrations have already been applied in production; never assume from repository presence.
3. Provision the Notion database checkbox with the **exact** name `Súhlas majiteľa – priame publikovanie` (type checkbox), and verify `Povoliť publikovanie` remains a checkbox. Do not modify Notion production in the PR.
4. Explicitly configure `FACEBOOK_IMAGES_OWNER_EMAIL` to the verified owner's email in the production environment (never hard-code identity or expose the value). Until it is configured, direct consent cannot be granted.
5. After explicit approval, coordinate 0132 D1 APPLY first, Notion schema readiness, and an isolated deploy. Use read-only production checks for migration presence and preserve all published records.
6. Perform a separate, explicitly approved activation acceptance on production with read-only verifications and **without any test Meta publication**. Keep the main STOP OFF until the owner chooses to enable it.
7. Do not implement automatic direct publication from ChatGPT without a subsequent reviewed authorization integration.

Recommended validation commands on PR checkout:

```bash
npm ci
npm run db:check-migrations
npm run test:facebook-publisher
npm run test:facebook-admin-v2
npm run test:notion-facebook-images
npm run test:facebook-images-ui
npm run build
npm run lint
```

All publication tests must use local SQLite fixtures and a simulated Meta fetcher; all Notion tests must mock provider requests. No production credential or live network publish is needed.
