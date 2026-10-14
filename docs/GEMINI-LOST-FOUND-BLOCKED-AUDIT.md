# GEMINI-LOST-FOUND-NOTION-1 — canonical D1 resolution and final category

## Canonical target: VERIFIED (production D1 read-only, operator evidence, 2026-10-14)

Existing `notion_agenda_targets` row for `lost-found`:

- Database ID: `811d0659-7217-4914-a27c-1cd67bda3e0e`
- Data Source ID: `3ed793fc-1d18-8122-95b9-000b05c3c6bd`
- Title field: `Názov`
- `notion_agenda_sync`: `entity_id=1`, `notion_page_id=3ed793fc-1d18-818a-938c-f6630c6762b3`.
- The Notion page parent matches this data source and the canonical Lost/Found schema.
- The other same-named database `b7c978b6-bbfd-460b-b489-30e0814b0ddd` and source `3ed793fc-1d18-8141-bc25-000bc25ab39b` are **NOT** the production-sync target.

Never infer identity merely from name, record count or schema. This mapping is explicitly pinned in the strict Lost/Found contract; mismatched configured ID, runtime data-source ID, runtime parent database or schema fails before any POST.

## Existing worker integration

- `scripts/gemini-notion-category.mjs` exposes `help.stratene-a-najdene` through the original capability gate.
- `scripts/gemini-notion-agent.mjs` chooses `NOTION_LOST_FOUND_DATA_SOURCE_ID` only for this stable key, validates canonical ID before API traffic, revalidates its Notion metadata and whole row scan initially and immediately before POST.
- `scripts/gemini-notion-lost-found-fields.mjs` is a side-effect-free guard: `STRATENÝ`/`NÁJDENÝ` => `LOST`/`FOUND`, OPEN status, event date at most 30 days old, today's verified_at with grounded HTTPS evidence per field, safe municipality-only geography, no personal contacts, home address or precise GPS.
- Duplicate prevention uses report type, dog identity and markings, city, event date and source URL; incomplete/ambiguous identity fails closed. The confirmed-created set prevents a second POST on a stale Notion read.
- Payload sets only `Psipedia stav=DRAFT` with factual fields and evidence. It does not set `Psipedia ID`, `Slug`, public status, coordinates, contacts or canonical identity. Manual review is mandatory.
- Existing Notion POST handling treats timeout, 5xx, invalid JSON or missing ID as uncertain, sends a failure callback and **never retries the POST**.
- Existing HMAC callback, request budget and no-automatic-schedule controls are preserved. PR #835 is now merged into main and integrated in this branch: bounded progress tracking, duplicate recovery, one tool-free completion after two unproductive turns, and fail-closed behavior on an unresolved candidate or request-limit exhaustion. The ceiling remains nine Gemini requests.

## Post-#835 integration

- Merged the existing main hotfix into the original #834 branch without reverting its nonproductive-turn protections.
- Combined the Lost/Found-specific Notion search with progress tracking and preserved the #835 offline pilot regressions alongside all 22 categories.
- No production calls or writes are performed by this integration.

## Manual GitHub configuration BEFORE an explicitly approved live test

Add **GitHub Actions repository variable** (NOT a secret; it is a Notion ID):

```text
NOTION_LOST_FOUND_DATA_SOURCE_ID=3ed793fc-1d18-8122-95b9-000b05c3c6bd
```

Workflow `.github/workflows/gemini-notion-agent.yml` already forwards that value to the external worker. Do **not** configure or enable it as part of this PR. The broader paid flag and schedules are unchanged. No live test is authorized by this code change.

## Offline verification

Run from repository checkout with Node >= 22:

```sh
node --test tests/gemini-lost-found-contract.test.mjs
node --experimental-strip-types --test tests/gemini-external-agent.test.mjs tests/gemini-external-worker-offline.test.mjs
node --check scripts/gemini-notion-agent.mjs
npm run lint
npm run build
```

The worker suite mocks **all** Gemini, Notion and callback traffic, including both case types, canonical/wrong database, privacy, verification, duplicate/ambiguous and incomplete scans, uncertain Notion POST without retry, valid/invalid HMAC and regressions for the other 21 categories. Trust GitHub Actions logs for the exact final test result rather than declaring success in advance.

**Operational rule:** merge, deployment, production Notion writes, paid Gemini calls, variable activation and schedule enabling are all excluded from PR #834.
