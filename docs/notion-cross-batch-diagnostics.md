# NOTION CROSS-BATCH IDENTITY DIAGNOSTICS 01

Scope: isolated, offline-only follow-up to merged PR #905. No production queries,
Notion API calls, D1 access, writes, migrations, scheduling, admin API or UI changes.

## Contract

Pure function **analyzeNotionCrossBatch(input)** in
**lib/notion-data-quality-cross-batch.ts**. An input is an array of up to 500
sanitized batch receipts; each receipt contains up to 100 pseudonymized
identity pairs. The function does not read/write files or call any service.

Required receipt fields (unknown or missing fields are rejected):

| Field | Meaning |
| --- | --- |
| runKey | Stable, secret-keyed HMAC of the logical audit run; same for both passes |
| checkpointKey | Stable, secret-keyed HMAC of an operator-owned run checkpoint; not a Notion snapshot |
| agenda | One of the six existing Audit 02 agendas |
| sourceKey | HMAC of the specific Notion data source ID |
| pass | 1 or 2 |
| batchNumber | 1-based sequential page number within that pass |
| requestCursorKey | HMAC of the cursor submitted for this page, or null on first page |
| nextCursorKey | HMAC of the returned continuation cursor, or null if finished |
| hasMore | Exact Notion has_more boolean; do not infer from record count |
| records | Array of { notionKey, psipediaKey }; psipediaKey may be null |

**All non-null *Key values must be exactly 64 lowercase hexadecimal
characters.** Input schema is strict: raw response bodies, HTTP headers,
addresses, names, coordinates, phone numbers, emails, URLs, titles, error
messages, and extra fields are rejected. The function returns only counters,
reason codes, and the aggregate CONFLICT / REVIEW / UNKNOWN verdict; it
never returns page IDs, record IDs, source IDs, cursors, HMACs or private fields.

**Pseudonymization must happen in memory, before calling this helper.** Use
HMAC-SHA256 with a fresh, high-entropy secret kept outside report files, and
domain separation for notionPage, psipediaId, source, run, checkpoint,
and cursor identities, e.g. HMAC(secret, namespace + NUL + normalizedIdentity).
Use the **same secret** for all batches and both passes of one audit. Never
store the HMAC key with the evidence or use unsalted SHA256 for sequential IDs.
A future trusted adapter must discard unneeded API fields before creating
receipts; this PR intentionally does not implement that adapter.

## Meaning of classifications

- **CONFLICT**: two distinct Notion page identities claim the same Psipedia
  identity within the same run + agenda + source + pass, when source and
  checkpoint are stable. Counts separate collisions within one batch and
  between batches. This is evidence for human triage, not authority to mutate.
- **REVIEW**: same Notion page reappears across cursor batches, an identity
  changes between passes, source/checkpoint changes within a run, a canonical
  claim is seen while the run checkpoint is unstable, or the cursor chain is
  inconsistent. A repeated page can be caused by changing pagination and
  is not assumed to be a duplicate stored Notion page.
- **UNKNOWN**: no provable conflict/review condition, or insufficient coverage.
  There is intentionally no CLEAN / VERIFIED / UPDATE result. Even two
  complete pass cursors do not prove an immutable Notion snapshot.

The unknown array always reports immutable-snapshot limitations, missing
global D1 orphan evidence, missing independent authoritative identity evidence,
and inability to attest that the supplied token strings are genuine HMACs.
The evidence counters state what was observed and distinguish complete
cursor chains from incomplete audit passes.

### Important distinctions

- Audit runs are keyed by runKey + agenda. Identity collisions never cross
  audit runs, agendas, sources, or passes.
- A source swap within the same run is explicitly flagged for REVIEW; identities
  on separate sources are still isolated (important for legacy lost/found).
- Repeating the same record in pass 2 is expected and never counted as a
  duplicate. Different identities or mappings in pass 2 require REVIEW.
- Page numbering must start at 1 with no gaps; the request cursor on batch N
  must equal the previous batch's next cursor. If any continuation is missing,
  the pass is incomplete and cannot establish coverage.
- No inference is made about D1 rows not present in Audit 02's bounded
  evidence. In particular, global orphan mappings remain UNKNOWN.

## Offline test execution

Use Node 22.13+ locally, or the dedicated read-only GitHub Actions workflow:

    node --experimental-strip-types --test tests/notion-data-quality-cross-batch.test.mjs

The synthetic test corpus has **230 different identities per pass (460 row
observations)**. It covers cross-batch page/ID collisions, isolation of all six
agendas, changed sources/checkpoints, cursor gaps, cross-pass changes, data
minimization and rejection of private-field payloads. The workflow also runs
the existing PR #905 audit tests, focused TypeScript, lint and build.

## Future integration — separate approval and separate PR

1. Confirm that the #905 production auditor's response metadata is sufficient
   to capture the submitted cursor and the returned cursor for each
   single-source, 100-item batch. The existing response includes the returned
   cursor; a trusted adapter must also retain the submitted cursor locally.
2. Specify an authorized ephemeral HMAC transform for only the two identity
   fields plus run/source/checkpoint/cursor metadata, with deliberate
   namespace separation and no stable long-term public pseudonyms.
3. Create a gated offline extraction/import tool, with validation and a
   redaction test ensuring PII never appears in persisted artifacts, logs,
   stack traces, CI uploads, or GitHub comments.
4. Independently verify Notion source continuity and actual cursor completion
   across both passes. Explicitly do not call two passes an immutable snapshot.
5. Separately design full D1 mapping coverage (read-only, protected
   production access with independent authorization) if global orphan detection
   is ever required. The 100-item per-batch Notion receipt cannot prove it.
6. Review the synthetic tests, focused CI and new PR before deciding whether
   to implement any collector. No Notion PATCH, D1 write, migration, merge or
   deployment is authorized by this diagnostic PR.
