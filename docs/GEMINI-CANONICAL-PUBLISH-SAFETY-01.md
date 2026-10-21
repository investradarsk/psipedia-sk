# TECH-20261020-GEMINI22-PUBLISH-01: canonical handoff

**PARTIAL — NOT READY FOR MERGE OR PRODUCTION ACCEPTANCE.**

## Findings

The previous `/notion-drafts/[id]/publish` did not publish any canonical D1 row.
Directory only set Notion `Stav` and `Psipedia stav` to `Publikované`
and returned `PENDING_SYNC`; it also rejected directory records without a
public HTTPS website, although websites are optional. Agenda approval modified
an internal Notion review/status field and did not prove public D1 state.

## Scope of this isolated safety patch

- The legacy publish endpoint now performs authenticated, same-origin, revision-
  and category-checked read-only validation and hands verified mappings to their
  existing native D1 editor. Unmapped concepts fail with `409 IMPORT_REQUIRED`.
- The Notion-only Directory editor saves privately and cannot perform a misleading
  pseudo-publish. Native Directory publishing is unchanged.
- The agenda Notion review button is labelled `Pripraviť na import`, not publish.
- A direct Notion concept page refuses a Psipedia ID without a verified mapping.
- An offline 22-category policy matrix verifies routing, missing/invalid mappings,
  rejected concepts, and a canonical published-state distinction.

## Remaining essential work

1. Build a targeted, idempotent **Notion-only -> canonical D1** import/reconciliation
   path reusing existing trusted provenance, dedupe/locking and sync; never insert
   a second D1 entity when one mapping already exists.
2. Complete canonical save/publish-to-Notion acknowledgement and conflict/uncertain
   write handling, including per-agenda native editor integration, *without*
   unapproved production Notion or D1 writes.
3. Add mocked route and lifecycle integration coverage for D1 persistence and
   Notion round-trip; assess adopted profiles and content-minimal draft requirements.
4. Validate the 22 categories, adoption/Lost-Found privacy rules, GEO privacy,
   auth and status transitions through separately authorized real acceptance.
5. CI on the exact PR HEAD, production schema readiness, and actual Notion/D1
   mappings are UNKNOWN until independently checked.

No merge, deployment, paid calls, migration, sync run or public publication.

## Work checkpoint 2026-10-21

The one-page save reconciliation path is now implemented for signed Gemini
provenance through the existing Directory/Events/Help sync pipelines. It requires
the exact saved Notion revision at entry and rechecks it under the import lock.
The Events/Help path does not override production enablement. A canonical-ready
response requires one confirmed creation plus a verified private native-editor
mapping; an existing/racing mapping returns NEEDS_REVIEW with its editor URL,
never a claim that the latest Notion edit is present in D1.

Scheduled and targeted trusted Events/Help imports use the same existing 0124
page and agenda locks, re-read mappings, page revision and duplicate candidates
inside the lock, and persist mapping before Notion writeback. An uncertain
canonical create/mapping/Notion acknowledgement retains those locks for manual
reconciliation; they must not be blindly deleted or retried. This deliberately
blocks further imports in that agenda until the ambiguous outcome is resolved.
No new schema, lock expiry, scheduler or automatic recovery was introduced.

Offline coverage executes the production save coordinator for all 22 catalog
keys and the production import critical section with mocked I/O, including
revision races, disabled sync, missing provenance, existing mappings, lock
contention, duplicate detection and lost acknowledgements. This is not full
end-to-end production acceptance or proof that incomplete values are accepted by
every canonical adapter. Existing native editors remain responsible for actual
validated publication and publication-state readback.

Remaining: full native save/publish-to-Notion acknowledgement across all agendas,
complete minimal-draft and editor lifecycle integration, and owner-controlled
live acceptance. The cross-service Notion GET/PATCH race remains an API limit;
this work does not claim atomic D1+Notion transactions. Keep this PR Draft.
