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
