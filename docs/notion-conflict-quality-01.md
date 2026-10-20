# NOTION-CONFLICT-QUALITY-01 — conservative admin triage

Parent: TECH-20261020-NOTION-01, GitHub issues #715 and #917.
This is a **read-only projection** of the existing Audit 02 backend, not
a new Notion/D1 synchronization or data-quality writer.

## Historic figures are not current production conflicts
Previous Notion Directory observation: 1,835 records, 1,800 published,
1,408 synchronized, 425 error flags: 111 CONFLICT, 73 REVIEW_REQUIRED,
241 other errors. **No current production D1/Notion snapshot verification
was conducted by this PR.** The currently confirmed total for those 425
flags is UNKNOWN. These are older observations, not mutually provable live
canonical defect counts.

## Conservative meaning
- CONFIRMED — independently observed current identity collision within
  one Audit 02 batch, or a content conflict backed by three independently
  comparable snapshot hashes (the live Audit 02 route does not currently
  supply these hashes). Does not choose a side or allow automatic repair.
- STALE_OR_RESOLVED — a historical Notion error exists, but independent
  current comparable snapshot evidence reports UNCHANGED. No error is cleared.
- NEEDS_REVIEW — missing/orphan/mismatched mappings, privacy/Google
  protection, historic conflicts without fresh snapshots, runtime or content
  errors needing a check. Historical error text is never proof.
- UNKNOWN — Notion/D1 identity evidence unavailable or insufficient.

All counts are **within one <=100-page response**. The UI sums observations
across each selected pass. Do NOT treat pass 1 plus pass 2 as unique records,
and do NOT infer global orphan mappings or a stable Notion snapshot. Use the
merged #911 HMAC-only analyzer for cross-batch identity and cursor proof.
The current admin audit may read mapping IDs, not private field values.

## Admin integration
The existing Kvalita údajov nav links to the existing Notion Audit in
Nástroje; there is no new admin editor, action, database table or queue.
The authenticated Notion audit exposes separate historical flags and triage
counts, type, reason and field **names only** if comparable proof exists.
Editor links are allowed solely for D1-verified matching Directory/Event
IDs. No guessed URLs for other agendas, no public links to unpublished
profiles. No automatic publication, mass repair or approvals.

The copyable operator report excludes individual IDs, Notion source IDs,
cursor/checkpoint values and any field values. Do not attach authenticated
API raw output to GitHub, logs, CI artifacts or issues.

## Authorized future verification (separate approval)
1. Confirm permission to run the existing admin audit in **dry-run** only;
   authorize bounded read-only D1 and Notion queries.
2. For each agenda, pin its Notion source and run 100-record batches with
   complete cursor sequence across both independent passes.
3. Independently produce sanitized comparable current Notion and canonical D1
   snapshots with documented contract/version/source; never use legacy Sync
   hash as an invented current hash. Preserve a separately authenticated
   last-editor provenance before making any editorial precedence decisions.
4. Run #911 cross-batch analysis on HMAC-pseudonymized receipts with secret
   outside reports. Confirm mapping coverage separately for global orphans.
5. Review confirmed collisions and differences individually with existing
   editors. All writes, conflict approvals, publication and baseline repairs
   are separate explicit operations outside this PR.
