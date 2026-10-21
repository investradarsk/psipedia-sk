# Gemini 22 — safe canonical save and manual-publication handoff (#925)

**Implementation scope:** complete for the existing, human-reviewed canonical editor
workflow; exact-HEAD CI and production smoke are separate gates. This PR does
**not** implement automatic publication when a reviewer clicks Save, nor does it
assert atomic transactions across Notion and D1.

## Before and after

Before #925, some review actions in Notion made a draft look "published" without
checking a public canonical D1 record. A reviewer's Notion save could also fail
on an unchanged agenda form or cause a duplicate/racing canonical import.
The original Gemini generation and Notion concept-creation features already
worked and are **not replaced** by this PR.

After #925 the workflow is:

1. Gemini creates a source-evidenced **private** Notion concept. Its callback
   registers signed immutable provenance in `gemini_notion_created_pages`.
2. The admin reviews the Notion concept and chooses **Uložiť koncept**.
   The existing one-page Directory or Events/Help synchronizer attempts to
   create or reconcile **one private D1 draft**, with exact Notion revision,
   duplicate detection and shared D1 locks. An unchanged form can explicitly
   request the import without an unnecessary empty Notion PATCH.
3. Only a **verified mapping plus live canonical D1 row** authorizes the
   native-editor link. A confirmed private import leaves the review modal open
   and locks the old Notion-only form against a second stale write.
4. The reviewer opens the **existing canonical D1 editor** and separately
   performs its normal validation and manual Publish action. The old
   `/notion-drafts/[id]/publish` route is a guarded **handoff**, not a
   publication mutation; it returns `published: false`.
5. The existing bidirectional profile synchronizer mirrors eligible native D1
   changes, including publication fields, to the same mapped Notion page. It
   verifies the Notion editorial echo before updating sync baselines.
   Concurrent edits and ambiguous acknowledgements fail closed.
6. The Gemini active queue determines `PUBLISHED` by reading the **real D1
   entity status** through the verified mapping; Notion's text label by itself
   never proves publication. Published concepts remain accessible in history.

## Identity, moderation and failure rules

- Ten Directory and twelve Events/Help category routes use the existing
  taxonomies and native editors. No new D1 ID is inferred from a Notion title,
  slug, creator label or unsupervised "published" state.
- The one-page importer never bootstraps unrelated Directory profiles. On
  existing/racing mappings, a changed revision, disabled sync, uncertain write,
  missing D1 entity or conflicting identity, it returns `NEEDS_REVIEW`
  instead of success; no blind second creation is permitted.
- Notion approval, decline and canonical D1 publication remain different
  actions. The canonical editor owns visibility, moderation and protected
  publication fields.
- Help / adoption / lost-found adapters retain their specific status, public
  contact and precise-location protections. Ambiguous Notion/DB updates cannot
  silently leak protected coordinates or overwrite newer editor changes.
- Both Directory and Events/Help mirror paths require echoed editorial
  content before advancing the acknowledged mapping hash; D1+Notion cannot be
  made atomic by any Notion REST API trick.
- In case of a retained import lock, inspect Notion, the canonical D1 record,
  the mapping and the signed provenance before any manual recovery. Never
  release a potentially ambiguous lock merely to retry.

## Evidence and acceptance limits

Existing focused tests and the #925 additions exercise actual save/import
coordinators and canonical synchronization functions with **mocked D1/Notion
transport**. They cover all 22 routes, private-draft creation, D1 mapping
verification, saved-revision races, existing and duplicate identities, lock
contention, unchanged Save, native-editor handoff, desktop/mobile real React
forms, D1-status-driven queue cleanup, Directory D1 publication push, protected
Events/Help status merging and Notion writeback-echo-before-mapping ordering.

**Only CI on the final exact commit** is evidence of the branch's offline
acceptance. A green CI result is **not** evidence that actual production Notion
permissions, every existing record's schema, R2/media processing or live
Cloudflare D1→Notion writeback are functioning. Full rich-text/media/SEO
roundtrip remains subject to the existing adapters and schema; fields absent
from the Notion schema are intentionally shown as unavailable in the editor,
not silently discarded.

### Controlled production acceptance, after the owner approves rollout

Use one ordinary, non-sensitive test concept per representative agenda
(Directory, Events, Organizations, Adoption, Help Case, Lost/Found). For each:
check Save → private D1 ID → native manual Publish → real canonical D1 status →
existing scheduled Notion mirror → refresh Gemini active/history lists; verify
media/SEO and privacy-sensitive fields where relevant. Investigate any mirror
conflict/uncertain-lock condition, do not auto-retry a possibly completed write.
This is **not authorized** as part of #925 implementation.

## Release boundary

No production D1/Notion writes, new migration, paid Gemini calls, deploy,
feature-flag activation or merge are performed by this change. The user
controls the PR merge and separate production acceptance. Reports belong to
issue #917.
