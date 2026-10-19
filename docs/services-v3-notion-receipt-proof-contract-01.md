# Services V3 — Notion Receipt Proof Contract 01 (offline only)

## Frozen scope
This is an isolated **candidate validation contract**, not the reconciler. It does not call
Notion, issue D1 writes, modify 0134, approve options, enable any flags, or change API/UI.
Files: \`lib/service-catalog-notion-receipt-proof.ts\` and offline tests. The new standalone
CI workflow runs only those tests. Production activation is **not approved**.

## Existing boundaries on main
- 0133: \`service_catalog_admin_options\` owns the canonical option ID, semantics, status,
  mirror status and integer CAS version. Changes increment the version.
- 0134: \`service_catalog_admin_notion_receipts\` owns \`option_id\`, \`option_version\`,
  \`notion_page_id\`, \`notion_last_edited_at\`, \`remote_payload_sha256\`, \`verified_at\`,
  \`verified_by\`; unique \`(option_id, option_version)\`, append-only triggers.
- 0134 approval trigger and the Phase 3C lifecycle require SYNCED and a receipt for the
  *exact version at approval*. A caller-supplied SYNCED flag is never proof.
- The current internal \`recordCatalogMirrorOutcome\` can increment PENDING to SYNCED
  but does **not** atomically create the corresponding verified receipt. It must **not**
  be treated as a safe receipt writer. Changing that implementation, its callers, or
  existing lifecycle endpoints is **out of scope** for this PR.

## Pure proof input and output
\`validateServiceNotionReceiptProof({local,writeAck,remoteRead,context})\` expects
**independently acquired** snapshots from a trusted server-only worker:

1. \`local\`: canonical D1 DRAFT/PENDING option and integer version \`v\`, including
   kind, label, group, meaning, category, ordered categories and tri-state kind.
2. \`writeAck\`: actual Notion write-response page ID and last-edited timestamp,
   bound by the worker to option ID, version \`v\` and completion time.
3. \`remoteRead\`: a fresh direct GET of that Notion page, with parent data-source ID,
   Notion page ID, source option ID/version persisted in Notion properties, exact
   remote semantic fields, archive flags, last edit time and fetch time. The
   \`payloadSha256\` member is **computed by the trusted adapter from parsed remote
   properties**, not asserted by a browser, agent, Notion text field or write ACK.
4. \`context\`: configured data-source identity, expected page from the trusted mapping
   or write ACK, current D1 ID/version, all relevant mapping/receipt conflicts,
   reconciliation clock, and worker ID. Supplying the literal \`verifiedBy\` string
   does not authenticate a caller; origin is established **outside** this function.

The validator compares identity/parent/page IDs, refuses changed/archived pages,
requires read-after-write timing, compares SHA-256 hashes of canonical JSON v1
(computed independently from D1 and Notion), and checks duplicate/cross-option
receipt mappings. It rejects missing remote data, unknown fields, caller-provided
SYNCED-as-evidence, stale versions, bad hashes and replay candidates.

Success returns only a \`receipt\` **candidate**, with \`option_version=v+1\`, and an
explicit \`guard\` requiring DRAFT/PENDING at \`v\`, transition to SYNCED at \`v+1\`, and
no existing receipt for \`v+1\`. That increment is essential because Phase 3C mirror
updates increment the canonical CAS version. The receipt hash represents canonical
semantic payload **v**; \`option_version=v+1\` is the post-mirror-transition D1 row
with unchanged semantics. Every later semantic edit invalidates the approval
eligibility for the old receipt. Strict canonical field mapping is versioned by
\`psipedia.service-option.v1\`; no aliases or loose string coercion.

**Limit:** Pure validation cannot independently attest to where an object came from
or make a write atomic. The worker must authenticate the source and enforce CAS
inside D1. An attacker able to invoke the validator with fabricated matching
snapshots can produce a candidate; therefore this function must never be exposed as
an Admin/API receipt acceptance endpoint and success must not itself set SYNCED.

## Required later trusted Notion reconciler (separate approval)
1. Use a server-owned Notion token, fixed authorized data-source target, and verified
   D1 canonical row + page mapping. Reject ambiguous or duplicate page mappings.
2. Snapshot D1 version \`v\`, confirm \`DRAFT/PENDING\`, build canonical projection and
   perform the authorized Notion write using canonical IDs and version fields.
3. Capture Notion ACK, then independently GET the exact page; compare the Notion
   parent, source ID/version, semantic fields, last edited timestamp and freshness.
   Distinguish network failure / 403 / stale reads / changed page / mapping conflict.
4. Compute \`remoteRead.payloadSha256\` from the **GET response**, validate candidate
   with the offline contract and re-read current D1 identity/version before commit.
5. Commit **one atomic D1 transaction**: conditional CAS of \`DRAFT/PENDING v\` to
   \`DRAFT/SYNCED v+1\` with unchanged semantics, then receipt INSERT for \`(id,v+1)\`;
   roll back both on CAS miss or UNIQUE conflict. Serialize competing workers for
   the same option; check page ownership with a durable uniqueness policy. Do not
   call the existing unpaired \`recordCatalogMirrorOutcome\` for this operation.
6. Keep 0134's append-only receipts and audit logging intact; never upsert, repair
   or delete a receipt. Return conflict for stale retries. Re-fetch remote state
   after transient uncertainty rather than trusting a cached SYNCED result.
7. Only after a separate security review of the actual writer and 0134 production
   verification may approval use the receipt. Feature flags and deployment need
   separate explicit authorization. Notion PATCH is **not** performed by this PR.

## Security/acceptance matrix
| Condition | Offline decision | Future enforcement |
| --- | --- | --- |
| Exact fresh DRAFT/PENDING v + independent Notion GET | candidate v+1 | CAS + INSERT transaction |
| Admin/caller supplies \`SYNCED\` or origin | REJECT | never accept receipt API input |
| Missing Notion GET / incorrect source database or page | REJECT | trusted token, mapping |
| Stale canonical version / changed Notion source-version | REJECT | CAS version/status |
| Mismatched semantic payload or SHA-256 | REJECT | GET-only canonical projection |
| Changed/archived remote page, stale read timestamps | REJECT | retry fresh GET |
| Duplicate receipt or conflicting page ownership | REJECT | UNIQUE + DB ownership guard |
| Replay of prior validated candidate | candidate may be replayed | second CAS must lose |
| Two workers or concurrent Admin edit | candidate may race | transactional CAS; single winner |

## Before production activation
- Separate 0134 migration readiness review, authorized rollout, schema/trigger/receipt
  preflight, and explicit production verification (not done here).
- Read-only audit of the actual Notion data-source schema and approved field mapping.
- Design and review of a future worker-side read-after-write implementation; no
  public proof writer. Dedicated synthetic D1 transaction/rollback and Notion stub
  integration tests beyond these pure-function unit fixtures.
- Durable page-ownership uniqueness and locking/serialization policy. Current 0134
  UNIQUE covers only \`(option_id,option_version)\`, **not unique Notion page IDs**.
- Security review of identity/provenance acquisition, CAS, failure handling, TTL,
  rollback and observability; review current internal \`recordCatalogMirrorOutcome\`.
- Separate owner permission for deployment, Notion PATCH and activation flags.

Offline test command (Node 22.16+):

\`\`\`sh
node --experimental-strip-types --test tests/service-catalog-notion-receipt-proof.test.mjs
\`\`\`
