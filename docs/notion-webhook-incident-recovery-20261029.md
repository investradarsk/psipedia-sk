# Notion webhook: safe recovery after 8-hour delivery pause (29 Oct 2026)

## What happened and what is / is not proven

Notion reported that its delivery to `https://psipedia.sk/api/integrations/notion/webhook`
failed for 8 hours and **paused the subscription**. The email contains no
HTTP status or request identifiers. Do not present the cause as proven:
HTTP 401 (signature/token), 403 (subscription), 503 (sync/deploy/D1)
or upstream timeout could be responsible.

Before this change, the HTTP handler ran the full targeted reconciliation
before acknowledging every signed page event, returning 503 on runner failure.
The new flow commits a minimal receipt in D1 before returning 200 and processes
the receipt on the **existing** `*/5 * * * *` trigger.

## Required order of operations (owner-controlled)

1. Keep the Notion subscription **paused** until the D1 migration has
   completed. Do not re-create the subscription or share its verification
   token. Neither PR merge nor a browser visit applies a migration.
2. After reviewing and merging the PR, apply
   `0145_notion_webhook_inbox.sql` using the existing **protected
   Production D1 Migrate** workflow for `psipedia-sk-db`. All preceding
   migrations, including `0144`, must be complete. No blind direct SQL.
3. Check deployed Worker code/flags, D1 binding and the existing Cloudflare
   Secret `NOTION_WEBHOOK_VERIFICATION_TOKEN`. Never copy secrets to chat,
   GitHub PR descriptions or logs.
4. In Cloudflare Logs, inspect new **error codes only**:
   - `notion_webhook_signature_invalid`: check the Notion subscription's
     verification token matches the Worker secret (401).
   - `notion_webhook_subscription_mismatch`: wrong optional subscription ID
     (403).
   - `notion_webhook_not_configured`, `notion_webhook_disabled`:
     missing configuration or disabled feature flag (503).
   - `notion_webhook_inbox_write_failed`: missing migration or D1 outage
     (503); **never** acknowledge an uncommitted receipt.
   - `notion_webhook_inbox_sweep`: counts of claimed/done/retried/review,
     without personal information.
5. Once migration + deployed Worker are verified, open the Notion connection
   **Integration settings → Webhooks → Resume**. Do not assume Notion
   re-delivers every event from the paused interval; the existing hourly
   Notion sync remains the recovery path for missed changes.
6. Change **one innocuous field** in a linked test profile in Notion and check
   that it appears in Admin. Then change a different innocuous field in Admin
   and check Notion. Confirm both directions and no FB image changes.
7. Only then consider the incident closed. If Notion still pauses delivery,
   identify the actual HTTP status from Cloudflare and fix that cause.

## Read-only D1 checks

```sql
SELECT status, COUNT(*) AS events, MAX(attempts) AS max_attempts
FROM notion_webhook_inbox GROUP BY status ORDER BY status;

SELECT COUNT(*) AS due
FROM notion_webhook_inbox
WHERE status='PENDING' AND next_attempt_at <= unixepoch();

SELECT event_type, status, last_error_code, attempts, received_at
FROM notion_webhook_inbox
WHERE status='REVIEW' ORDER BY received_at LIMIT 30;
```

Only minimal event keys, page IDs, type and changed property identifiers are
stored. No article text, phone numbers, source bodies or Notion secrets.
Signed delivery is deduplicated by Notion event ID or a deterministic
body hash. The queue leases one event atomically at a time, retries transient
failures with bounded backoff, holds repeated failures for human review and
expires only completed receipts older than seven days.

## Boundaries

- **No new Cron** or external paid queue, and no extra Notion/FB credentials.
- Existing per-page owner checks, review gates, conflict rules and hourlies
  remain unchanged; Facebook images and Services V3 remain separate.
- A 200 means safely **queued**, **not** already synchronized.
- Only the owner manually merges/deploys/migrates/resumes the Notion webhook.
