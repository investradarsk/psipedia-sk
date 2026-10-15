# GEMINI-CALLBACK-LIVE-REPAIR-1 — production acceptance checklist

## Incident (15 October 2026)

Paid external GitHub Actions jobs 8–11 (Veterinári, Tréneri, Kynologické kluby, Výstavy) completed Google research with `duplicate_only` and zero created pages. The signed callback then returned HTTP 503. The admin displayed SUCCESS, but no run ID or last-run timestamp.

**Verified root cause:** migration `0113_gemini_automation_foundation.sql` restricts `gemini_automation_runs.error_code` to known provider errors. The newer callback tried to insert `NO_RESULT_DUPLICATE_ONLY` into that column, failing the insert *after* updating the job to SUCCESS.

## Repair contract

- Keep the deployed 0113 schema unchanged. Store `NO_RESULT_*` in `gemini_manual_background_jobs.error_code` (an unrestricted field). The existing admin run-history query joins completed job metadata to the canonical run row.
- The signed callback commits run + job + last_run_at in a single D1 `batch()` transaction. A failed statement rolls back, rather than leaving a false SUCCESS.
- Idempotent receipt replay never calls paid Gemini. Do not reconstruct historical callback receipts, signatures or provenance.
- The category card polls the existing authenticated admin GET endpoint read-only, showing the latest job's start, state, completion and run ID without activating scheduled dispatches.
- Pre-fix production jobs 8–11 are **not repaired automatically**. They may remain SUCCESS without run ID. A separate read-only audit and explicit operator approval are needed before any historical production data repair.

## Mandatory GitHub Actions configuration before 22 paid tests

The external GitHub worker receives separate Notion data source variables from **GitHub Actions repository Variables** (not Cloudflare D1 configuration). The 15 October job logs showed these four blank:

- `NOTION_HELP_DATA_SOURCE_ID`
- `NOTION_ORGANIZATIONS_DATA_SOURCE_ID`
- `NOTION_ADOPTIONS_DATA_SOURCE_ID`
- `NOTION_LOST_FOUND_DATA_SOURCE_ID`

Resolve each from the existing canonical Notion integration and verify correct **data source** IDs, not similarly named databases. Enter values in GitHub repository Settings → Secrets and variables → Actions → Variables, with an authorized operator. Do **not** hardcode IDs, introduce a second registry or expose credentials in CI logs. `NOTION_DIRECTORY_DATA_SOURCE_ID` and `NOTION_EVENTS_DATA_SOURCE_ID` were already configured at the time of this incident.

The worker already rejects absent/malformed source IDs before any paid Gemini API call; preserve this fail-closed rule. Lost/Found needs separate privacy acceptance before any live test.

## Acceptance before resuming paid runs

1. On the PR: run offline Gemini foundation tests, dedicated SQLite regression tests, TypeScript/build/lint, and ensure no new SQL migration is needed.
2. After explicit merge/deploy approval, confirm the new Cloudflare Workers production build and installed variables. Do not reapply D1 0127.
3. Inspect D1 jobs 8–11 read-only; do not retroactively label their runs SUCCESS based only on an old UI screenshot.
4. Exercise a signed callback in an isolated test fixture for `SUCCESS + duplicate_only + created_pages=[]`, `FAILED` and duplicate callback delivery. This must perform **zero paid Gemini calls**.
5. Only with separate paid-run approval, test one genuine live Notion-only duplicate-check research job. Confirm a linked run ID, correct no-result vs error label, time and automatic refresh on its category card.
6. For a genuinely new candidate, verify HMAC receipt, canonical D1 **draft**, Notion mapping, category-specific editor and no auto-publication. Then continue toward 22/22, one job at a time.

## Out of scope

- Automatic FIFO queueing of 2–22 manually selected categories (future `GEMINI-QUEUE-V2`).
- Adding D1 to Gemini research duplicate detection: **Notion alone remains the source**.
- Paid API calls, unapproved production D1 writes, live publication, enabling scheduled paid dispatch, historic Fénix import, or changing the 0127 migration.
