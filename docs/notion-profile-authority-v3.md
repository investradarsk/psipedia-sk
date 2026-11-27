# Profile-owned Notion authority — staged V3 policy

Step 2/16. D1 is the only source read by the public site. Notion is the editorial authority of unlocked profile content, not a second public database.

## Shared decision contract
- Applies to directory, breeds, events, organizations, adoptions, lost-found, help-cases and eshops. Articles retain their separate two-way path.
- D1 determines owner: active partner, reviewed or unlock-in-progress prevents routine content synchronization; only otherwise may Notion own content. No authority derived from provider checkbox, timestamps, or stale receipts.
- For a mapped, allowed field, only a complete and type-validated provider observation is eligible. Notion wins without baseline; a real empty value also wins. False and zero are values. Missing, undefined, truncated/failed reads and invalid data never become clears. Field-specific validation and canonical constraints remain mandatory.
- Ordinary profile content is never pushed to Notion in the new mode. Technical lifecycle mirrors, first-time creation and explicit unlock are distinct operations with their own guards. Publication, ownership, identity, technical state and privacy controls remain protected; domain status (e.g. cancelled event) requires an explicit adapter contract.
- An unlock remains protected until an identity-checked full allowed snapshot has been transferred and verified. A failed or interrupted transfer must not reopen inbound sync.

## Activation gate
The pure decision engine accepts explicit profileAuthority context. No production adapter passes it in this step; omitted context retains existing V2 semantics. This is deliberate: wire all actual transports and recovery paths together only after locking, field decoding, lifecycle and targeted-write protections are implemented and verified. Do not enable destructive blank propagation by changing a global flag alone. No new DB tables, Notion properties or environment variables in this step.

Before activation: independently verify D1 review/ownership locks including pending unlock, provider schema/field completeness and actual value mapping (especially directory contact fields and breed historical combined text), block stale outbound jobs, preserve existing CAS/fences, verify lifecycle draft/creation/deletion and publication rules, and capture recovery evidence/backup. Run regression for Fifi: editing only perex cannot alter email/phone/web on either side. Validate against isolated data before production rollout. Existing field-level diagnostics and evidence remain available; lack of baseline is not a reason to reject a validated authoritative pull after activation.

No production writes, migrations or deployment changes performed by step 2.


## Step 3/16 — guarded review transition foundation
Current Directory owner unlock has a persisted pending lock and verified full export. In contrast, the shared review store for Events/Help currently removes the review row directly on uncheck. Do not enable the new inbound policy on that path until it uses verified unlock.

The existing V2 manual fence is reused as a persistent per-record transition barrier, not a new schema:
- Acquire fails if a field reservation is pending or another owner holds the fence.
- Invalidate scoped old evidence/receipts only while the exact token owns the fence, and never reset version counters. A stale release cannot invalidate the active owner's state.
- Lock: acquire fence, require the adapter to atomically save edited fields and the canonical review state, verify the committed lock, then release the fence.
- Unlock: acquire fence while the canonical lock remains, read a complete allowed snapshot with a canonical revision, verify its full remote write and readback, then require a revision/mapping/owner-guarded atomic unlock. Release fence last.
- Any unverified or interrupted transition leaves the durable fence in place. Do not auto-expire it; recovery must establish current canonical/remote state and verify the exact token. The existing manual-fence diagnostics remain applicable.

The transition orchestrator and its isolated SQLite test fixtures cover all eight scope names, including refusal of partial/failed transfers and stale revision finalization. The fixtures model adapter callbacks; they are not a test of the real Admin routes or remote Notion API. The fence already protects V2 reservation CAS; legacy paths, direct metadata/media writes, partner approvals and all actual save/unlock adapters must honor it or be retired before activating profile authority. Breeds/E-shops still need canonical review persistence and UI integration; reuse existing storage where feasible. For Directory, reuse the existing pending-unlock mechanism instead of introducing a second review source. In step 6 integrate and prove these guarantees on actual transports, and verify that review metadata mirroring does not carry content.

No production configuration, schema, or records changed in this step.


## Step 4/16 — creation and deletion lifecycle
Reuse existing canonical lifecycle and identity locks. The current admin-record-lifecycle service supports Directory, Events, Help cases, Breeds, Articles, Adoptions, Lost/found and Organizations. Its durable tombstones retain name/slug/category and selected external identity keys, hide the canonical row before remote deletion, verify each mapped Notion target and retry pending removal. No new content fields or tombstone table needed.

Implemented remote-deletion handling: signed page.deleted events enter the durable webhook inbox; dispatch consults the existing D1 mapping (including original/work-copy breed pages) and owner-confirmed tombstones. Externally trashed mapped pages are recorded as REVIEW, not deleted or unpublished in D1. Owner-confirmed deletion echoes are ignored. This uses the existing inbox review state; a dedicated owner-facing alert and verification of the provider subscription/delivery are still required. If inbox processing is disabled, a queued deletion remains pending until processing resumes.

E-shop import now checks the existing tombstone and provider trash/archive state before canonical creation, including a fresh check inside the existing page/agenda creation locks. Existing E-shop create uses draft status and persistent identity mapping. E-shop hard deletion still needs integration with lifecycle schema/guards; do not imply the current eight-kind lifecycle includes E-shops.

Existing Gemini provenance/import locks and per-agenda creation pipelines must be reused. Current Directory and Events/Help importers have private-draft/Ready gates; the existing breed work-copy is principally for mapped breeds. Step 6 must integrate a uniform automatic new draft flow (including incomplete drafts with sufficient identity, without requiring publication fields), Admin-to-Notion creation for all agendas, and verified one-to-one mapping. Technical duplicates are blocked; fuzzy matches against existing and removed records are owner warnings at publication (steps 10–12). Keep existing publication and privacy guards. Do not weaken identity/required storage constraints just to accept a draft.

Regression tests added for remote deletion identity and tombstone exemptions; provider subscription, end-to-end lifecycle, E-shop hard deletion and full automatic creation parity are not verified. No production changes.
