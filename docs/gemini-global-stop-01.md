# PSIPEDIA — GEMINI GLOBAL STOP & SCHEDULER CONTROL 01

Report ID: `TECH-20261020-GEMINI22-STOP-01`

Status: Draft PR only. **Do not merge, deploy, run production migrations or enable paid/scheduled flags without separate approval.**

## Scope

- One persisted control row for all 22 existing Gemini categories; the 22 stored enabled/cadence/weekly-day/maximum settings are not rewritten by STOP.
- Existing `/admin/automatizacie-gemini` provides STOP/resume and truthful effective status.
- `PUT /api/admin/gemini-automation/control` accepts strictly `{"stopped":true|false}`, with existing admin authentication and CSRF origin validation.
- D1 triggers atomically reject all new QUEUED/RUNNING jobs and direct RUNNING run claims after STOP; existing `RUNNING` tasks may complete and deliver signed callbacks.
- STOP transaction marks all queued jobs `FAILED / GEMINI_GLOBAL_STOP_CANCELLED` for explicit audit. They **do not replay** after resume. No draft or run-history deletion.
- Resume is explicit and fenced (`RESUMING` is fail-closed). Overdue planned occurrences are skipped via existing Bratislava civil-time recurrence logic; future dates and disabled categories remain unchanged.
- Cloudflare Cron checks persisted RUNNING before both existing external and legacy queue consumers. Missing migration fails closed. D1 triggers defend STOP/dispatch races after this read.
- Single-use, signed `/api/internal/gemini-agent/authorize` worker preflight prevents direct/replayed GitHub Actions dispatch from billing the same D1 job twice and respects STOP. GitHub refuses any paid/Notion research before admission.
- Existing Cloudflare external / scheduled gates and GitHub `GEMINI_AGENT_PAID_ENABLED` remain unchanged and superior. The GitHub paid flag is **not observable** from the Psipedia admin and is labeled accordingly.
- Administrative maximum remains 0–100; the external worker retains its effective **5 concepts per job** hard cap.

## Sequence and safety

1. STOP: D1 transactional change to STOPPED + cancellation of existing QUEUED approvals. Jobs already RUNNING (including uncertain outcomes) are **not force-killed**.
2. A work claim and a STOP are ordered by SQLite/D1 statement transaction serialization. If the claim wins first, it counts as already running; otherwise triggers reject the new work. The signed worker admission is a second single-use boundary before the first provider/Notion request.
3. Resume: enter RESUMING with CAS revision; advance only overdue enabled category slots beyond the resume instant (with DST-aware existing algorithm); finally CAS to RUNNING. Concurrent STOP supersedes an earlier resume. Failure leaves RESUMING, not an unsafe partial enable.
4. New requests after explicit resume remain subject to category settings, producer flags and single-use paid admission. Queued approvals canceled by STOP require a fresh admin action.

## Offline acceptance (no external calls)

`node --experimental-strip-types --test tests/gemini-global-stop.test.mjs tests/gemini-scheduler-admin-v2.test.mjs tests/gemini-automation-admin.test.mjs`

Tests cover migration, fail-closed missing schema, no paid calls under STOP, direct/queue/job DB triggers, completion of pre-existing RUNNING work, resume, preserved schedules, concurrent STOP/resume, uncertain resume failures, authenticated/CSRF route contract, single-use signed worker admission, and Notion sync independence.

CI workflow: `.github/workflows/gemini-global-stop-ci.yml` (read-only GitHub permissions, no deploy, no API secrets).

## Separate mandatory production acceptance

1. Obtain independent approval for migration `0136_gemini_global_stop.sql`, assess existing production D1 schema and backups, and execute migration **once** in a separately authorized rollout.
2. Verify D1 control row, triggers, new `worker_started_at` column and queue constraints via read-only checks.
3. Deploy code only in a separately authorized release after migration and smoke/read-only acceptance. Keep `GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED` and `GEMINI_AGENT_PAID_ENABLED` unchanged; do not activate them during rollout.
4. In admin, check STOP/resume status, saved settings for all 22 categories, queue and job receipt states. Confirm no unexpected queued replay and no backfill of missed scheduled slots.
5. Any uncertain external dispatch or worker-admission acknowledgement must be investigated manually: never auto-retry the same paid job.

Known operational boundary: GitHub repository administrators can intentionally modify workflows, code, secrets or bypass branch protections; this control secures the shipped workflow/worker contract and D1/API paths, not an adversarial repository owner.
