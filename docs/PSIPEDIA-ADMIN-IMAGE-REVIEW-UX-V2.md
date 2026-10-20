# Image Review UX V2 — implementation notes / migration gate

Scope: Image tab of /admin/kvalita only. Admin Visual System V3 preserved; no changes to profile text reviewing, Facebook Images, Unified Editors or Notion sync.

## BLOCKED: durable rejection reason and decision history
There is no dedicated per-image-decision audit table. admin_entity_reviews stores only a last-reviewed marker; media_source_monitors.last_error is reserved for rejected URLs and errors. The migration chain has advanced: 0134_services_admin_change_audit.sql and 0135_facebook_image_safe_retry.sql are already present on main. Image Review does not claim either migration number. Allocate and verify the next contiguous slot against current main immediately before any database implementation. No reason field is exposed, no false persistence claimed, no migration applied.

Technical Control Center must first allocate the next contiguous D1 migration slot and review a proposed media_source_review_decisions table: id, monitor_id, entity_type, entity_id, candidate_image_key, candidate_image_url, candidate_content_hash, action, optional reason (0–500 characters), actor_ref, decision_time, outcome. Record per-item bulk reason with server validation and authenticated history read, protect against candidate changes via atomic compare-and-swap, and coordinate D1/R2/Notion reconciliation. Only then activate reason input and history. Migration intentionally not shipped until #897's numbering is resolved.

## Scope and residual concurrency risk
This PR introduces optional candidate-key preflight matching for single and bulk decisions; existing calls without the key are backward compatible. Matching protects against a stale candidate at time of service read, but is not a fully atomic CAS across R2/D1/Notion. No public claims of conflict-proof concurrency until separately reviewed.

Tests include isolated Node contracts and an offline React/Chromium fixture with synthetic profiles and mocked endpoints. The focused Playwright suite now passes 27 scenarios across desktop 1440px and mobile 390px/320px, including touch targets, selection, bulk dialogs, candidate comparison, failure and partial success. Real authenticated production acceptance is not claimed. No production writes, deployment, migrations, paid API or Notion PATCH.
