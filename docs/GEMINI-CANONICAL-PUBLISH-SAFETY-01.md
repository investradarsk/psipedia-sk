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
